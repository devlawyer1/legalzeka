const { searchLegalSources } = require('./researchProvider');

/**
 * Legacy compatibility wrapper.
 *
 * Older code called this function as an on-demand UYAP Emsal fetcher. The
 * production search flow now lives in searchOrchestrator, where MCP results are
 * normalized, merged, reranked, and indexed in the background.
 */
async function fetchFromEmsalGovTr(query) {
  console.log(`[MCP Emsal Fetch] "${query}" icin orchestrator uzerinden Emsal aranıyor...`);

  try {
    const result = await searchLegalSources({
      query,
      mode: 'legacy_fetch',
      page: 1,
      limit: 5,
      sources: ['emsal'],
      includeLive: true,
      indexLiveResults: true,
    });

    return result.results || [];
  } catch (error) {
    console.error('[MCP Emsal Fetch] Orchestrator hatasi:', error.message);
    return [];
  }
}

module.exports = { fetchFromEmsalGovTr };
