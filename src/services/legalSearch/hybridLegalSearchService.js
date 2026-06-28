const { performance } = require('node:perf_hooks');
const { z } = require('zod');
const { generateEmbedding } = require('../../utils/embedding');
const { LegalSearchRepository } = require('./legalSearchRepository');
const { LegalSearchCache } = require('./searchCache');
const {
  SOURCE_TYPES,
  normalizeTurkish,
  sha256,
  tokenizeTurkish,
} = require('./normalization');

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const dateSchema = z.string().regex(ISO_DATE).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Invalid calendar date');

const optionalDate = z.union([dateSchema, z.null()]).optional();
const filterText = z.string().trim().min(1).max(200);
const searchInputSchema = z.object({
  query: z.string().trim().min(2).max(1000),
  sourceTypes: z.array(z.enum(SOURCE_TYPES)).max(10).optional().default([]),
  courts: z.array(filterText).max(20).optional().default([]),
  chambers: z.array(filterText).max(20).optional().default([]),
  dateFrom: optionalDate,
  dateTo: optionalDate,
  caseNumber: z.string().trim().max(100).optional().nullable(),
  decisionNumber: z.string().trim().max(100).optional().nullable(),
  legalDomain: z.string().trim().max(120).optional().nullable(),
  legislationName: z.string().trim().max(300).optional().nullable(),
  lawNumber: z.string().trim().max(50).optional().nullable(),
  articleNumber: z.string().trim().max(50).optional().nullable(),
  effectiveAt: optionalDate,
  versionStatus: z.enum(['ALL', 'CURRENT', 'HISTORICAL']).optional().default('ALL'),
  mode: z.enum(['HYBRID', 'KEYWORD', 'SEMANTIC']).optional().default('HYBRID'),
  caseId: z.string().uuid().optional().nullable(),
  page: z.coerce.number().int().min(1).max(1000).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).optional().default(20),
}).strict().superRefine((value, context) => {
  if (value.dateFrom && value.dateTo && value.dateFrom > value.dateTo) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['dateTo'], message: 'dateTo must not precede dateFrom' });
  }
});

function parseSearchRequest(input) {
  const parsed = searchInputSchema.parse(input || {});
  return {
    query: parsed.query,
    normalizedQuery: normalizeTurkish(parsed.query),
    effectiveAt: parsed.effectiveAt || null,
    versionStatus: parsed.versionStatus,
    mode: parsed.mode,
    caseId: parsed.caseId || null,
    page: parsed.page,
    pageSize: parsed.pageSize,
    filters: {
      sourceTypes: parsed.sourceTypes,
      courts: parsed.courts,
      chambers: parsed.chambers,
      dateFrom: parsed.dateFrom || null,
      dateTo: parsed.dateTo || null,
      caseNumber: parsed.caseNumber || null,
      decisionNumber: parsed.decisionNumber || null,
      legalDomain: parsed.legalDomain || null,
      legislationName: parsed.legislationName || null,
      lawNumber: parsed.lawNumber || null,
      articleNumber: parsed.articleNumber || null,
    },
  };
}

function clampScore(value) {
  return Math.max(0, Math.min(1, Number(value || 0)));
}

function normalizeKeywordScore(value) {
  const raw = Math.max(0, Number(value || 0));
  return raw === 0 ? 0 : raw / (raw + 0.1);
}

function groundedExcerpt(content, query, maxLength = 700) {
  const source = String(content || '');
  if (source.length <= maxLength) return source;
  const lower = source.toLocaleLowerCase('tr-TR');
  const terms = tokenizeTurkish(query);
  const firstMatch = terms
    .map((term) => lower.indexOf(term))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  const center = Number.isFinite(firstMatch) ? firstMatch : 0;
  const start = Math.max(0, Math.min(center - 180, source.length - maxLength));
  return source.slice(start, start + maxLength).trim();
}

