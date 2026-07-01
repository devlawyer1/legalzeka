const express = require('express');
const controller = require('../controllers/calculationController');
const { authenticate, authorize } = require('../middleware/auth');
const { requireFeature } = require('../services/education/EntitlementService');

const router = express.Router();
router.use(authenticate);
router.use(requireFeature('PROFESSIONAL_MATTER'));
router.get('/calculation-rules', controller.listRules);
router.get('/calculation-rules/:ruleCode/versions', controller.listRuleVersions);
router.post('/calculations/deadline', controller.calculateDeadline);
router.post('/calculations/limitation', controller.calculateLimitation);
router.post('/calculations/interest', controller.calculateInterest);
router.post('/calculations/employment', controller.calculateEmployment);
router.post('/calculations/fee', controller.calculateFee);
router.get('/calculations', controller.listCalculations);
router.get('/calculations/:calculationId', controller.getCalculation);
router.delete('/calculations/:calculationId', controller.voidCalculation);
router.post('/calculations/:calculationId/confirm', controller.confirmCalculation);
router.post('/calculations/:calculationId/create-deadline', controller.createDeadline);
router.post('/calculations/:calculationId/create-task', controller.createTask);
router.post('/calculations/:calculationId/recalculate', controller.recalculate);
router.post('/calculations/:calculationId/link-draft', controller.linkDraft);

router.post('/calculation-rules', authorize('Admin'), controller.createRuleSet);
router.post('/calculation-rules/:ruleCode/versions', authorize('Admin'), controller.createRuleVersion);
router.post('/calculation-rules/:ruleCode/versions/:versionId/review', authorize('Admin'), controller.reviewRuleVersion);
router.post('/calculation-rules/:ruleCode/versions/:versionId/activate', authorize('Admin'), controller.activateRuleVersion);
router.post('/calculation-rules/:ruleCode/versions/:versionId/retire', authorize('Admin'), controller.retireRuleVersion);
router.post('/calculation-rules/:ruleCode/versions/:versionId/test', authorize('Admin'), controller.testRuleVersion);

module.exports = router;
