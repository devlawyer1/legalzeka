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
const firmRoutes = require('./firm');
const caseRoutes = require('./cases');
const taskRoutes = require('./tasks');
const internalChatRoutes = require('./internalChat');
const hearingRoutes = require('./hearings');
const collectionsRoutes = require('./collections');
const newsletterRoutes = require('./newsletter');
const uyapRoutes = require('./uyap');
const deadlineRoutes = require('./deadlines');
const lawRoutes = require('./laws');
const adminRoutes = require('./adminRoutes');
const simulationRoutes = require('./simulationRoutes');
const tevkilRoutes = require('./tevkilRoutes');
const mevzuatRoutes = require('./mevzuat.routes');
const emsalRoutes = require('./emsal.routes');
const yargiRoutes = require('./yargi.routes');
const legalWorkflowRoutes = require('./legalWorkflows');
const workdeskRoutes = require('./workdesk');
const legalSearchV1Routes = require('./legalSearchV1');
const { authenticate, authorize } = require('../middleware/auth');

// Route'ları bağla
router.use('/auth', authRoutes);
router.use('/subscriptions', subscriptionRoutes);
router.use('/search', searchRoutes);
router.use('/history', historyRoutes);
router.use('/chat', chatRoutes);
router.use('/analysis', analysisRoutes);
router.use('/firms', firmRoutes);
router.use('/cases', caseRoutes);
router.use('/tasks', taskRoutes);
router.use('/internal-chat', internalChatRoutes);
router.use('/hearings', hearingRoutes);
router.use('/collections', collectionsRoutes);
router.use('/newsletter', newsletterRoutes);
router.use('/uyap', uyapRoutes);
router.use('/deadlines', deadlineRoutes);
router.use('/laws', lawRoutes);
router.use('/simulations', simulationRoutes);
router.use('/tevkil', tevkilRoutes);
router.use('/admin', authenticate, authorize('Admin'), adminRoutes);
router.use('/mevzuat', mevzuatRoutes);
router.use('/emsal', emsalRoutes);
router.use('/yargi', yargiRoutes);
router.use('/legal-workflows', legalWorkflowRoutes);
router.use('/workdesk', workdeskRoutes);
router.use('/v1', legalSearchV1Routes);

module.exports = router;
