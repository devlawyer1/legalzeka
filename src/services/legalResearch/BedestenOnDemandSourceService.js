const axios = require('axios');
const cheerio = require('cheerio');
const { LRUCache } = require('lru-cache');
const { LegalSourceIngestionService } = require('../legalSearch/legalSourceIngestionService');
const { normalizeTurkish, sha256, stableStringify, tokenizeTurkish } = require('../legalSearch/normalization');

const BASE_URL = 'https://bedesten.adalet.gov.tr';
const APP_NAME = 'UyapMevzuat';
const SEARCH_ENDPOINT = '/emsal-karar/searchDocuments';
const DOCUMENT_ENDPOINT = '/emsal-karar/getDocumentContent';
const OFFICIAL_PORTAL_URL = 'https://mevzuat.adalet.gov.tr/';

const HEADERS = Object.freeze({
  Accept: '*/*',
  'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
  AdaletApplicationName: APP_NAME,
  'Content-Type': 'application/json; charset=utf-8',
  Origin: OFFICIAL_PORTAL_URL.replace(/\/$/, ''),
  Referer: OFFICIAL_PORTAL_URL,
  'User-Agent': 'LegalZeka/1.0 legal-research',
});

function envBool(name, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') return fallback;
  return ['1', 'true', 'yes', 'evet'].includes(String(raw).toLocaleLowerCase('tr-TR'));
}

function envInt(name, fallback, minimum = 1, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(process.env[name], 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(parsed, maximum));
}

function toApiDate(value, endOfDay = false) {
  if (!value) return null;
  const date = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return `${date}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`;
}

function defaultStartDate(years) {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - years);
  return date.toISOString();
}

function normalizeDecisionDate(value) {
  const raw = String(value || '').trim();
  const local = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (local) {
    const [, day, month, year] = local;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function htmlToText(html) {
  const $ = cheerio.load(String(html || ''));
  $('script, style, noscript').remove();
  $('br').replaceWith('\n');
  $('p, div, li, tr, h1, h2, h3, h4, h5, h6').each((_, element) => {
    $(element).append('\n');
  });
  return $.root().text()
    .replace(/\r/g, '')
    .replace(/[\t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function queryPhrase(query) {
  return [...new Set(tokenizeTurkish(query))]
    .slice(0, 12)
    .join(' ')
    .slice(0, 300);
}

function safeItemMetadata(item) {
  return {
    documentId: item.documentId || null,
    itemType: item.itemType || item.kararTuru || null,
    chamber: item.birimAdi || null,
    caseNumber: item.esasNo || null,
    decisionNumber: item.kararNo || null,
    decisionDate: item.kararTarihiStr || item.kararTarihi || null,
  };
}

function safeErrorCode(error) {
  if (error?.code === 'ON_DEMAND_CIRCUIT_OPEN') return error.code;
  if (error?.code === 'ON_DEMAND_CONCURRENCY_LIMIT') return error.code;
  if (error?.response?.status === 429) return 'BEDESTEN_RATE_LIMITED';
  if (error?.code === 'BEDESTEN_API_ERROR') return error.code;
  if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') return 'BEDESTEN_TIMEOUT';
  return 'BEDESTEN_UNAVAILABLE';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(error) {
  const status = Number(error?.response?.status || 0);
  return error?.code === 'BEDESTEN_API_ERROR'
    || error?.code === 'ECONNABORTED'
    || error?.code === 'ETIMEDOUT'
    || status === 429
    || status >= 500;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  if (!items.length) return [];
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: workers }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = await mapper(items[index], index);
      } catch (error) {
        results[index] = null;
      }
    }
  }));
  return results.filter(Boolean);
}

