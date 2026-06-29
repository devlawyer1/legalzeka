const { performance } = require('node:perf_hooks');
const { z } = require('zod');
const { pool } = require('../../config/db');
const Case = require('../../models/Case');
const AuditLogService = require('../AuditLogService');
const { legalSearchService, repository } = require('../legalSearch');
const { sha256, stableStringify, tokenizeTurkish } = require('../legalSearch/normalization');
const { CitationVerifier } = require('./CitationVerifier');
const { LegalAnswerGenerator } = require('./LegalAnswerGenerator');
const { ResearchSessionService, httpError } = require('./ResearchSessionService');

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
});

const filtersSchema = z.object({
  sourceTypes: z.array(z.enum([
    'LEGISLATION',
    'LEGISLATION_VERSION',
    'COURT_DECISION',
    'CONSTITUTIONAL_COURT_DECISION',
    'ADMINISTRATIVE_DECISION',
    'ECHR_DECISION',
  ])).max(10).optional().default([]),
  courts: z.array(z.string().trim().min(1).max(200)).max(20).optional().default([]),
  chambers: z.array(z.string().trim().min(1).max(200)).max(20).optional().default([]),
  dateFrom: z.union([dateSchema, z.null()]).optional(),
  dateTo: z.union([dateSchema, z.null()]).optional(),
  legalDomain: z.string().trim().max(120).optional().nullable(),
  legislationName: z.string().trim().max(300).optional().nullable(),
  lawNumber: z.string().trim().max(50).optional().nullable(),
  articleNumber: z.string().trim().max(50).optional().nullable(),
}).strict();

const answerRequestSchema = z.object({
  query: z.string().trim().min(3).max(1000),
  sessionId: z.string().uuid().optional().nullable(),
  caseId: z.string().uuid().optional().nullable(),
  effectiveAt: z.union([dateSchema, z.null()]).optional(),
  filters: filtersSchema.optional().default({}),
  idempotencyKey: z.string().trim().min(8).max(160).optional().nullable(),
}).strict();

function uniqueBySource(results) {
  const seen = new Set();
  return results.filter((result) => {
    if (seen.has(result.sourceId)) return false;
    seen.add(result.sourceId);
    return true;
  });
}

function buildRetrievalQuery(query) {
  const terms = [...new Set(tokenizeTurkish(query))].slice(0, 16);
  return terms.length > 1 ? terms.join(' OR ') : String(query).trim();
}

function hasSufficientRetrievalEvidence(result, query) {
  const terms = [...new Set(tokenizeTurkish(query))];
  const requiredMatches = Math.min(3, Math.max(1, Math.ceil(terms.length * 0.3)));
  const lexicalMatches = (result.matchedTerms || []).filter((term) => term !== 'or').length;
  const semanticScore = Number(result.scoreBreakdown?.semanticScore || 0);
  return lexicalMatches >= requiredMatches || semanticScore >= 0.55;
}

function candidateFromResult(result, supportHint) {
  return {
    sourceId: result.sourceId,
    chunkId: result.metadata?.chunkId,
    supportHint,
    sourceType: result.sourceType,
    title: result.title,
    court: result.court,
    chamber: result.chamber,
    caseNumber: result.caseNumber,
    decisionNumber: result.decisionNumber,
    decisionDate: result.decisionDate,
    effectiveFrom: result.effectiveFrom,
    effectiveTo: result.effectiveTo,
    articleNumber: result.articleNumber,
    excerpt: result.excerpt,
    officialSource: result.officialSource,
    sourceUrl: result.sourceUrl,
    score: result.score,
    metadata: result.metadata || {},
  };
}

function costFromSearch(search) {
  return Number(search?.diagnostics?.usage?.embeddingEstimatedCost || 0)
    + Number(search?.diagnostics?.usage?.rerankerEstimatedCost || 0);
}