function matchedTerms(query, content) {
  const normalizedContent = normalizeTurkish(content);
  return [...new Set(tokenizeTurkish(query).filter((term) => normalizedContent.includes(term)))];
}

function defaultReranker(candidates, { query, caseContext } = {}) {
  const terms = tokenizeTurkish(query);
  return candidates.map((candidate) => {
    const matches = matchedTerms(query, `${candidate.title || ''} ${candidate.chunk_content || ''}`);
    const termCoverage = terms.length ? matches.length / terms.length : 0;
    const official = candidate.official_source ? 0.2 : 0;
    const identity = candidate.case_number || candidate.decision_number ? 0.1 : 0;
    const contextDomain = caseContext?.legalDomain
      && normalizeTurkish(candidate.legal_domain).includes(normalizeTurkish(caseContext.legalDomain))
      ? 0.1
      : 0;
    return { ...candidate, rerank_score: clampScore(termCoverage * 0.6 + official + identity + contextDomain) };
  });
}

function mergeWithRrf(keywordRows, semanticRows, reranker, context) {
  const merged = new Map();
  const sets = [
    { name: 'keyword', weight: 1.15, rows: keywordRows },
    { name: 'semantic', weight: 1.0, rows: semanticRows },
  ];
  for (const set of sets) {
    set.rows.forEach((row, index) => {
      const key = row.chunk_id;
      const existing = merged.get(key) || {
        ...row,
        keyword_score: 0,
        semantic_score: 0,
        rrf_score: 0,
        retrieval: {},
      };
      existing.keyword_score = Math.max(Number(existing.keyword_score || 0), Number(row.keyword_score || 0));
      existing.semantic_score = Math.max(Number(existing.semantic_score || 0), Number(row.semantic_score || 0));
      const contribution = set.weight / (60 + index + 1);
      existing.rrf_score += contribution;
      existing.retrieval[set.name] = { rank: index + 1, contribution };
      merged.set(key, existing);
    });
  }

  const reranked = reranker([...merged.values()], context);
  const maxRrf = reranked.length
    ? Math.max(...reranked.map((item) => item.rrf_score))
    : 1;
  return reranked.map((item) => {
    const keywordScore = normalizeKeywordScore(item.keyword_score);
    const semanticScore = clampScore(item.semantic_score);
    const rrfScore = clampScore(item.rrf_score / maxRrf);
    const rerankScore = clampScore(item.rerank_score);
    const weights = {
      keyword: keywordScore > 0 ? 0.35 : 0,
      semantic: semanticScore > 0 ? 0.35 : 0,
      rrf: 0.2,
      rerank: 0.1,
    };
    const weightTotal = Object.values(weights).reduce((total, weight) => total + weight, 0) || 1;
    const finalScore = (
      keywordScore * weights.keyword
      + semanticScore * weights.semantic
      + rrfScore * weights.rrf
      + rerankScore * weights.rerank
    ) / weightTotal;
    return {
      ...item,
      keywordScore,
      semanticScore,
      rrfScore,
      rerankScore,
      finalScore,
    };
  }).sort((left, right) => right.finalScore - left.finalScore);
}

