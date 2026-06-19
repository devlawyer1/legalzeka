const { pool } = require('../../config/db');
const { generateEmbedding } = require('../../utils/embedding');
const yargiMcpClient = require('./yargiMcpClient');
const { fetchDecisionDocument, hydrateDecisionsForRag, indexDecisionsInBackground } = require('./mcpIngestor');

const DEFAULT_LIMIT = 20;
const DEFAULT_PAGE = 1;
const CANDIDATE_MULTIPLIER = 3;
const RRF_K = 60;
const MCP_TIMEOUT_MS = parseInt(process.env.EMSAL_MCP_SOURCE_TIMEOUT_MS || '16000', 10);
const MCP_VERIFY_LIMIT = parseInt(process.env.EMSAL_MCP_VERIFY_LIMIT || '8', 10);
const LOCAL_VECTOR_MIN_SCORE = parseFloat(process.env.EMSAL_VECTOR_MIN_SCORE || '0.62');
const MIN_DOCUMENT_TEXT_LENGTH = 80;
const CURRENT_YEAR = new Date().getFullYear();

const QUERY_STOPWORDS = new Set([
  'bir', 've', 'ile', 'icin', 'için', 'gibi', 'olan', 'karar', 'emsal', 'dava',
  'hukuk', 'hukuki', 'ilgili', 'dair', 'nedir', 'nelerdir', 'bul', 'ara',
]);

const SOURCE_LABELS = {
  local: 'Yerel Indeks',
  bedesten: 'Bedesten',
  emsal: 'UYAP Emsal',
  gib: 'GIB Ozelge',
  rekabet: 'Rekabet Kurumu',
  kvkk: 'KVKK',
  bddk: 'BDDK',
  sigorta_tahkim: 'Sigorta Tahkim',
  kik: 'Kamu Ihale Kurulu',
  sayistay: 'Sayistay',
  anayasa: 'Anayasa Mahkemesi',
  uyusmazlik: 'Uyusmazlik Mahkemesi',
};

const DOMAIN_ROUTES = [
  { source: 'gib', patterns: [/vergi/i, /kdv/i, /otv/i, /gelir verg/i, /kurumlar verg/i, /damga verg/i, /ozelge/i, /özelge/i] },
  { source: 'rekabet', patterns: [/rekabet/i, /kartel/i, /hakim durum/i, /birlesme/i, /birleşme/i, /devralma/i] },
  { source: 'kvkk', patterns: [/kvkk/i, /kisisel veri/i, /kişisel veri/i, /acik riza/i, /açık rıza/i, /veri ihlal/i] },
  { source: 'bddk', patterns: [/bddk/i, /banka/i, /bankacilik/i, /bankacılık/i, /finansal kuruluş/i, /odeme hizmet/i, /ödeme hizmet/i] },
  { source: 'sigorta_tahkim', patterns: [/sigorta/i, /kasko/i, /trafik poli/i, /dask/i, /tahkim/i] },
  { source: 'kik', patterns: [/ihale/i, /kamu ihale/i, /\bkik\b/i, /yaklasik maliyet/i, /yaklaşık maliyet/i] },
  { source: 'sayistay', patterns: [/sayistay/i, /sayıştay/i, /kamu zarari/i, /kamu zararı/i, /ilam/i, /temyiz kurulu/i] },
  { source: 'anayasa', patterns: [/anayasa/i, /aym/i, /bireysel basvuru/i, /bireysel başvuru/i, /hak ihlal/i, /norm denetimi/i] },
  { source: 'uyusmazlik', patterns: [/uyusmazlik/i, /uyuşmazlık/i, /gorev uyusmaz/i, /görev uyuşmaz/i, /hukum uyusmaz/i, /hüküm uyuşmaz/i] },
];

function cleanLLMOutput(text) {
  if (!text) return text;
  const str = text.toString().trim();
  if (str.startsWith('{') || str.startsWith('[')) {
    try {
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed[0].answer || parsed[0].ozet || parsed[0].articleText || str;
      }
      return parsed.answer || parsed.ozet || parsed.articleText || str;
    } catch (_) {
      return str;
    }
  }
  return str;
}