function historicalDifferenceWarnings(historicalResults, currentResults, effectiveAt) {
  if (!effectiveAt) return [];
  const warnings = [];
  const currentByLawArticle = new Map();
  for (const result of currentResults) {
    if (!['LEGISLATION', 'LEGISLATION_VERSION'].includes(result.sourceType)) continue;
    const key = `${result.metadata?.lawNumber || result.title}|${result.articleNumber || ''}`;
    currentByLawArticle.set(key, result);
  }
  for (const result of historicalResults) {
    if (!['LEGISLATION', 'LEGISLATION_VERSION'].includes(result.sourceType)) continue;
    const key = `${result.metadata?.lawNumber || result.title}|${result.articleNumber || ''}`;
    const current = currentByLawArticle.get(key);
    if (current && current.sourceId !== result.sourceId && current.excerpt !== result.excerpt) {
      warnings.push(
        `${result.title} için ${effectiveAt} tarihinde yürürlükte olan metin güncel metinden farklıdır.`
      );
    }
  }
  return [...new Set(warnings)];
}

function assignCitationOrders(citations) {
  const orderBySourceChunk = new Map();
  let nextOrder = 1;
  for (const citation of citations.filter((item) => item.verificationStatus !== 'REJECTED')) {
    const key = `${citation.sourceId}|${citation.chunkId}`;
    if (!orderBySourceChunk.has(key)) orderBySourceChunk.set(key, nextOrder++);
    citation.citationOrder = orderBySourceChunk.get(key);
  }
  for (const citation of citations.filter((item) => item.verificationStatus === 'REJECTED')) {
    citation.citationOrder = nextOrder++;
  }
  return orderBySourceChunk;
}

function formatAnswerText(structured) {
  const lines = [structured.summary];
  for (const claim of structured.analysis) {
    const references = (claim.citationOrders || []).map((order) => `[${order}]`).join('');
    lines.push(`${claim.text}${references ? ` ${references}` : ''}`);
  }
  if (structured.counterArguments.length) {
    lines.push('Karşıt görüşler:');
    for (const counter of structured.counterArguments) {
      const references = (counter.citationOrders || []).map((order) => `[${order}]`).join('');
      lines.push(`${counter.text}${references ? ` ${references}` : ''}`);
    }
  }
  return lines.join('\n\n');
}

class LegalResearchService {
  constructor({
    db = pool,
    searchService = legalSearchService,
    sourceRepository = repository,
    sessionService = null,
    answerGenerator = null,
    citationVerifier = null,
    auditLogService = AuditLogService,
  } = {}) {
    this.db = db;
    this.searchService = searchService;
    this.sourceRepository = sourceRepository;
    this.sessionService = sessionService || new ResearchSessionService({ db });
    this.answerGenerator = answerGenerator || new LegalAnswerGenerator();
    this.citationVerifier = citationVerifier || new CitationVerifier({ repository: sourceRepository });
    this.auditLogService = auditLogService;
  }

  async resolveCaseContext(caseId, accessContext) {
    if (!caseId) return null;
    const matter = await Case.findAccessibleById(caseId, accessContext, 'read');
    if (!matter) throw httpError(404, 'Dava bulunamadı.', 'MATTER_NOT_FOUND');
    const [parties, events] = await Promise.all([
      this.db.query(
        `SELECT name, party_type, role
         FROM matter_parties WHERE case_id = $1
         ORDER BY verified_at DESC LIMIT 10`,
        [caseId]
      ),
      this.db.query(
        `SELECT title, event_date, date_precision
         FROM matter_events WHERE case_id = $1
         ORDER BY event_date DESC NULLS LAST, verified_at DESC LIMIT 10`,
        [caseId]
      ),
    ]);
    return {
      id: matter.id,
      legalDomain: matter.legal_domain || null,
      organizationId: matter.scope_type === 'ORGANIZATION' ? matter.law_firm_id : null,
      ownerUserId: matter.scope_type === 'PERSONAL' ? matter.owner_user_id : null,
      parties: parties.rows,
      events: events.rows,
      safeSummary: {
        legalDomain: matter.legal_domain || null,
        parties: parties.rows.map((party) => ({ name: party.name, role: party.role, partyType: party.party_type })),
        events: events.rows.map((event) => ({ title: event.title, date: event.event_date, precision: event.date_precision })),
      },
    };
  }

  async createSession(input, accessContext) {
    const caseContext = await this.resolveCaseContext(input.caseId || null, accessContext);
    return this.sessionService.create({
      accessContext,
      title: input.title,
      organizationId: input.organizationId,
      caseContext,
      effectiveAt: input.effectiveAt,
      legalDomain: input.legalDomain,
    });
  }

