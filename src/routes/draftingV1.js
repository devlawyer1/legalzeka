const express = require('express');
const rateLimit = require('express-rate-limit');
const controller = require('../controllers/draftController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const aiLimiter = rateLimit({
  windowMs: Number(process.env.DRAFT_AI_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.DRAFT_AI_RATE_LIMIT_MAX || 30),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `user:${req.user.id}`,
  message: { success: false, code: 'DRAFT_AI_RATE_LIMITED', message: 'Çok fazla AI taslak isteği gönderildi.' },
});

router.use(authenticate);
router.get('/draft-templates', controller.listTemplates);
router.post('/draft-templates', controller.createTemplate);
router.patch('/draft-templates/:templateId', controller.updateTemplate);
router.delete('/draft-templates/:templateId', controller.deleteTemplate);
router.post('/drafts', controller.createDraft);
router.get('/drafts', controller.listDrafts);
router.get('/drafts/:draftId', controller.getDraft);
router.patch('/drafts/:draftId', controller.updateDraft);
router.delete('/drafts/:draftId', controller.deleteDraft);
router.get('/drafts/:draftId/versions', controller.listVersions);
router.get('/drafts/:draftId/versions/compare', controller.compareVersions);
router.post('/drafts/:draftId/generate-plan', aiLimiter, controller.generatePlan);
router.post('/drafts/:draftId/generate-section', aiLimiter, controller.generateSection);
router.post('/drafts/:draftId/analyze', aiLimiter, controller.analyzeDraft);
router.get('/drafts/:draftId/suggestions', controller.listSuggestions);
router.post('/drafts/:draftId/suggestions/bulk-review', controller.bulkReview);
router.post('/drafts/:draftId/suggestions/:suggestionId/accept', controller.acceptSuggestion);
router.post('/drafts/:draftId/suggestions/:suggestionId/reject', controller.rejectSuggestion);
router.post('/drafts/:draftId/source-search', controller.searchSources);
router.post('/drafts/:draftId/citations', controller.addCitation);
router.delete('/drafts/:draftId/citations/:citationId', controller.removeCitation);
router.post('/drafts/:draftId/claim-relations', controller.linkDraftClaim);
router.get('/drafts/:draftId/export/docx', controller.exportDocx);
router.get('/drafts/:draftId/export/pdf', controller.exportPdf);
router.get('/cases/:caseId/evidence-matrix', controller.getEvidenceMatrix);
router.post('/cases/:caseId/claims', controller.createClaim);
router.post('/cases/:caseId/evidence', controller.createEvidence);
router.post('/cases/:caseId/evidence-relations', controller.createEvidenceRelation);
router.post('/cases/:caseId/evidence-relations/:relationId/review', controller.reviewEvidenceRelation);

module.exports = router;
