const Hearing = require('../models/Hearing');

/**
 * Duruşma Oluştur
 * POST /api/cases/:caseId/hearings
 */
exports.createHearing = async (req, res, next) => {
  try {
    const firmId = req.user.firmId;
    const caseId = req.params.caseId;
    const { tarihSaat, katilacakAvukatId, notlar, hatirlatici } = req.body;

    if (!firmId) return res.status(403).json({ success: false, message: 'Büro yetkiniz bulunmuyor.' });
    if (!tarihSaat) return res.status(400).json({ success: false, message: 'Duruşma tarihi zorunludur.' });

    const hearing = await Hearing.create({
      caseId,
      firmId,
      tarihSaat,
      katilacakAvukatId,
      notlar,
      hatirlatici
    });

    res.status(201).json({ success: true, data: hearing });
  } catch (error) {
    next(error);
  }
};

/**
 * Bir davanın duruşmalarını getir
 * GET /api/cases/:caseId/hearings
 */
exports.getHearings = async (req, res, next) => {
  try {
    const firmId = req.user.firmId;
    const caseId = req.params.caseId;

    if (!firmId) return res.status(403).json({ success: false, message: 'Yetkisiz erişim.' });

    const hearings = await Hearing.findByCaseId(caseId, firmId);
    res.status(200).json({ success: true, data: hearings });
  } catch (error) {
    next(error);
  }
};

/**
 * Büronun yaklaşan tüm duruşmalarını getir
 * GET /api/hearings/upcoming
 */
exports.getUpcomingHearings = async (req, res, next) => {
  try {
    const firmId = req.user.firmId;
    if (!firmId) return res.status(403).json({ success: false, message: 'Yetkisiz erişim.' });

    const hearings = await Hearing.findUpcomingByFirmId(firmId);
    res.status(200).json({ success: true, data: hearings });
  } catch (error) {
    next(error);
  }
};

/**
 * Duruşma Güncelle
 * PUT /api/hearings/:id
 */
exports.updateHearing = async (req, res, next) => {
  try {
    const firmId = req.user.firmId;
    const hearingId = req.params.id;

    const payload = {};
    if (req.body.tarihSaat !== undefined) {
      payload.tarih_saat = req.body.tarihSaat;
      payload.hearing_date = req.body.tarihSaat;
    }
    if (req.body.katilacakAvukatId !== undefined) payload.katilacak_avukat_id = req.body.katilacakAvukatId;
    if (req.body.notlar !== undefined) {
      payload.notlar = req.body.notlar;
      payload.notes = req.body.notlar;
    }
    if (req.body.hatirlatici !== undefined) payload.hatirlatici = req.body.hatirlatici;

    const updated = await Hearing.update(hearingId, firmId, payload);
    if (!updated) return res.status(404).json({ success: false, message: 'Duruşma bulunamadı.' });

    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

/**
 * Duruşma Sil
 * DELETE /api/hearings/:id
 */
exports.deleteHearing = async (req, res, next) => {
  try {
    const firmId = req.user.firmId;
    const hearingId = req.params.id;

    const success = await Hearing.delete(hearingId, firmId);
    if (!success) return res.status(404).json({ success: false, message: 'Duruşma bulunamadı.' });

    res.status(200).json({ success: true, message: 'Duruşma silindi.' });
  } catch (error) {
    next(error);
  }
};