  async _runSearch(query, request, context, overrides = {}) {
    const response = await this.searchService.search({
      query: buildRetrievalQuery(String(query).slice(0, 1000)),
      ...request.filters,
      effectiveAt: overrides.effectiveAt === undefined ? request.effectiveAt : overrides.effectiveAt,
      versionStatus: overrides.versionStatus || 'ALL',
      mode: 'HYBRID',
      caseId: request.caseId,
      page: 1,
      pageSize: Number(process.env.LEGAL_RESEARCH_SEARCH_LIMIT || 20),
    }, context);
    return {
      ...response,
      results: response.results.filter((result) => hasSufficientRetrievalEvidence(result, query)),
    };
  }

  async _verifyGeneratedAnswer(generated, candidateMap, accessScope, effectiveAt, baseWarnings) {
    const attempts = [];
    const acceptedAnalysis = [];
    const acceptedCounters = [];
    const warnings = [...baseWarnings, ...generated.warnings];

    const verifySources = async (claimKey, text, sourceIds, supportType) => {
      const results = [];
      for (const sourceId of sourceIds) {
        const result = await this.citationVerifier.verify({
          claimKey,
          claimText: text,
          sourceId,
          supportType,
          candidate: candidateMap.get(sourceId),
          accessScope,
          effectiveAt,
        });
        attempts.push(result);
        if (result.verificationStatus !== 'REJECTED') results.push(result);
      }
      return results;
    };

    for (const claim of generated.analysis) {
      const supporting = await verifySources(claim.claimKey, claim.text, claim.sourceIds, 'SUPPORTS');
      const contradicting = await verifySources(claim.claimKey, claim.text, claim.counterSourceIds, 'CONTRADICTS');
      if (supporting.length === 0) {
        warnings.push(`Bir hukuki iddia kaynakla doğrulanamadığı için cevap metninden çıkarıldı: ${claim.claimKey}`);
        continue;
      }
      acceptedAnalysis.push({ ...claim, _citations: [...supporting, ...contradicting] });
    }

    for (const [index, counter] of generated.counterArguments.entries()) {
      const claimKey = `counter-${index + 1}`;
      const citations = await verifySources(claimKey, counter.text, counter.sourceIds, 'CONTRADICTS');
      if (citations.length === 0) {
        warnings.push('Bir karşıt görüş kaynakla doğrulanamadığı için gösterilmedi.');
        continue;
      }
      acceptedCounters.push({ ...counter, claimKey, _citations: citations });
    }

    const orderMap = assignCitationOrders(attempts);
    const withOrders = (entry) => ({
      ...entry,
      citationOrders: [...new Set(entry._citations.map((citation) => (
        orderMap.get(`${citation.sourceId}|${citation.chunkId}`)
      )).filter(Boolean))],
      _citations: undefined,
    });
    return {
      structured: {
        summary: generated.summary,
        analysis: acceptedAnalysis.map(withOrders),
        counterArguments: acceptedCounters.map(withOrders),
        missingInformation: generated.missingInformation,
        warnings: [...new Set(warnings)],
        confidence: generated.confidence,
      },
      attempts,
    };
  }

