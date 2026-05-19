// ============================================================
// Emsal Atlası - Route Index
// Tüm route'ları merkezi olarak yönetir
// ============================================================

const express = require('express');
const router = express.Router();

const authRoutes = require('./auth');
const subscriptionRoutes = require('./subscription');
const searchRoutes = require('./search');
const historyRoutes = require('./history');
const chatRoutes = require('./chat');
const analysisRoutes = require('./analysis');

// Route'ları bağla
router.use('/auth', authRoutes);
router.use('/subscriptions', subscriptionRoutes);
router.use('/search', searchRoutes);
router.use('/history', historyRoutes);
router.use('/chat', chatRoutes);
router.use('/analysis', analysisRoutes);

module.exports = router;
