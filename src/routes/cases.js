const express = require('express');
const router = express.Router();
const caseController = require('../controllers/caseController');
const hearingController = require('../controllers/hearingController');
const caseDocumentController = require('../controllers/caseDocumentController');
const petitionController = require('../controllers/petitionController');
const { authenticate } = require('../middleware/auth');
const { requireMatterRead, requireMatterWrite } = require('../middleware/matterAccess');
const upload = require('../middleware/upload');
const matterSuggestionController = require('../controllers/matterSuggestionController');
const { requireFeature } = require('../services/education/EntitlementService');

router.use(authenticate);
router.use(requireFeature('PROFESSIONAL_MATTER'));

router.post('/', caseController.createCase);
router.get('/', caseController.getCases);
router.get('/:caseId/workspace', requireMatterRead, caseController.getCaseWorkspace);
router.get('/:id', requireMatterRead, caseController.getCaseById);
router.put('/:id', requireMatterWrite, caseController.updateCase);
router.delete('/:id', requireMatterWrite, caseController.deleteCase);

router.post('/:caseId/hearings', requireMatterWrite, hearingController.createHearing);
router.get('/:caseId/hearings', requireMatterRead, hearingController.getHearings);

router.post('/:caseId/documents', requireMatterWrite, upload.single('file'), caseDocumentController.uploadDocument);
router.get('/:caseId/documents', requireMatterRead, caseDocumentController.getDocuments);
router.get('/:caseId/documents/:documentId', requireMatterRead, caseDocumentController.getDocument);
router.get('/:caseId/documents/:documentId/status', requireMatterRead, caseDocumentController.getDocumentStatus);
router.get('/:caseId/documents/:documentId/download', requireMatterRead, caseDocumentController.downloadDocument);
router.get('/:caseId/documents/:documentId/suggestions', requireMatterRead, matterSuggestionController.list);
router.post('/:caseId/documents/:docId/analyze', requireMatterWrite, caseDocumentController.analyzeDocument);
router.post('/:caseId/documents/:documentId/retry', requireMatterWrite, caseDocumentController.retryDocument);
router.delete('/:caseId/documents/:documentId', requireMatterWrite, caseDocumentController.deleteDocument);
router.post('/:caseId/suggestions/bulk-review', requireMatterWrite, matterSuggestionController.bulkReview);
router.post('/:caseId/suggestions/:suggestionId/accept', requireMatterWrite, matterSuggestionController.accept);
router.post('/:caseId/suggestions/:suggestionId/reject', requireMatterWrite, matterSuggestionController.reject);

router.get('/:caseId/petitions', requireMatterRead, petitionController.getPetitions);
router.post('/:caseId/petitions', requireMatterWrite, petitionController.createPetition);
router.post('/:caseId/petitions/generate', requireMatterWrite, petitionController.generateAiPetition);
router.get('/:caseId/petitions/comparisons', requireMatterRead, petitionController.getComparisons);
router.post('/:caseId/petitions/compare', requireMatterWrite, petitionController.compareAiPetitions);
router.get('/:caseId/petitions/:id', requireMatterRead, petitionController.getPetitionById);
router.put('/:caseId/petitions/:id', requireMatterWrite, petitionController.updatePetition);
router.delete('/:caseId/petitions/:id', requireMatterWrite, petitionController.deletePetition);

const { getCaseTimeline } = require('../controllers/caseTimelineController');
router.get('/:caseId/timeline', requireMatterRead, getCaseTimeline);

module.exports = router;