  async answer(rawInput, accessContext, { idempotencyKey, requestId, req } = {}) {
    const started = performance.now();
    const request = answerRequestSchema.parse({
      ...rawInput,
      idempotencyKey: idempotencyKey || rawInput?.idempotencyKey || null,
    });
    let session = request.sessionId
      ? await this.sessionService.findAccessibleById(request.sessionId, accessContext)
      : null;
    if (request.sessionId && !session) {
      throw httpError(404, 'Araştırma oturumu bulunamadı.', 'RESEARCH_SESSION_NOT_FOUND');
    }
    if (session?.case_id && request.caseId && session.case_id !== request.caseId) {
      throw httpError(409, 'Araştırma oturumu farklı bir davaya bağlı.', 'RESEARCH_CASE_MISMATCH');
    }
    const caseId = request.caseId || session?.case_id || null;
    const caseContext = await this.resolveCaseContext(caseId, accessContext);
    if (!session) {
      session = await this.sessionService.create({
        accessContext,
        title: request.query,
        caseContext,
        effectiveAt: request.effectiveAt,
        legalDomain: request.filters.legalDomain,
      });
    }
    const effectiveAt = request.effectiveAt || (session.effective_at ? String(session.effective_at).slice(0, 10) : null);
    const normalizedRequest = {
      ...request,
      sessionId: session.id,
      caseId,
      effectiveAt,
    };
    const requestHash = sha256(stableStringify({
      query: request.query,
      sessionId: session.id,
      caseId,
      effectiveAt,
      filters: request.filters,
    }));
    const slot = await this.sessionService.beginAnswer({
      sessionId: session.id,
      accessContext,
      query: request.query,
      requestHash,
      idempotencyKey: request.idempotencyKey,
    });
    if (slot.existing) return this.sessionService.getAnswerPayload(slot.answerId, accessContext);

    const accessScope = {
      userId: accessContext.userId,
      organizationIds: accessContext.scopes.organizationIds,
    };
    const searchContext = {
      requestId,
      accessScope,
      caseContext,
      organizationId: caseContext?.organizationId || session.organization_id || null,
    };

    let usage = {};
    try {
      const searchStarted = performance.now();
      const supportSearch = await this._runSearch(request.query, normalizedRequest, searchContext);
      const counterSearch = await this._runSearch(
        `${request.query} aksi yönde istisna uygulanmaz ret karşı görüş`,
        normalizedRequest,
        searchContext
      );
      const requestedSourceTypes = request.filters.sourceTypes || [];
      const legislationRequested = requestedSourceTypes.length === 0
        || requestedSourceTypes.some((type) => ['LEGISLATION', 'LEGISLATION_VERSION'].includes(type));
      const legislationRequest = {
        ...normalizedRequest,
        filters: {
          ...normalizedRequest.filters,
          sourceTypes: ['LEGISLATION', 'LEGISLATION_VERSION'],
          legalDomain: null,
        },
      };
      const historicalLegislationSearch = effectiveAt && legislationRequested
        ? await this._runSearch(request.query, legislationRequest, searchContext)
        : { results: [], diagnostics: {} };
      const currentSearch = effectiveAt && legislationRequested
        ? await this._runSearch(request.query, legislationRequest, searchContext, {
            effectiveAt: null,
            versionStatus: 'CURRENT',
          })
        : { results: [], diagnostics: {} };
      const searchDurationMs = performance.now() - searchStarted;

      const supportLimit = Number(process.env.LEGAL_RESEARCH_SUPPORT_SOURCE_LIMIT || 8);
      const counterLimit = Number(process.env.LEGAL_RESEARCH_COUNTER_SOURCE_LIMIT || 4);
      const supportCandidates = uniqueBySource([
        ...supportSearch.results,
        ...historicalLegislationSearch.results,
      ]).slice(0, supportLimit);
      const supportIds = new Set(supportCandidates.map((result) => result.sourceId));
      const counterCandidates = uniqueBySource(counterSearch.results)
        .filter((result) => !supportIds.has(result.sourceId))
        .slice(0, counterLimit);
      const candidates = [
        ...supportCandidates.map((result) => candidateFromResult(result, 'SUPPORTS')),
        ...counterCandidates.map((result) => candidateFromResult(result, 'CONTRADICTS')),
      ].filter((candidate) => candidate.sourceId && candidate.chunkId && candidate.excerpt);
      const candidateMap = new Map(candidates.map((candidate) => [candidate.sourceId, candidate]));
      const baseWarnings = historicalDifferenceWarnings(
        historicalLegislationSearch.results,
        currentSearch.results,
        effectiveAt
      );
      if (counterCandidates.length === 0) {
        baseWarnings.push('Ayrı karşıt kaynak sorgusunda doğrulanabilir sonuç bulunamadı; bu durum karşıt görüş olmadığı anlamına gelmez.');
      }

      const searchEmbeddingCost = [
        supportSearch,
        counterSearch,
        historicalLegislationSearch,
        currentSearch,
      ]
        .reduce((sum, result) => sum + costFromSearch(result), 0);
      const cacheStatuses = [supportSearch, counterSearch, historicalLegislationSearch, currentSearch]
        .map((result) => result?.diagnostics?.cacheStatus)
        .filter(Boolean);
      const searchCacheStatus = cacheStatuses.length && cacheStatuses.every((status) => status === 'HIT')
        ? 'HIT'
        : 'MISS';

      if (supportCandidates.length === 0 || candidates.length === 0) {
        const structured = {
          summary: 'Getirilen hukuk kaynakları güvenilir bir cevap oluşturmak için yetersizdir.',
          analysis: [],
          counterArguments: [],
          missingInformation: ['Soruyu destekleyen doğrulanabilir hukuk kaynağı bulunamadı.'],
          warnings: baseWarnings,
          confidence: { level: 'LOW', reason: 'Doğrulanabilir kaynak bulunamadı.' },
        };
        const durationMs = performance.now() - started;
        await this.sessionService.completeAnswer({
          answerId: slot.answerId,
          answerText: structured.summary,
          structured,
          usage: {},
          metrics: {
            searchEmbeddingCost,
            totalCost: searchEmbeddingCost,
            searchDurationMs,
            durationMs,
            searchCacheStatus,
          },
          citations: [],
          status: 'INSUFFICIENT',
        });
        return this.sessionService.getAnswerPayload(slot.answerId, accessContext);
      }

      const sessionContext = {
        summary: session.session_summary || null,
        recentMessages: await this.sessionService.recentContext(session.id),
      };
      const generated = await this.answerGenerator.generate({
        question: request.query,
        effectiveAt,
        matterSummary: caseContext?.safeSummary || null,
        sessionContext,
        sources: candidates,
      });
      usage = generated.usage;

      const verifierStarted = performance.now();
      const verified = await this._verifyGeneratedAnswer(
        generated.answer,
        candidateMap,
        accessScope,
        effectiveAt,
        baseWarnings
      );
      const verifierDurationMs = performance.now() - verifierStarted;
      const verifierCost = verified.attempts.reduce((sum, item) => sum + Number(item.verifierCost || 0), 0);
      let status = 'COMPLETED';
      if (verified.structured.analysis.length === 0) {
        status = 'INSUFFICIENT';
        verified.structured.summary = 'Modelin ürettiği hukuki iddialar getirilen kaynaklarla doğrulanamadı.';
        verified.structured.confidence = {
          level: 'LOW',
          reason: 'Hiçbir hukuki iddia citation doğrulamasını geçemedi.',
        };
      }
      const answerText = formatAnswerText(verified.structured);
      const durationMs = performance.now() - started;
      const totalCost = searchEmbeddingCost + Number(usage.estimatedCost || 0) + verifierCost;
      await this.sessionService.completeAnswer({
        answerId: slot.answerId,
        answerText,
        structured: verified.structured,
        usage,
        metrics: {
          searchEmbeddingCost,
          rerankerCost: 0,
          verifierCost,
          totalCost,
          searchDurationMs,
          verifierDurationMs,
          durationMs,
          searchCacheStatus,
        },
        citations: verified.attempts,
        status,
      });
      await this.auditLogService.record({
        req,
        action: 'LEGAL_RESEARCH_COMPLETED',
        entityType: 'LEGAL_RESEARCH_ANSWER',
        entityId: slot.answerId,
        caseId,
        lawFirmId: session.organization_id,
        metadata: {
          sessionId: session.id,
          sourceCount: candidates.length,
          verifiedCitationCount: verified.attempts.filter((item) => item.verificationStatus !== 'REJECTED').length,
          status,
          durationMs: Math.round(durationMs),
          totalCost,
        },
      });
      return this.sessionService.getAnswerPayload(slot.answerId, accessContext);
    } catch (error) {
      await this.sessionService.failAnswer(slot.answerId, {
        code: error.code || 'LEGAL_RESEARCH_FAILED',
        usage: error.usage || usage,
        durationMs: performance.now() - started,
      });
      if (!error.status) error.status = error.code === 'UNKNOWN_SOURCE_ID' ? 502 : 500;
      throw error;
    }
  }

  async saveAnswerToMatter({ sessionId, answerId, accessContext, title }) {
    const session = await this.sessionService.findAccessibleById(sessionId, accessContext);
    if (!session?.case_id) throw httpError(409, 'Araştırma bir dava dosyasına bağlı değil.', 'RESEARCH_NOT_LINKED_TO_MATTER');
    const matter = await Case.findAccessibleById(session.case_id, accessContext, 'write');
    if (!matter) throw httpError(404, 'Dava bulunamadı.', 'MATTER_NOT_FOUND');
    return this.sessionService.saveToMatter({
      sessionId,
      answerId,
      caseId: session.case_id,
      accessContext,
      title,
    });
  }
}

module.exports = {
  LegalResearchService,
  answerRequestSchema,
  assignCitationOrders,
  candidateFromResult,
  formatAnswerText,
  historicalDifferenceWarnings,
};
