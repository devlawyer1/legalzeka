const yargiMcpClient = require('../services/emsal/yargiMcpClient');

exports.health = async (req, res) => {
  const health = await yargiMcpClient.healthCheck();
  res.status(health.ok ? 200 : 503).json({
    success: health.ok,
    message: health.ok ? 'Yargi MCP servisi calisiyor.' : 'Yargi MCP servisi gecici olarak kullanilamiyor.',
    data: health,
  });
};

/**
 * Generic handler for Yargı-MCP search tools
 * Expects req.params.source (e.g. 'yargitay', 'danistay')
 */
exports.search = async (req, res) => {
  try {
    const { source } = req.params;
    let body = req.body || {};
    
    // Determine the tool name based on source
    // These must match the @app.tool() names in mcp_server_main.py exactly
    let toolName = '';
    switch(source) {
      case 'yargitay':
        toolName = 'search_bedesten_unified';
        body = {
          phrase: body.phrase || body.q || body.query || body.arananKelime || '',
          court_types: ['YARGITAYKARARI'],
          pageNumber: body.pageNumber || body.page || 1,
        };
        break;
      case 'danistay':
        toolName = 'search_bedesten_unified';
        body = {
          phrase: body.phrase || body.q || body.query || body.arananKelime || '',
          court_types: ['DANISTAYKARAR'],
          pageNumber: body.pageNumber || body.page || 1,
        };
        break;
      case 'emsal': toolName = 'search_emsal_detailed_decisions'; break;
      case 'uyusmazlik': toolName = 'search_uyusmazlik_decisions'; break;
      case 'anayasa': toolName = 'search_anayasa_unified'; break;
      case 'kik': toolName = 'search_kik_v2_decisions'; break;
      case 'rekabet': toolName = 'search_rekabet_kurumu_decisions'; break;
      case 'kvkk': toolName = 'search_kvkk_decisions'; break;
      case 'bddk': toolName = 'search_bddk_decisions'; break;
      case 'gib': toolName = 'search_gib_ozelge'; break;
      case 'sigorta_tahkim': toolName = 'search_sigorta_tahkim_decisions'; break;
      case 'sayistay': toolName = 'search_sayistay_unified'; break;
      case 'bedesten': toolName = 'search_bedesten_unified'; break;
      case 'bedesten_semantic': toolName = 'search_bedesten_semantic'; break;
      default:
        return res.status(400).json({ success: false, error: `Geçersiz kaynak (source): ${source}` });
    }

    // Call the dynamic tool with the body arguments
    const result = await yargiMcpClient.callTool(toolName, body);
    res.json({
      success: true,
      data: result,
      meta: {
        source,
        toolName,
        cachePolicy: 'adapter_lru',
      },
    });
  } catch (error) {
    console.error(`Yargi Search Error (${req.params.source}):`, error);
    const status = ['MCP_CIRCUIT_OPEN', 'MCP_CONCURRENCY_LIMIT'].includes(error.code) ? 503 : 500;
    res.status(status).json({
      success: false,
      code: error.code || 'YARGI_SEARCH_FAILED',
      error: `${req.params.source} araması sırasında bir hata oluştu.`,
      details: error.message,
    });
  }
};

/**
 * Generic handler for Yargı-MCP document retrieval tools
 * Expects req.params.source
 */
exports.getDocument = async (req, res) => {
  try {
    const { source } = req.params;
    let body = req.body || {};
    
    let toolName = '';
    switch(source) {
      case 'yargitay':
      case 'danistay':
        toolName = 'get_bedesten_document_markdown';
        body = { documentId: body.documentId || body.id };
        break;
      case 'emsal': toolName = 'get_emsal_document_markdown'; break;
      case 'uyusmazlik': toolName = 'get_uyusmazlik_document_markdown_from_url'; break;
      case 'anayasa': toolName = 'get_anayasa_document_unified'; break;
      case 'kik': toolName = 'get_kik_v2_document_markdown'; break;
      case 'rekabet': toolName = 'get_rekabet_kurumu_document'; break;
      case 'kvkk': toolName = 'get_kvkk_document_markdown'; break;
      case 'bddk': toolName = 'get_bddk_document_markdown'; break;
      case 'gib': toolName = 'get_gib_ozelge_document_markdown'; break;
      case 'sigorta_tahkim': toolName = 'get_sigorta_tahkim_document_markdown'; break;
      case 'sayistay': toolName = 'get_sayistay_document_unified'; break;
      case 'bedesten': toolName = 'get_bedesten_document_markdown'; break;
      default:
        return res.status(400).json({ success: false, error: `Geçersiz kaynak (source): ${source}` });
    }

    const result = await yargiMcpClient.callTool(toolName, body);
    res.json({
      success: true,
      data: result,
      meta: {
        source,
        toolName,
        cachePolicy: 'adapter_lru',
      },
    });
  } catch (error) {
    console.error(`Yargi Document Error (${req.params.source}):`, error);
    const status = ['MCP_CIRCUIT_OPEN', 'MCP_CONCURRENCY_LIMIT'].includes(error.code) ? 503 : 500;
    res.status(status).json({
      success: false,
      code: error.code || 'YARGI_DOCUMENT_FAILED',
      error: `${req.params.source} belge çekimi sırasında bir hata oluştu.`,
      details: error.message,
    });
  }
};
