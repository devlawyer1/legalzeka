const express = require('express');
const controller = require('../controllers/agentController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.post('/agent-workflows', controller.createWorkflow);
router.get('/agent-workflows', controller.listWorkflows);
router.get('/agent-workflows/:workflowId', controller.getWorkflow);
router.patch('/agent-workflows/:workflowId', controller.updateWorkflow);
router.post('/agent-workflows/:workflowId/activate', controller.activateWorkflow);
router.post('/agent-workflows/:workflowId/pause', controller.pauseWorkflow);
router.post('/agent-workflows/:workflowId/runs', controller.createRun);
router.post('/agent-workflows/:workflowId/schedules', controller.createSchedule);
router.get('/agent-workflows/:workflowId/schedules', controller.listSchedules);

router.get('/agent-runs', controller.listRuns);
router.get('/agent-runs/:runId', controller.getRun);
router.post('/agent-runs/:runId/cancel', controller.cancelRun);
router.post('/agent-runs/:runId/retry', controller.retryRun);

router.get('/agent-proposals', controller.listProposals);
router.post('/agent-proposals/bulk-review', controller.bulkReview);
router.post('/agent-proposals/:proposalId/approve', controller.approveProposal);
router.post('/agent-proposals/:proposalId/reject', controller.rejectProposal);

router.delete('/agent-schedules/:scheduleId', controller.deleteSchedule);
router.get('/cases/:caseId/agent-runs', controller.listCaseRuns);
router.get('/cases/:caseId/agent-proposals', controller.listCaseProposals);

module.exports = router;