function groupBySource(candidates, query) {
  const grouped = new Map();
  for (const candidate of candidates) {
    const excerpt = groundedExcerpt(candidate.chunk_content, query);
    const match = {
      chunkId: candidate.chunk_id,
      chunkType: candidate.chunk_type,
      articleNumber: candidate.article_number,
      excerpt,
      matchedTerms: matchedTerms(query, candidate.chunk_content),
      score: Number(candidate.finalScore.toFixed(6)),
      scoreBreakdown: {
        keywordScore: Number(candidate.keywordScore.toFixed(6)),
        semanticScore: Number(candidate.semanticScore.toFixed(6)),
        rrfScore: Number(candidate.rrfScore.toFixed(6)),
        rerankScore: Number(candidate.rerankScore.toFixed(6)),
        finalScore: Number(candidate.finalScore.toFixed(6)),
        retrieval: candidate.retrieval,
      },
    };
    const existing = grouped.get(candidate.source_id);
    if (existing) {
      if (existing.otherMatches.length < 5) existing.otherMatches.push(match);
      continue;
    }
    grouped.set(candidate.source_id, {
      sourceId: candidate.source_id,
      sourceType: candidate.source_type,
      title: candidate.title,
      court: candidate.court,
      chamber: candidate.chamber,
      caseNumber: candidate.case_number,
      decisionNumber: candidate.decision_number,
      decisionDate: candidate.decision_date,
      publicationDate: candidate.publication_date,
      effectiveFrom: candidate.chunk_effective_from || candidate.source_effective_from,
      effectiveTo: candidate.chunk_effective_to || candidate.source_effective_to,
      legalDomain: candidate.legal_domain,
      excerpt,
      chunkType: candidate.chunk_type,
      articleNumber: candidate.article_number,
      matchedTerms: match.matchedTerms,
      score: match.score,
      scoreBreakdown: match.scoreBreakdown,
      officialSource: candidate.official_source,
      sourceUrl: candidate.source_url,
      metadata: {
        ...(candidate.source_metadata || {}),
        chunkId: candidate.chunk_id,
        chunkIndex: candidate.chunk_index,
        chunkHeading: candidate.heading,
      },
      otherMatches: [],
    });
  }
  return [...grouped.values()];
}

class HybridLegalSearchService {
  constructor({
    repository = new LegalSearchRepository(),
    cache = new LegalSearchCache(),
    embedQuery = generateEmbedding,
    reranker = defaultReranker,
    semanticEnabled = process.env.LEGAL_CORPUS_SEMANTIC_ENABLED === 'true',
  } = {}) {
    this.repository = repository;
    this.cache = cache;
    this.embedQuery = embedQuery;
    this.reranker = reranker;
    this.semanticEnabled = semanticEnabled;
  }

  async _recordMetric(metric) {
    try {
      await this.repository.recordMetric(metric);
    } catch (error) {
      if (process.env.NODE_ENV !== 'test') {
        console.error('[LegalSearch] metric write failed:', error.message);
      }
    }
  }

