const { LRUCache } = require('lru-cache');
const { sha256, stableStringify } = require('./normalization');

class LegalSearchCache {
  constructor({ max = 500, ttlMs = 5 * 60 * 1000 } = {}) {
    this.cache = new LRUCache({ max, ttl: ttlMs });
  }

  createKey({ request, accessScope, caseContext, corpusVersion }) {
    return sha256(stableStringify({
      query: request.normalizedQuery,
      filters: request.filters,
      page: request.page,
      pageSize: request.pageSize,
      effectiveAt: request.effectiveAt,
      versionStatus: request.versionStatus,
      corpusVersion,
      scope: {
        userId: accessScope.userId || null,
        organizationIds: [...(accessScope.organizationIds || [])].sort(),
        caseId: caseContext?.id || null,
        caseOwnerId: caseContext?.ownerUserId || null,
        caseContextHash: caseContext
          ? sha256(stableStringify({
              legalDomain: caseContext.legalDomain || null,
              events: (caseContext.events || []).map((event) => event.title),
            }))
          : null,
      },
    }));
  }

  get(key) {
    const value = this.cache.get(key);
    return value ? structuredClone(value) : null;
  }

  set(key, value) {
    this.cache.set(key, structuredClone(value));
  }

  clear() {
    this.cache.clear();
  }
}

module.exports = { LegalSearchCache };
