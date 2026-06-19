// ============================================================
// Emsal Atlası - Deadline Controller
// Süre uyarısı yönetimi endpoint'leri
// ============================================================

const DeadlineAlert = require('../models/DeadlineAlert');

async function getActiveDeadlines(req, res, next) {
  try {
    const firmId = req.user.firmId || req.query.firmId;
    if (!firmId) return res.status(400).json({ success: false, message: 'firmId zorunludur.' });

    const deadlines = await DeadlineAlert.getActiveByFirm(firmId);
    res.json({ success: true, data: deadlines });
  } catch (error) {
    next(error);
  }
}

async function getAllDeadlines(req, res, next) {
  try {
    const firmId = req.user.firmId || req.query.firmId;
    const { limit = 50, offset = 0 } = req.query;
    if (!firmId) return res.status(400).json({ success: false, message: 'firmId zorunludur.' });

    const deadlines = await DeadlineAlert.getAllByFirm(firmId, { limit: parseInt(limit), offset: parseInt(offset) });
    res.json({ success: true, data: deadlines });
  } catch (error) {
    next(error);
  }
}

async function getUrgentCount(req, res, next) {
  try {
    const firmId = req.user.firmId || req.query.firmId;
    if (!firmId) return res.status(400).json({ success: false, message: 'firmId zorunludur.' });

    const count = await DeadlineAlert.getUrgentCount(firmId);
    res.json({ success: true, data: { count } });
  } catch (error) {
    next(error);
  }
}

async function createDeadline(req, res, next) {
  try {
    const { caseId, title, description, deadlineDate, alertType, priority } = req.body;
    const firmId = req.user.firmId || req.body.firmId;
    if (!firmId || !title || !deadlineDate) {
      return res.status(400).json({ success: false, message: 'firmId, title ve deadlineDate zorunludur.' });
    }

    const alert = await DeadlineAlert.create({
      firmId, caseId, title, description, deadlineDate, alertType, priority,
      source: 'manual', createdBy: req.user.id,
    });
    res.status(201).json({ success: true, data: alert });
  } catch (error) {
    next(error);
  }
}

async function acknowledgeDeadline(req, res, next) {
  try {
    const { id } = req.params;
    const result = await DeadlineAlert.acknowledge(id, req.user.id);
    if (!result) return res.status(404).json({ success: false, message: 'Deadline bulunamadı.' });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

async function deleteDeadline(req, res, next) {
  try {
    const { id } = req.params;
    const result = await DeadlineAlert.delete(id);
    if (!result) return res.status(404).json({ success: false, message: 'Deadline bulunamadı.' });
    res.json({ success: true, message: 'Deadline silindi.' });
  } catch (error) {
    next(error);
  }
}

module.exports = { getActiveDeadlines, getAllDeadlines, getUrgentCount, createDeadline, acknowledgeDeadline, deleteDeadline };
