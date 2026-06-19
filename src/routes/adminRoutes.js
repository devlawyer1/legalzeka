// ============================================================
// Emsal Atlası - Admin Routes
// /api/admin uç noktaları
// ============================================================

const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');

// /api/admin/stats
router.get('/stats', adminController.getDashboardStats);

// /api/admin/users
router.get('/users', adminController.getAllUsers);
router.put('/users/:id/status', adminController.updateUserStatus);

// /api/admin/firms
router.get('/firms', adminController.getAllFirms);

// /api/admin/subscriptions
router.get('/subscriptions', adminController.getAllSubscriptions);

module.exports = router;
