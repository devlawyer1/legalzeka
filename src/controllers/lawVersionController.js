// ============================================================
// Emsal Atlası - Law Version Controller
// ============================================================

const LawVersion = require('../models/LawVersion');

const { fetchFromMevzuatGovTr } = require('../services/mevzuatScraper');

async function searchLaws(req, res, next) {
  try {
    const { q, date, limit = 20, offset = 0 } = req.query;
    if (!q) return res.status(400).json({ success: false, message: 'Arama sorgusu (q) zorunludur.' });

    // Eğer cümleden anlam çıkarma modu açıksa veya sorgu 4 kelimeden uzunsa (Yani niyet/context varsa) vektörel ara
    let results;
    if (req.query.useSemantic === 'true' || q.split(' ').length > 3) {
      // Semantik arama kullan
      results = await LawVersion.searchSemantic(q, parseInt(limit));
    } else {
      // Önce lokal veritabanında ara (Eski LIKE araması)
      results = await LawVersion.search(q, { date, limit: parseInt(limit), offset: parseInt(offset) });
      
      // Eğer lokalde sonuç yoksa, dış servise (mevzuat.gov.tr) bağlanıp çekmeyi dene (On-the-fly caching)
      if (results.length === 0) {
        await fetchFromMevzuatGovTr(q);
        
        // Servis verileri çekip DB'ye yazdıktan sonra aynı aramayı tekrar yap
        results = await LawVersion.search(q, { date, limit: parseInt(limit), offset: parseInt(offset) });
      }
    }

    res.json({ success: true, data: results });
  } catch (error) {
    next(error);
  }
}

async function getLawAtDate(req, res, next) {
  try {
    const { lawNumber, articleNumber } = req.params;
    const { date } = req.query;
    if (!date) return res.status(400).json({ success: false, message: 'Tarih (date) parametresi zorunludur.' });

    const result = await LawVersion.getAtDate(lawNumber, articleNumber || null, date);
    if (!result) return res.status(404).json({ success: false, message: 'Belirtilen tarihte bu madde bulunamadı.' });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

async function getLawHistory(req, res, next) {
  try {
    const { lawNumber, articleNumber } = req.params;
    const versions = await LawVersion.getHistory(lawNumber, articleNumber || null);
    res.json({ success: true, data: versions });
  } catch (error) {
    next(error);
  }
}

async function getLawList(req, res, next) {
  try {
    const laws = await LawVersion.getLawList();
    res.json({ success: true, data: laws });
  } catch (error) {
    next(error);
  }
}

module.exports = { searchLaws, getLawAtDate, getLawHistory, getLawList };
