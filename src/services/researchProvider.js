const { searchEmsal, hydrateDecisionsForRag } = require('./emsal/searchOrchestrator');

async function searchLegalSources({
  query,
  mode = 'semantic',
  page = 1,
  limit = 8,
  filters = {},
  sources = [],
  includeLive = true,
  indexLiveResults = true,
} = {}) {
  return searchEmsal({
    query,
    mode,
    page,
    limit,
    filters,
    sources,
    includeLive,
    indexLiveResults,
  });
}

async function hydrateLegalSources(results, maxDocuments = 4) {
  return hydrateDecisionsForRag(results, maxDocuments);
}

module.exports = {
  hydrateLegalSources,
  searchLegalSources,
};
