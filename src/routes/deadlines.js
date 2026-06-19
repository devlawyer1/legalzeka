// ============================================================
// Emsal Atlası - Deadline Routes
// ============================================================

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { firmMember } = require('../middleware/firmAuth');
const dc = require('../controllers/deadlineController');

router.use(authenticate);

router.get('/active', firmMember, dc.getActiveDeadlines);
router.get('/all', firmMember, dc.getAllDeadlines);
router.get('/urgent-count', firmMember, dc.getUrgentCount);
router.post('/', firmMember, dc.createDeadline);
router.put('/:id/acknowledge', firmMember, dc.acknowledgeDeadline);
router.delete('/:id', firmMember, dc.deleteDeadline);

module.exports = router;
