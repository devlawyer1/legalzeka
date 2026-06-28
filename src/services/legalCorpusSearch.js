const { legalSearchService } = require('./legalSearch');
const { normalizeTurkish } = require('./legalSearch/normalization');

const LEGAL_CORPUS_ENABLED = process.env.LEGAL_CORPUS_ENABLED !== 'false';

function dateToYear(dateValue) {
  if (!dateValue) return null;
  const match = String(dateValue).match(/(19|20)\d{2}/);
  return match ? Number(match[0]) : null;
}

function legacyFilters(filters = {}) {
  const normalizedCourt = normalizeTurkish(filters.mahkeme);
  const legislationOnly = ['mevzuat', 'kanun', 'yasa'].some((term) => normalizedCourt.includes(term));
  return {
    sourceTypes: legislationOnly ? ['LEGISLATION', 'LEGISLATION_VERSION'] : [],
    courts: filters.mahkeme && !legislationOnly ? [filters.mahkeme] : [],
    dateFrom: filters.yilMin ? `${Number(filters.yilMin)}-01-01` : null,
    dateTo: filters.yilMax ? `${Number(filters.yilMax)}-12-31` : null,
    legalDomain: filters.hukuk_dali || null,
  };
}

function toLegacyResult(result) {
  const isLegislation = result.sourceType === 'LEGISLATION' || result.sourceType === 'LEGISLATION_VERSION';
  return {
    id: result.sourceId,
    type: isLegislation ? 'legislation' : 'decision',
    source: 'legal_corpus',
    source_label: isLegislation ? 'Mevzuat' : 'Legal Corpus',
    court: result.court || (isLegislation ? result.title : null),
    mahkeme: result.court || (isLegislation ? result.title : null),
    chamber: result.chamber,
    hukuk_dali: result.legalDomain || (isLegislation ? 'Mevzuat' : 'İçtihat'),
    konu: result.title,
    ozet: result.excerpt,
    snippet: result.excerpt,
    metin: result.excerpt,
    date: result.decisionDate || result.effectiveFrom || result.publicationDate,
    karar_yili: dateToYear(result.decisionDate || result.effectiveFrom || result.publicationDate),
    esas_no: result.caseNumber,
    karar_no: isLegislation ? result.articleNumber : result.decisionNumber,
    document_id: result.sourceId,
    source_document_id: result.sourceId,
    source_url: result.sourceUrl,
    fetch_status: 'indexed',
    cache_status: 'legal_corpus',
    relevance_verified: true,
    confidence: result.score,
    score: result.score,
    score_breakdown: result.scoreBreakdown,
    matched_terms: result.matchedTerms,
    highlights: {},
  };
}

async function searchLegalCorpus({ query, mode = 'keyword', filters = {}, limit = 30 } = {}) {
  if (!LEGAL_CORPUS_ENABLED) return { results: [], diagnostics: { enabled: false } };
  const mapped = legacyFilters(filters);
  const response = await legalSearchService.search({
    query,
    ...mapped,
    mode: mode === 'keyword' ? 'KEYWORD' : 'HYBRID',
    page: 1,
    pageSize: Math.min(Math.max(Number(limit) || 30, 1), 50),
  }, {
    accessScope: { userId: null, organizationIds: [] },
  });
  return {
    results: response.results.map(toLegacyResult),
    diagnostics: {
      enabled: true,
      ...response.diagnostics,
      resultCount: response.results.length,
    },
  };
}

module.exports = { searchLegalCorpus };
