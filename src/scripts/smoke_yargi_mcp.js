require('dotenv').config();

const yargiMcpClient = require('../services/emsal/yargiMcpClient');

async function main() {
  const health = await yargiMcpClient.healthCheck();
  console.log(JSON.stringify({
    check: 'yargi_mcp_health',
    ok: health.ok,
    status: health.status,
    baseUrl: health.baseUrl,
    latencyMs: health.latencyMs,
    toolCount: health.details?.tool_count || health.details?.tools?.length || null,
  }, null, 2));

  if (!health.ok) {
    process.exitCode = 1;
    return;
  }

  const query = process.env.SMOKE_YARGI_QUERY || 'kira tahliye';
  const result = await yargiMcpClient.callTool('search_bedesten_unified', {
    phrase: query,
    court_types: ['YARGITAYKARARI'],
    pageNumber: 1,
  }, {
    timeout: parseInt(process.env.SMOKE_YARGI_TIMEOUT_MS || '20000', 10),
    cache: false,
  });

  const count = Array.isArray(result)
    ? result.length
    : (result?.data?.length || result?.decisions?.length || result?.results?.length || 0);

  console.log(JSON.stringify({
    check: 'yargi_mcp_tool',
    ok: true,
    tool: 'search_bedesten_unified',
    query,
    resultCount: count,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    check: 'yargi_mcp_smoke',
    ok: false,
    error: error.message,
    code: error.code || null,
  }, null, 2));
  process.exitCode = 1;
});
