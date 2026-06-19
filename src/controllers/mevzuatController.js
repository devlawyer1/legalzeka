const mevzuatService = require('../services/mevzuat/mevzuatService');

/**
 * REST Endpoint for searching Mevzuat
 * POST /api/mevzuat/search
 */
exports.searchMevzuat = async (req, res) => {
  try {
    const { 
      query, mevzuatAdi, mevzuatNo, mevzuatTur, 
      basliktaAra, tamCumle, 
      resmiGazeteTarihiStart, resmiGazeteTarihiEnd, 
      page, pageSize 
    } = req.body;

    const results = await mevzuatService.searchDocuments({
      query,
      mevzuatAdi,
      mevzuatNo,
      mevzuatTur,
      basliktaAra,
      tamCumle,
      resmiGazeteTarihiStart,
      resmiGazeteTarihiEnd,
      page: page || 1,
      pageSize: pageSize || 25
    });

    res.json(results);
  } catch (error) {
    console.error('Mevzuat Search Error:', error);
    res.status(500).json({ error: 'Mevzuat araması sırasında bir hata oluştu.' });
  }
};

/**
 * REST Endpoint for getting document full text
 * GET /api/mevzuat/content/:id
 */
exports.getDocumentContent = async (req, res) => {
  try {
    const { id } = req.params;
    const { tur, tertip, tarih } = req.query; // For GovTr fallback

    const content = await mevzuatService.getDocumentContent(id, tur, tertip, tarih);
    res.json(content);
  } catch (error) {
    console.error('Mevzuat Content Error:', error);
    res.status(500).json({ error: 'İçerik alınırken bir hata oluştu.' });
  }
};

/**
 * REST Endpoint for getting specific article
 * GET /api/mevzuat/article/:id
 */
exports.getArticleContent = async (req, res) => {
  try {
    const { id } = req.params;
    const content = await mevzuatService.getArticleContent(id);
    res.json(content);
  } catch (error) {
    console.error('Article Content Error:', error);
    res.status(500).json({ error: 'Madde içeriği alınırken bir hata oluştu.' });
  }
};

/**
 * REST Endpoint for getting article tree (table of contents)
 * GET /api/mevzuat/tree/:id
 */
exports.getArticleTree = async (req, res) => {
  try {
    const { id } = req.params;
    const tree = await mevzuatService.getArticleTree(id);
    res.json(tree);
  } catch (error) {
    console.error('Article Tree Error:', error);
    res.status(500).json({ error: 'İçindekiler listesi alınırken bir hata oluştu.' });
  }
};

/**
 * REST Endpoint for getting rationale (Gerekçe)
 * GET /api/mevzuat/gerekce/:id
 */
exports.getGerekceContent = async (req, res) => {
  try {
    const { id } = req.params;
    const content = await mevzuatService.getGerekceContent(id);
    res.json(content);
  } catch (error) {
    console.error('Gerekce Content Error:', error);
    res.status(500).json({ error: 'Gerekçe içeriği alınırken bir hata oluştu.' });
  }
};
