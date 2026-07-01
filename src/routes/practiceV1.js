const express = require('express');
const controller = require('../controllers/practiceController');
const { authenticate } = require('../middleware/auth');
const { requireFeature } = require('../services/education/EntitlementService');

const router = express.Router();

router.use(authenticate);
router.use(requireFeature('PRACTICE_MANAGEMENT'));

router.get('/practice/dashboard', controller.getPracticeDashboard);

router.get('/crm/leads', controller.listLeads);
router.post('/crm/leads', controller.createLead);
router.get('/crm/leads/:leadId', controller.getLead);
router.post('/crm/leads/:leadId/convert', controller.convertLead);

router.get('/clients', controller.listClients);
router.post('/clients', controller.createClient);
router.get('/clients/:clientId', controller.getClient);

router.post('/conflict-checks', controller.createConflictCheck);
router.post('/conflict-checks/:checkId/review', controller.reviewConflictCheck);

router.get('/cases/:caseId/team', controller.listTeam);
router.post('/cases/:caseId/team', controller.addTeamMember);
router.get('/cases/:caseId/tasks', controller.listTasks);
router.post('/cases/:caseId/tasks', controller.createTask);
router.patch('/cases/:caseId/tasks/:taskId', controller.updateTask);
router.get('/cases/:caseId/hearings', controller.listHearings);
router.post('/cases/:caseId/hearings', controller.createHearing);
router.patch('/cases/:caseId/hearings/:hearingId', controller.updateHearing);
router.get('/cases/:caseId/deadlines', controller.listDeadlines);
router.post('/cases/:caseId/deadlines', controller.createDeadline);
router.get('/cases/:caseId/updates', controller.listUpdates);
router.post('/cases/:caseId/updates', controller.createUpdate);

router.get('/time-entries', controller.listTimeEntries);
router.post('/time-entries', controller.createTimeEntry);
router.patch('/time-entries/:timeEntryId', controller.updateTimeEntry);
router.post('/time-entries/:timeEntryId/stop', controller.stopTimeEntry);
router.post('/time-entries/:timeEntryId/approve', controller.approveTimeEntry);

router.get('/expenses', controller.listExpenses);
router.post('/expenses', controller.createExpense);
router.post('/expenses/:expenseId/approve', controller.approveExpense);

router.get('/fee-agreements', controller.listFeeAgreements);
router.post('/fee-agreements', controller.createFeeAgreement);

router.get('/invoices', controller.listInvoices);
router.post('/invoices', controller.createInvoice);
router.post('/invoices/:invoiceId/issue', controller.issueInvoice);
router.post('/invoices/:invoiceId/payments', controller.recordPayment);
router.get('/invoices/:invoiceId/export', controller.exportInvoice);

router.post('/portal/invitations', controller.invitePortal);
router.post('/portal/invitations/accept', controller.acceptPortal);
router.post('/portal/invitations/:accessId/revoke', controller.revokePortal);
router.post('/portal/shared-items', controller.sharePortalItem);
router.get('/portal/cases', controller.listPortalCases);
router.get('/portal/cases/:caseId/documents/:documentId/download', controller.downloadPortalDocument);
router.get('/portal/cases/:caseId', controller.getPortalCase);
router.get('/portal/messages', controller.listPortalMessages);
router.post('/portal/messages', controller.sendPortalMessage);

module.exports = router;