  async search(input, context = {}) {
    const started = performance.now();
    const request = parseSearchRequest(input);
    const accessScope = context.accessScope || { userId: null, organizationIds: [] };
    const corpusVersion = await this.repository.getCorpusVersion();
    const cacheKey = this.cache.createKey({
      request,
      accessScope,
      caseContext: context.caseContext,
      corpusVersion,
    });
    const queryHash = sha256(request.normalizedQuery);
    const baseMetric = {
      requestId: context.requestId,
      queryHash,
      queryLength: request.query.length,
      normalizedTermCount: tokenizeTurkish(request.normalizedQuery).length,
      userId: accessScope.userId,
      organizationId: context.organizationId || null,
      caseId: context.caseContext?.id || null,
      corpusVersion,
      embeddingProvider: process.env.EMBEDDING_PROVIDER || 'tei',
      embeddingModel: process.env.EMBEDDING_MODEL || 'intfloat/multilingual-e5-large',
    };

    const cached = this.cache.get(cacheKey);
    if (cached) {
      const response = {
        ...cached,
        diagnostics: { ...cached.diagnostics, cacheStatus: 'HIT' },
      };
      await this._recordMetric({
        ...baseMetric,
        durationMs: performance.now() - started,
        resultCount: response.results.length,
        cacheStatus: 'HIT',
      });
      return response;
    }

    let fullTextMs = 0;
    let vectorSearchMs = 0;
    let rerankMs = 0;
    let embeddingInputTokens = 0;
    let embeddingEstimatedCost = 0;
    try {
      const candidateLimit = Math.min(Math.max(request.pageSize * request.page * 5, 50), 250);
      const contextTerms = [
        context.caseContext?.legalDomain,
        ...(context.caseContext?.events || []).slice(0, 8).map((event) => event.title),
      ].filter(Boolean);
      const contextualQuery = [request.query, ...contextTerms].join(' | ').slice(0, 1500);

      const keywordPromise = request.mode === 'SEMANTIC'
        ? Promise.resolve([])
        : (async () => {
            const timestamp = performance.now();
            const rows = await this.repository.keywordSearch(
              request.query,
              request,
              accessScope,
              candidateLimit
            );
            fullTextMs = performance.now() - timestamp;
            return rows;
          })();

      const semanticPromise = (!this.semanticEnabled || request.mode === 'KEYWORD')
        ? Promise.resolve([])
        : (async () => {
            const timestamp = performance.now();
            embeddingInputTokens = Math.max(1, Math.ceil(contextualQuery.length / 4));
            const costPerThousand = Number(process.env.EMBEDDING_COST_PER_1K_TOKENS || 0);
            embeddingEstimatedCost = (embeddingInputTokens / 1000) * costPerThousand;
            const vector = await this.embedQuery(`query: ${contextualQuery}`);
            const rows = await this.repository.semanticSearch(vector, request, accessScope, candidateLimit);
            vectorSearchMs = performance.now() - timestamp;
            return rows;
          })();

      const [keywordSettled, semanticSettled] = await Promise.allSettled([keywordPromise, semanticPromise]);
      const keywordRows = keywordSettled.status === 'fulfilled' ? keywordSettled.value : [];
      const semanticRows = semanticSettled.status === 'fulfilled' ? semanticSettled.value : [];
      if (keywordSettled.status === 'rejected' && semanticSettled.status === 'rejected') {
        throw new Error('Both legal search retrieval paths failed.');
      }

      const rerankStarted = performance.now();
      const ranked = mergeWithRrf(keywordRows, semanticRows, this.reranker, {
        query: request.query,
        caseContext: context.caseContext,
      });
      const grouped = groupBySource(ranked, request.query);
      rerankMs = performance.now() - rerankStarted;
      const offset = (request.page - 1) * request.pageSize;
      const results = grouped.slice(offset, offset + request.pageSize);
      const response = {
        query: request.query,
        page: request.page,
        pageSize: request.pageSize,
        totalResults: grouped.length,
        results,
        diagnostics: {
          cacheStatus: 'MISS',
          corpusVersion,
          keywordCandidates: keywordRows.length,
          semanticCandidates: semanticRows.length,
          groupedSources: grouped.length,
          keywordError: keywordSettled.status === 'rejected' ? keywordSettled.reason.message : null,
          semanticError: semanticSettled.status === 'rejected' ? semanticSettled.reason.message : null,
          timings: {
            fullTextMs: Math.round(fullTextMs),
            vectorSearchMs: Math.round(vectorSearchMs),
            rerankMs: Math.round(rerankMs),
            totalMs: Math.round(performance.now() - started),
          },
        },
      };
      this.cache.set(cacheKey, response);
      await this._recordMetric({
        ...baseMetric,
        durationMs: performance.now() - started,
        fullTextMs,
        vectorSearchMs,
        rerankMs,
        resultCount: results.length,
        embeddingInputTokens,
        embeddingEstimatedCost,
        cacheStatus: 'MISS',
      });
      return response;
    } catch (error) {
      await this._recordMetric({
        ...baseMetric,
        durationMs: performance.now() - started,
        fullTextMs,
        vectorSearchMs,
        rerankMs,
        embeddingInputTokens,
        embeddingEstimatedCost,
        resultCount: 0,
        cacheStatus: 'BYPASS',
        success: false,
        safeErrorCode: error.code || 'LEGAL_SEARCH_FAILED',
      });
      throw error;
    }
  }
}

module.exports = {
  HybridLegalSearchService,
  defaultReranker,
  groundedExcerpt,
  groupBySource,
  mergeWithRrf,
  parseSearchRequest,
  searchInputSchema,
};