class BedestenOnDemandSourceService {
  constructor({
    db,
    ingestionService = new LegalSourceIngestionService({ db }),
    httpClient = null,
    enabled = envBool('LEGAL_RESEARCH_ON_DEMAND_ENABLED', false),
    minLocalSources = envInt('LEGAL_RESEARCH_ON_DEMAND_MIN_LOCAL_SOURCES', 2, 1, 8),
    maxDocuments = envInt('LEGAL_RESEARCH_ON_DEMAND_MAX_DOCUMENTS', 5, 1, 10),
    timeoutMs = envInt('LEGAL_RESEARCH_ON_DEMAND_TIMEOUT_MS', 20000, 1000, 60000),
    cacheTtlMs = envInt('LEGAL_RESEARCH_ON_DEMAND_CACHE_TTL_MS', 900000, 1000),
    cacheMax = envInt('LEGAL_RESEARCH_ON_DEMAND_CACHE_MAX', 500, 10, 5000),
    maxConcurrentRequests = envInt('LEGAL_RESEARCH_ON_DEMAND_CONCURRENCY', 2, 1, 8),
    documentConcurrency = envInt('LEGAL_RESEARCH_ON_DEMAND_DOCUMENT_CONCURRENCY', 2, 1, 3),
    requestDelayMs = envInt('LEGAL_RESEARCH_ON_DEMAND_REQUEST_DELAY_MS', 750, 0, 5000),
    retryAttempts = envInt('LEGAL_RESEARCH_ON_DEMAND_RETRY_ATTEMPTS', 1, 0, 2),
    retryBaseDelayMs = envInt('LEGAL_RESEARCH_ON_DEMAND_RETRY_BASE_DELAY_MS', 2000, 100, 30000),
    circuitFailures = envInt('LEGAL_RESEARCH_ON_DEMAND_CIRCUIT_FAILURES', 3, 1, 10),
    circuitCooldownMs = envInt('LEGAL_RESEARCH_ON_DEMAND_CIRCUIT_COOLDOWN_MS', 60000, 1000),
    years = envInt('LEGAL_RESEARCH_ON_DEMAND_YEARS', 5, 1, 20),
  } = {}) {
    this.ingestionService = ingestionService;
    this.enabled = enabled;
    this.minLocalSources = minLocalSources;
    this.maxDocuments = maxDocuments;
    this.documentConcurrency = documentConcurrency;
    this.maxConcurrentRequests = maxConcurrentRequests;
    this.requestDelayMs = requestDelayMs;
    this.retryAttempts = retryAttempts;
    this.retryBaseDelayMs = retryBaseDelayMs;
    this.circuitFailures = circuitFailures;
    this.circuitCooldownMs = circuitCooldownMs;
    this.years = years;
    this.activeRequests = 0;
    this.consecutiveFailures = 0;
    this.circuitOpenUntil = 0;
    this.lastRequestAt = 0;
    this.requestSlot = Promise.resolve();
    this.cache = new LRUCache({ max: cacheMax, ttl: cacheTtlMs });
    this.httpClient = httpClient || axios.create({
      baseURL: BASE_URL,
      headers: HEADERS,
      timeout: timeoutMs,
      maxContentLength: 8 * 1024 * 1024,
      maxBodyLength: 1024 * 1024,
    });
  }

  shouldHydrate({ localSourceCount, request }) {
    if (!this.enabled || Number(localSourceCount || 0) >= this.minLocalSources) return false;
    const sourceTypes = request?.filters?.sourceTypes || [];
    if (sourceTypes.length && !sourceTypes.includes('COURT_DECISION')) return false;
    return true;
  }

  _assertAvailable() {
    if (this.circuitOpenUntil > Date.now()) {
      const error = new Error('Bedesten on-demand circuit is open.');
      error.code = 'ON_DEMAND_CIRCUIT_OPEN';
      throw error;
    }
    if (this.activeRequests >= this.maxConcurrentRequests) {
      const error = new Error('Bedesten on-demand concurrency limit reached.');
      error.code = 'ON_DEMAND_CONCURRENCY_LIMIT';
      throw error;
    }
  }

  _recordSuccess() {
    this.consecutiveFailures = 0;
    this.circuitOpenUntil = 0;
  }

