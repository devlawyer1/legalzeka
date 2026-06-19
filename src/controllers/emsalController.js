const yargiMcpClient = require('../services/emsal/yargiMcpClient');

exports.searchYargitay = async (req, res) => {
  try {
    const { q, page, daire, tarihBaslangic, tarihBitis, siralama } = req.body;
    
    // Yargitay search arguments
    const options = {
      page: page || 1
    };
    if (daire) options.daire = daire;
    if (tarihBaslangic) options.tarihBaslangic = tarihBaslangic;
    if (tarihBitis) options.tarihBitis = tarihBitis;
    if (siralama) options.siralama = siralama;

    const result = await yargiMcpClient.searchYargitay(q, options);

    res.json(result);
  } catch (error) {
    console.error('Yargitay Search Error:', error);
    res.status(500).json({ error: 'Yargıtay araması sırasında bir hata oluştu.', details: error.message });
  }
};
