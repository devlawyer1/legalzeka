// ============================================================
// Emsal Atlası - UYAP Route Tanımları
// Tüm UYAP endpoint'leri auth + firmMember ile korumalıdır.
// ============================================================

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { firmMember } = require('../middleware/firmAuth');
const uyapController = require('../controllers/uyapController');

// Tüm UYAP route'ları için auth + firma üyelik kontrolü
router.use(authenticate, firmMember);

// ---- Senkronizasyon ----
router.post('/sync', uyapController.triggerSync);
router.get('/sync/logs', uyapController.getSyncLogs);
router.get('/sync/status', uyapController.getSyncStatus);

// ---- Tebligatlar ----
router.get('/notifications', uyapController.getNotifications);
router.get('/notifications/unread-count', uyapController.getUnreadCount);
router.put('/notifications/read-all', uyapController.markAllNotificationsRead);
router.put('/notifications/:id/read', uyapController.markNotificationRead);

// ---- Davalar ve Evraklar (Arayüz API) ----
router.get('/cases', uyapController.getCases);
router.get('/documents', uyapController.getDocuments);
router.get('/documents/:id/download', uyapController.downloadDocument);
router.post('/documents/:id/analyze', uyapController.analyzeDocument);

module.exports = router;