  _recordFailure() {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.circuitFailures) {
      this.circuitOpenUntil = Date.now() + this.circuitCooldownMs;
    }
  }

  async _waitForRequestSlot() {
    const previous = this.requestSlot;
    let release;
    this.requestSlot = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      const remaining = this.requestDelayMs - (Date.now() - this.lastRequestAt);
      if (remaining > 0) await sleep(remaining);
      this.lastRequestAt = Date.now();
    } finally {
      release();
    }
  }

  _retryDelay(error, attempt) {
    const retryAfter = Number(error?.response?.headers?.['retry-after']);
    if (Number.isFinite(retryAfter) && retryAfter >= 0) {
      return Math.min(retryAfter * 1000, 30000);
    }
    return Math.min(this.retryBaseDelayMs * (2 ** attempt), 30000);
  }

  async _post(endpoint, payload) {
    let lastError;
    for (let attempt = 0; attempt <= this.retryAttempts; attempt += 1) {
      try {
        await this._waitForRequestSlot();
        const response = await this.httpClient.post(endpoint, payload);
        const body = response?.data || {};
        const metadata = body.metadata || {};
        if (metadata.FMTY === 'ERROR') {
          const error = new Error(metadata.FMTE || metadata.FMU || 'Bedesten API error.');
          error.code = 'BEDESTEN_API_ERROR';
          throw error;
        }
        this._recordSuccess();
        return body;
      } catch (error) {
        lastError = error;
        if (attempt >= this.retryAttempts || !isRetryable(error)) break;
        await sleep(this._retryDelay(error, attempt));
      }
    }
    this._recordFailure();
    throw lastError;
  }

  async _search(query, filters) {
    const from = toApiDate(filters?.dateFrom) || defaultStartDate(this.years);
    const to = toApiDate(filters?.dateTo, true) || new Date().toISOString();
    const body = await this._post(SEARCH_ENDPOINT, {
      data: {
        pageSize: this.maxDocuments,
        pageNumber: 1,
        itemTypeList: ['YARGITAYKARARI'],
        phrase: queryPhrase(query),
        kararTarihiStart: from,
        kararTarihiEnd: to,
        sortFields: ['KARAR_TARIHI'],
        sortDirection: 'desc',
      },
      applicationName: APP_NAME,
      paging: true,
    });
    return ((body.data || {}).emsalKararList || []).slice(0, this.maxDocuments);
  }

  async _fetchDecision(item, queryHash) {
    const documentId = String(item.documentId || '').trim();
    if (!documentId) return null;
    const body = await this._post(DOCUMENT_ENDPOINT, {
      data: { documentId },
      applicationName: APP_NAME,
    });
    const data = body.data || {};
    if (!data.content) return null;
    const mimeType = String(data.mimeType || 'text/html').toLocaleLowerCase('en-US');
    if (!['text/html', 'text/plain'].includes(mimeType)) return null;
    const decoded = Buffer.from(data.content, 'base64').toString('utf8');
    const content = mimeType === 'text/html' ? htmlToText(decoded) : decoded.trim();
    if (content.length < 250) return null;
    const itemMetadata = safeItemMetadata(item);
    return {
      sourceName: 'bedesten_yargitay',
      sourceType: 'COURT_DECISION',
      externalId: documentId,
      sourceUrl: OFFICIAL_PORTAL_URL,
      officialSource: true,
      trustScore: 1,
      court: 'Yargıtay',
      chamber: item.birimAdi || null,
      caseNumber: item.esasNo || null,
      decisionNumber: item.kararNo || null,
      decisionDate: normalizeDecisionDate(item.kararTarihiStr || item.kararTarihi),
      content,
      metadata: {
        onDemand: true,
        provider: 'bedesten',
        documentId,
        retrievalQueryHash: queryHash,
        item: itemMetadata,
      },
      originMetadata: {
        provider: 'bedesten',
        documentId,
        item: itemMetadata,
      },
      fetchedAt: new Date().toISOString(),
    };
  }

  async hydrate({ query, filters = {}, requestId = null }) {
    if (!this.enabled) return { attempted: false, reason: 'DISABLED', ingestedCount: 0 };
    const phrase = queryPhrase(query);
    if (!phrase) return { attempted: false, reason: 'EMPTY_QUERY', ingestedCount: 0 };
    const cacheKey = sha256(stableStringify({
      phrase: normalizeTurkish(phrase),
      dateFrom: filters.dateFrom || null,
      dateTo: filters.dateTo || null,
    }));
    const cached = this.cache.get(cacheKey);
    if (cached) return { ...cached, cacheHit: true, requestId };

    try {
      this._assertAvailable();
    } catch (error) {
      return {
        attempted: false,
        ingestedCount: 0,
        safeErrorCode: safeErrorCode(error),
      };
    }

    this.activeRequests += 1;
    try {
      const items = await this._search(phrase, filters);
      const records = await mapWithConcurrency(
        items,
        this.documentConcurrency,
        (item) => this._fetchDecision(item, cacheKey)
      );
      const ingested = [];
      for (const record of records) {
        try {
          ingested.push(await this.ingestionService.ingestDecision(record));
        } catch (error) {
          if (process.env.NODE_ENV !== 'test') {
            console.warn('[LegalResearch] Bedesten decision ingestion failed:', error.message);
          }
        }
      }
      const result = {
        attempted: true,
        cacheHit: false,
        remoteResultCount: items.length,
        fetchedCount: records.length,
        ingestedCount: ingested.length,
        newSourceCount: ingested.filter((entry) => entry.canonicalChanged).length,
      };
      this.cache.set(cacheKey, result);
      return { ...result, requestId };
    } catch (error) {
      if (process.env.NODE_ENV !== 'test') {
        console.warn('[LegalResearch] Bedesten on-demand retrieval unavailable:', safeErrorCode(error));
      }
      return {
        attempted: true,
        cacheHit: false,
        remoteResultCount: 0,
        fetchedCount: 0,
        ingestedCount: 0,
        safeErrorCode: safeErrorCode(error),
        requestId,
      };
    } finally {
      this.activeRequests = Math.max(0, this.activeRequests - 1);
    }
  }
}

module.exports = {
  BedestenOnDemandSourceService,
  htmlToText,
  normalizeDecisionDate,
  queryPhrase,
};
