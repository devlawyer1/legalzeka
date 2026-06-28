const { HybridLegalSearchService } = require('./hybridLegalSearchService');
const { LegalSearchRepository } = require('./legalSearchRepository');
const { LegalSearchCache } = require('./searchCache');

const repository = new LegalSearchRepository();
const cache = new LegalSearchCache({
  max: Number(process.env.LEGAL_SEARCH_CACHE_MAX || 500),
  ttlMs: Number(process.env.LEGAL_SEARCH_CACHE_TTL_MS || 5 * 60 * 1000),
});
const legalSearchService = new HybridLegalSearchService({ repository, cache });

module.exports = { cache, legalSearchService, repository };
