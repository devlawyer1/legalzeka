const express = require('express');
const router = express.Router({ mergeParams: true });
const { authenticate } = require('../middleware/auth');
const { firmMember } = require('../middleware/firmAuth');
const crmController = require('../controllers/crmController');

// All routes here are prefixed with /api/firms/:firmId/crm

router.get('/leads', authenticate, firmMember, crmController.getLeads);
router.post('/leads', authenticate, firmMember, crmController.createLead);
router.put('/leads/:leadId/stage', authenticate, firmMember, crmController.updateLeadStage);
router.put('/leads/:leadId', authenticate, firmMember, crmController.updateLead);
router.delete('/leads/:leadId', authenticate, firmMember, crmController.deleteLead);

router.get('/leads/:leadId/proposals', authenticate, firmMember, crmController.getProposals);
router.post('/leads/:leadId/proposals', authenticate, firmMember, crmController.createProposal);
router.post('/leads/:leadId/convert', authenticate, firmMember, crmController.convertLeadToCase);
router.post('/proposals', authenticate, firmMember, crmController.createProposal);

module.exports = router;