function normalizeQuery(query) {
  return String(query || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parsePositiveInt(value, fallback, maxValue = 100) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maxValue);
}

function tokenize(query) {
  return normalizeQuery(query)
    .toLocaleLowerCase('tr-TR')
    .split(/[^a-zA-Z0-9çğıöşüÇĞİÖŞÜ]+/u)
    .filter((token) => token.length > 2);
}

function meaningfulTerms(query) {
  return tokenize(query).filter((term) => !QUERY_STOPWORDS.has(term));
}

function normalizeForMatch(value) {
  return String(value || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSearchableText(result, includeFullText = true) {
  const fields = [
    result.karar_no,
    result.esas_no,
    result.court,
    result.mahkeme,
    result.konu,
    result.ozet,
    result.snippet,
  ];

  if (includeFullText) {
    fields.push(result.metin);
  }

  return normalizeForMatch(fields.filter(Boolean).join(' '));
}

function matchedTermsForResult(query, result, includeFullText = true) {
  const haystack = buildSearchableText(result, includeFullText);
  if (!haystack) return [];
  return [...new Set(meaningfulTerms(query).filter((term) => haystack.includes(term)))];
}

function exactIdentifierTerms(query) {
  return normalizeQuery(query).match(/\b(?:19|20)\d{2}\/\d+\b/g) || [];
}

function hasExactIdentifierMatch(query, result) {
  const ids = exactIdentifierTerms(query);
  if (ids.length === 0) return false;
  const haystack = normalizeForMatch([result.karar_no, result.esas_no, result.document_id, result.id].filter(Boolean).join(' '));
  return ids.some((id) => haystack.includes(id.toLocaleLowerCase('tr-TR')));
}

function requiredPhraseGroups(query) {
  const normalized = normalizeForMatch(query);
  const groups = [];

  if (normalized.includes('işe iade') || normalized.includes('ise iade')) {
    groups.push(['işe iade', 'ise iade', 'işe iadesi', 'ise iadesi']);
  }
  if (normalized.includes('hak düşürücü') || normalized.includes('hak dusurucu')) {
    groups.push(['hak düşürücü', 'hak dusurucu']);
  }
  if (normalized.includes('kira bedelinin tespiti')) {
    groups.push(['kira bedelinin tespiti', 'kira tespiti']);
  }
  if (normalized.includes('itirazın iptali') || normalized.includes('itirazin iptali')) {
    groups.push(['itirazın iptali', 'itirazin iptali']);
  }

  return groups;
}

function satisfiesRequiredPhrases(query, result) {
  const groups = requiredPhraseGroups(query);
  if (groups.length === 0) return true;
  const haystack = buildSearchableText(result, true);
  return groups.every((group) => group.some((phrase) => haystack.includes(phrase)));
}

function validateDateText(dateText) {
  if (!dateText) return null;
  const normalized = String(dateText);
  const match = normalized.match(/(1[89]\d{2}|20\d{2}|21\d{2}|[3-9]\d{3})/);
  if (!match) return normalized;
  const year = parseInt(match[0], 10);
  if (year < 1900 || year > CURRENT_YEAR + 1) return null;
  return normalized;
}

function confidenceForResult(result, query, retrievalType) {
  const matchedTerms = result.matched_terms || matchedTermsForResult(query, result);
  const termCount = Math.max(meaningfulTerms(query).length, 1);
  const lexicalRatio = matchedTerms.length / termCount;
  const rawScore = Number(result.score || result.score_breakdown?.[retrievalType] || 0);

  if (retrievalType === 'local_vector') {
    return Number(Math.min(0.95, Math.max(0.45, rawScore)).toFixed(2));
  }

  if (retrievalType === 'local_fts') {
    return Number(Math.min(0.98, 0.62 + lexicalRatio * 0.25 + Math.min(rawScore, 1) * 0.1).toFixed(2));
  }

  return Number(Math.min(0.9, 0.58 + lexicalRatio * 0.25 + (hasExactIdentifierMatch(query, result) ? 0.12 : 0)).toFixed(2));
}

function truncate(text, maxLength = 500) {
  if (!text) return '';
  const normalized = cleanLLMOutput(text).replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
}

function parseMaybeJson(value) {
  if (!value || typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return value;
  }
}

function toIsoDate(year, endOfYear = false) {
  if (!year) return '';
  const parsed = parseInt(year, 10);
  if (!Number.isFinite(parsed)) return '';
  return `${parsed}-${endOfYear ? '12-31' : '01-01'}`;
}

function toEmsalDate(year, endOfYear = false) {
  if (!year) return '';
  const parsed = parseInt(year, 10);
  if (!Number.isFinite(parsed)) return '';
  return `${endOfYear ? '31.12' : '01.01'}.${parsed}`;
}

function buildFilterWhere(filters = {}, startParam = 1) {
  const clauses = [];
  const params = [];
  let index = startParam;

  if (filters.mahkeme) {
    const courtFilter = normalizeForMatch(filters.mahkeme);
    let courtPattern = filters.mahkeme;
    if (courtFilter.includes('yargitay') || courtFilter.includes('yargıtay')) {
      courtPattern = 'Yargıtay';
    } else if (courtFilter.includes('danistay') || courtFilter.includes('danıştay')) {
      courtPattern = 'Danıştay';
    } else if (courtFilter.includes('bam') || courtFilter.includes('istinaf') || courtFilter.includes('bölge adliye') || courtFilter.includes('bolge adliye')) {
      courtPattern = 'Bölge Adliye';
    }
    clauses.push(`mahkeme ILIKE $${index++}`);
    params.push(`%${courtPattern}%`);
  }
  if (filters.hukuk_dali) {
    clauses.push(`hukuk_dali ILIKE $${index++}`);
    params.push(`%${filters.hukuk_dali}%`);
  }
  if (filters.yilMin) {
    clauses.push(`karar_yili >= $${index++}`);
    params.push(parseInt(filters.yilMin, 10));
  }
  if (filters.yilMax) {
    clauses.push(`karar_yili <= $${index++}`);
    params.push(parseInt(filters.yilMax, 10));
  }

  return { clauses, params, nextParam: index };
}

function normalizeLocalRow(row, retrievalType, query) {
  const date = row.karar_yili ? String(row.karar_yili) : null;
  const snippet = truncate(row.ozet || row.metin || row.konu, 650);
  const source = row.source || 'local';
  const matchedTerms = matchedTermsForResult(query, {
    ...row,
    court: row.mahkeme,
    snippet,
  });

  const normalized = {
    ...row,
    source,
    source_label: SOURCE_LABELS[source] || (source === 'local' ? SOURCE_LABELS.local : source),
    court: row.mahkeme || null,
    date,
    esas_no: row.esas_no || null,
    document_id: row.source_document_id || (row.id ? String(row.id) : null),
    source_url: row.source_url || null,
    snippet,
    ozet: cleanLLMOutput(row.ozet),
    metin: cleanLLMOutput(row.metin),
    fetch_status: row.verification_status || 'indexed',
    cache_status: source === 'local' ? 'local_index' : 'cached_mcp',
    fetched_at: row.fetched_at || null,
    matched_terms: matchedTerms,
    relevance_verified: true,
    score_breakdown: {
      [retrievalType]: Number(row.score || 0),
    },
    highlights: {},
  };

  return {
    ...normalized,
    confidence: confidenceForResult(normalized, query, retrievalType),
  };
}

async function localKeywordSearch(query, filters, limit) {
  const filterWhere = buildFilterWhere(filters, 2);
  const clauses = [`search_vector @@ websearch_to_tsquery('turkish', $1)`, ...filterWhere.clauses];
  const params = [query, ...filterWhere.params, limit];

  const result = await pool.query(
    `SELECT id, karar_no, karar_yili, mahkeme, hukuk_dali, konu, ozet, metin, anahtar_kelimeler,
            source, source_document_id, source_url, verification_status, fetched_at,
            ts_rank(search_vector, websearch_to_tsquery('turkish', $1)) AS score
     FROM emsal_kararlar
     WHERE ${clauses.join(' AND ')}
     ORDER BY score DESC
     LIMIT $${filterWhere.nextParam}`,
    params
  );

  return result.rows
    .map((row) => normalizeLocalRow(row, 'local_fts', query))
    .filter((row) => satisfiesRequiredPhrases(query, row));
}

async function localVectorSearch(query, filters, limit) {
  const queryVector = await generateEmbedding(query);
  const vectorString = `[${queryVector.join(',')}]`;
  const filterWhere = buildFilterWhere(filters, 2);
  const whereString = ['embedding IS NOT NULL', ...filterWhere.clauses].join(' AND ');
  const params = [vectorString, ...filterWhere.params, limit];

  const result = await pool.query(
    `SELECT id, karar_no, karar_yili, mahkeme, hukuk_dali, konu, ozet, metin, anahtar_kelimeler,
            source, source_document_id, source_url, verification_status, fetched_at,
            1 - (embedding <=> $1::vector) AS score
     FROM emsal_kararlar
     WHERE ${whereString}
     ORDER BY embedding <=> $1::vector
     LIMIT $${filterWhere.nextParam}`,
    params
  );

  return result.rows
    .filter((row) => Number(row.score || 0) >= LOCAL_VECTOR_MIN_SCORE)
    .map((row) => normalizeLocalRow(row, 'local_vector', query))
    .filter((row) => satisfiesRequiredPhrases(query, row));
}

function routeSources(query, requestedSources) {
  if (requestedSources && requestedSources.length > 0) {
    return [...new Set(requestedSources.map((source) => source.trim()).filter(Boolean))];
  }

  const routed = new Set(['bedesten', 'emsal']);
  for (const route of DOMAIN_ROUTES) {
    if (route.patterns.some((pattern) => pattern.test(query))) {
      routed.add(route.source);
    }
  }

  return [...routed].slice(0, 5);
}

function buildMcpCalls(source, query, filters) {
  const isoStart = toIsoDate(filters.yilMin, false);
  const isoEnd = toIsoDate(filters.yilMax, true);
  const emsalStart = toEmsalDate(filters.yilMin, false);
  const emsalEnd = toEmsalDate(filters.yilMax, true);
  const keywords = tokenize(query).slice(0, 8);

  switch (source) {
    case 'bedesten':
      return [{
        source,
        toolName: 'search_bedesten_unified',
        args: {
          phrase: query,
          court_types: ['YARGITAYKARARI', 'DANISTAYKARAR', 'YERELHUKUK', 'ISTINAFHUKUK', 'KYB'],
          pageNumber: 1,
          kararTarihiStart: isoStart,
          kararTarihiEnd: isoEnd,
        },
      }];
    case 'emsal':
      return [{
        source,
        toolName: 'search_emsal_detailed_decisions',
        args: {
          keyword: query,
          page_number: 1,
          start_date: emsalStart,
          end_date: emsalEnd,
        },
      }];
    case 'gib':
      return [{ source, toolName: 'search_gib_ozelge', args: { keywords: query, page: 1, pageSize: 10 } }];
    case 'rekabet':
      return [{ source, toolName: 'search_rekabet_kurumu_decisions', args: { PdfText: query, page: 1 } }];
    case 'kvkk':
      return [{ source, toolName: 'search_kvkk_decisions', args: { keywords: query, page: 1 } }];
    case 'bddk':
      return [{ source, toolName: 'search_bddk_decisions', args: { keywords: query, page: 1 } }];
    case 'sigorta_tahkim':
      return [{ source, toolName: 'search_sigorta_tahkim_decisions', args: { keywords: query, page: 1 } }];
    case 'kik':
      return [{ source, toolName: 'search_kik_v2_decisions', args: { karar_metni: query } }];
    case 'sayistay':
      return [
        { source, toolName: 'search_sayistay_unified', args: { decision_type: 'daire', web_karar_metni: query, length: 10 } },
        { source, toolName: 'search_sayistay_unified', args: { decision_type: 'temyiz_kurulu', temyiz_karar: query, length: 10 } },
      ];
    case 'anayasa':
      return [
        { source, toolName: 'search_anayasa_unified', args: { decision_type: 'bireysel_basvuru', keywords, results_per_page: 10 } },
        { source, toolName: 'search_anayasa_unified', args: { decision_type: 'norm_denetimi', keywords_all: keywords, results_per_page: 10 } },
      ];
    case 'uyusmazlik':
      return [{ source, toolName: 'search_uyusmazlik_decisions', args: { icerik: query } }];
    default:
      return [];
  }
}

function pickItemTypeName(decision) {
  if (!decision.itemType) return '';
  if (typeof decision.itemType === 'string') return decision.itemType;
  return decision.itemType.description || decision.itemType.name || '';
}

function normalizeMcpDecision(source, decision, callMeta = {}) {
  const itemTypeName = pickItemTypeName(decision);
  const court = decision.birimAdi || decision.daire || decision.chamber || decision.court || itemTypeName || SOURCE_LABELS[source];
  const kararNo = decision.kararNo || decision.karar_no || decision.uyusmazlikKararNo || decision.ozelgeNo || decision.decision_reference_no || decision.karar_no || null;
  const esasNo = decision.esasNo || decision.esas_no || decision.case_number || null;
  const date = validateDateText(decision.kararTarihiStr || decision.kararTarihi || decision.karar_tarih || decision.ozelgeTarih || decision.decision_date_summary || decision.yayinlanmaTarihi || null);
  const documentId = decision.documentId || decision.id || decision.gundemMaddesiId || decision.document_id || decision.ozelge_id || decision.decision_page_url || decision.decision_url || null;
  const title = decision.title || decision.basvuruKonusu || decision.application_subject_summary || decision.karar_ozeti || decision.web_karar_konusu || court;
  const snippet = truncate(
    decision.preview ||
    decision.text ||
    decision.content ||
    decision.karar ||
    decision.karar_ozeti ||
    decision.temyiz_karar ||
    decision.web_karar_metni ||
    decision.subject_summary ||
    decision.application_subject_summary ||
    title,
    700
  );

  return {
    id: documentId ? String(documentId) : undefined,
    source,
    source_label: SOURCE_LABELS[source] || source,
    court,
    date,
    esas_no: esasNo,
    karar_no: kararNo,
    karar_yili: date && String(date).match(/(19|20)\d{2}/) ? parseInt(String(date).match(/(19|20)\d{2}/)[0], 10) : null,
    mahkeme: court,
    hukuk_dali: SOURCE_LABELS[source] || source,
    konu: title,
    ozet: snippet,
    metin: '',
    anahtar_kelimeler: [],
    document_id: documentId ? String(documentId) : null,
    source_url: decision.source_url || decision.url || decision.siteLink || decision.document_url || decision.decision_page_url || null,
    snippet,
    fetch_status: 'metadata_only',
    decision_type: decision.decision_type || callMeta.args?.decision_type || null,
    score_breakdown: {
      mcp_source: source,
      mcp_tool: callMeta.toolName,
    },
    highlights: {},
    raw: decision,
  };
}

function extractDecisions(source, rawResult, callMeta) {
  const result = parseMaybeJson(rawResult);
  if (!result || typeof result !== 'object') return [];

  const list =
    result.decisions ||
    result.results ||
    result.ozelgeler ||
    result.matches ||
    result.data?.decisions ||
    result.data?.emsalKararList ||
    [];

  if (!Array.isArray(list)) return [];
  return list.map((decision) => normalizeMcpDecision(source, decision, callMeta));
}

async function searchMcpSource(callMeta) {
  try {
    const raw = await yargiMcpClient.callTool(callMeta.toolName, callMeta.args, {
      retries: 1,
      timeout: MCP_TIMEOUT_MS,
    });
    return {
      source: callMeta.source,
      status: 'fulfilled',
      results: extractDecisions(callMeta.source, raw, callMeta),
    };
  } catch (error) {
    return {
      source: callMeta.source,
      status: 'rejected',
      error: error.message,
      results: [],
    };
  }
}

function minimumMatchedTerms(query) {
  const terms = meaningfulTerms(query);
  if (terms.length <= 2) return 1;
  return 2;
}

function shouldKeepVerifiedMcpResult(query, result) {
  if (!result.metin || result.metin.trim().length < MIN_DOCUMENT_TEXT_LENGTH) return false;
  if (!satisfiesRequiredPhrases(query, result)) return false;
  if (hasExactIdentifierMatch(query, result)) return true;
  return (result.matched_terms || []).length >= minimumMatchedTerms(query);
}

async function verifyMcpResults(query, results) {
  const candidates = results.slice(0, Math.max(1, MCP_VERIFY_LIMIT));
  const settled = await Promise.allSettled(candidates.map(async (decision) => {
    const document = await fetchDecisionDocument(decision);
    const fullText = document.text || '';
    if (!fullText || fullText.trim().length < MIN_DOCUMENT_TEXT_LENGTH) return null;

    const snippet = truncate(fullText, 700);
    const hydrated = {
      ...decision,
      metin: fullText,
      snippet,
      ozet: decision.ozet && decision.ozet !== decision.court ? decision.ozet : snippet,
      fetch_status: document.fetch_status || 'fetched',
      relevance_verified: true,
    };
    const matchedTerms = matchedTermsForResult(query, hydrated, true);
    const withRelevance = {
      ...hydrated,
      matched_terms: matchedTerms,
    };

    if (!shouldKeepVerifiedMcpResult(query, withRelevance)) return null;

    return {
      ...withRelevance,
      confidence: confidenceForResult(withRelevance, query, 'mcp_verified'),
    };
  }));

  return settled
    .filter((entry) => entry.status === 'fulfilled' && entry.value)
    .map((entry) => entry.value);
}

function resultKey(result) {
  const court = (result.court || result.mahkeme || '').toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();
  const karar = (result.karar_no || '').toLocaleLowerCase('tr-TR').trim();
  const esas = (result.esas_no || '').toLocaleLowerCase('tr-TR').trim();
  const date = (result.date || result.karar_yili || '').toString().slice(0, 10);

  if (court && karar) return `${court}|${karar}|${esas}|${date}`;
  if (result.source && result.document_id) return `${result.source}|${result.document_id}`;
  if (result.id) return `${result.source || 'unknown'}|${result.id}`;
  return `${result.source || 'unknown'}|${result.konu || result.snippet || Math.random()}`;
}

function lexicalBoost(query, result) {
  const terms = meaningfulTerms(query);
  if (terms.length === 0) return 0;

  const matched = result.matched_terms || matchedTermsForResult(query, result);
  const exactNumber = hasExactIdentifierMatch(query, result);

  return (matched.length / terms.length) * 0.08 + (exactNumber ? 0.2 : 0);
}

function authorityBoost(result) {
  if (result.source !== 'local' && !result.relevance_verified) return 0;
  const text = `${result.court || ''} ${result.source || ''}`.toLocaleLowerCase('tr-TR');
  if (text.includes('yargıtay') || text.includes('yargitay') || text.includes('danıştay') || text.includes('danistay')) return 0.04;
  if (text.includes('anayasa') || text.includes('uyuşmazlık') || text.includes('uyusmazlik')) return 0.035;
  if (text.includes('bam') || text.includes('bölge adliye') || text.includes('bolge adliye')) return 0.025;
  return 0;
}

function localSourceBoost(result) {
  if (result.source !== 'local') return 0;
  const sources = result.score_breakdown?.sources_seen || [];
  if (sources.includes('local_fts')) return 0.08;
  if (sources.includes('local_vector')) return 0.04;
  return 0.04;
}

function reciprocalRankFusion(query, resultSets) {
  const merged = new Map();

  for (const set of resultSets) {
    const weight = set.weight || 1;
    set.results.forEach((result, index) => {
      const key = resultKey(result);
      const rrf = weight / (RRF_K + index + 1);
      const existing = merged.get(key);

      if (existing) {
        existing.rrf_score += rrf;
        existing.sources_seen.push(set.name);
        existing.result.score_breakdown[set.name] = {
          rank: index + 1,
          rrf,
          raw_score: result.score || result.score_breakdown?.local_fts || result.score_breakdown?.local_vector || null,
        };
        if (!existing.result.metin && result.metin) existing.result.metin = result.metin;
        if (!existing.result.snippet && result.snippet) existing.result.snippet = result.snippet;
      } else {
        merged.set(key, {
          rrf_score: rrf,
          sources_seen: [set.name],
          result: {
            ...result,
            score_breakdown: {
              ...(result.score_breakdown || {}),
              [set.name]: {
                rank: index + 1,
                rrf,
                raw_score: result.score || result.score_breakdown?.local_fts || result.score_breakdown?.local_vector || null,
              },
            },
          },
        });
      }
    });
  }

  return [...merged.values()]
    .map((entry) => {
      entry.result.score_breakdown.sources_seen = entry.sources_seen;
      const lexical = lexicalBoost(query, entry.result);
      const authority = authorityBoost(entry.result);
      const localBoost = localSourceBoost(entry.result);
      const rerank = lexical + authority + localBoost;
      const finalScore = entry.rrf_score + rerank;
      return {
        ...entry.result,
        score: finalScore,
        score_breakdown: {
          ...entry.result.score_breakdown,
          rrf: entry.rrf_score,
          lexical_boost: lexical,
          authority_boost: authority,
          local_source_boost: localBoost,
          sources_seen: entry.sources_seen,
        },
      };
    })
    .sort((a, b) => b.score - a.score);
}

async function searchEmsal({
  query,
  mode = 'keyword',
  page = DEFAULT_PAGE,
  limit = DEFAULT_LIMIT,
  filters = {},
  sources = [],
  includeLive = true,
  indexLiveResults = true,
} = {}) {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) {
    throw new Error('Arama sorgusu bos olamaz.');
  }

  const safePage = parsePositiveInt(page, DEFAULT_PAGE, 1000);
  const safeLimit = parsePositiveInt(limit, DEFAULT_LIMIT, 100);
  const candidateLimit = Math.max(safeLimit * CANDIDATE_MULTIPLIER, 30);
  const routedSources = routeSources(normalizedQuery, sources);

  const localResults = await Promise.allSettled([
    localKeywordSearch(normalizedQuery, filters, candidateLimit),
    localVectorSearch(normalizedQuery, filters, candidateLimit),
  ]);

  const resultSets = [];
  const diagnostics = {
    query: normalizedQuery,
    mode,
    routedSources,
    local: {},
    mcp: [],
  };

  const localKeyword = localResults[0].status === 'fulfilled' ? localResults[0].value : [];
  const localVector = localResults[1].status === 'fulfilled' ? localResults[1].value : [];

  diagnostics.local.keyword_count = localKeyword.length;
  diagnostics.local.vector_count = localVector.length;
  if (localResults[0].status === 'rejected') diagnostics.local.keyword_error = localResults[0].reason.message;
  if (localResults[1].status === 'rejected') diagnostics.local.vector_error = localResults[1].reason.message;

  resultSets.push({ name: 'local_fts', weight: 1.25, results: localKeyword });
  resultSets.push({ name: 'local_vector', weight: mode === 'keyword' ? 1.0 : 1.2, results: localVector });

  if (includeLive && process.env.EMSAL_LIVE_MCP !== 'false') {
    const calls = routedSources.flatMap((source) => buildMcpCalls(source, normalizedQuery, filters));
    const mcpResults = await Promise.all(calls.map((call) => searchMcpSource(call)));

    for (const sourceResult of mcpResults) {
      const verifiedResults = sourceResult.status === 'fulfilled'
        ? await verifyMcpResults(normalizedQuery, sourceResult.results)
        : [];
      diagnostics.mcp.push({
        source: sourceResult.source,
        status: sourceResult.status,
        raw_count: sourceResult.results.length,
        verified_count: verifiedResults.length,
        hidden_count: Math.max(sourceResult.results.length - verifiedResults.length, 0),
        error: sourceResult.error,
      });
      resultSets.push({
        name: `mcp_${sourceResult.source}`,
        weight: sourceResult.source === 'bedesten' ? 0.95 : 0.85,
        results: verifiedResults,
      });
    }
  }

  const merged = reciprocalRankFusion(normalizedQuery, resultSets);
  const offset = (safePage - 1) * safeLimit;
  const paged = merged.slice(offset, offset + safeLimit);

  if (indexLiveResults) {
    indexDecisionsInBackground(paged, normalizedQuery);
  }

  return {
    query: normalizedQuery,
    mode,
    page: safePage,
    limit: safeLimit,
    results: paged,
    totalResults: merged.length,
    diagnostics,
  };
}

module.exports = {
  cleanLLMOutput,
  hydrateDecisionsForRag,
  searchEmsal,
};
