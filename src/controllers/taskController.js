const Task = require('../models/Task');

/**
 * Görev Oluştur
 * POST /api/tasks
 */
exports.createTask = async (req, res, next) => {
  try {
    const { caseId, baslik, aciklama, atananId, sonTarih, oncelik, durum } = req.body;
    const firmId = req.user.firmId;
    const atayanId = req.user.id;

    if (!firmId) return res.status(403).json({ success: false, message: 'Büro yetkiniz bulunmuyor.' });

    const newTask = await Task.create({
      firmId,
      caseId,
      baslik,
      aciklama,
      atayanId,
      atananId,
      sonTarih,
      oncelik,
      durum
    });

    res.status(201).json({ success: true, data: newTask });
  } catch (error) {
    next(error);
  }
};

/**
 * Büronun Tüm Görevlerini Al
 * GET /api/tasks
 */
exports.getTasks = async (req, res, next) => {
  try {
    const firmId = req.user.firmId;
    if (!firmId) return res.status(403).json({ success: false, message: 'Büro yetkiniz bulunmuyor.' });

    const tasks = await Task.findByFirmId(firmId);
    res.status(200).json({ success: true, data: tasks });
  } catch (error) {
    next(error);
  }
};

/**
 * Görev Güncelle (Özellikle kanmban board drag & drop update)
 * PUT /api/tasks/:id
 */
exports.updateTask = async (req, res, next) => {
  try {
    const taskId = req.params.id;
    const firmId = req.user.firmId;
    
    const payload = {};
    if (req.body.baslik !== undefined) payload.baslik = req.body.baslik;
    if (req.body.aciklama !== undefined) payload.aciklama = req.body.aciklama;
    if (req.body.atananId !== undefined) payload.atanan_id = req.body.atananId;
    if (req.body.sonTarih !== undefined) payload.son_tarih = req.body.sonTarih;
    if (req.body.oncelik !== undefined) payload.oncelik = req.body.oncelik;
    if (req.body.durum !== undefined) payload.durum = req.body.durum;
    
    // allow un-assigning
    if (req.body.atananId === null) payload.atanan_id = null;

    const updated = await Task.update(taskId, firmId, payload);
    if (!updated) return res.status(404).json({ success: false, message: 'Görev bulunamadı.' });

    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

/**
 * Görevi Sil
 * DELETE /api/tasks/:id
 */
exports.deleteTask = async (req, res, next) => {
  try {
    const taskId = req.params.id;
    const firmId = req.user.firmId;

    const success = await Task.delete(taskId, firmId);
    if (!success) return res.status(404).json({ success: false, message: 'Görev bulunamadı.' });

    res.status(200).json({ success: true, message: 'Görev başarıyla silindi.' });
  } catch (error) {
    next(error);
  }
};