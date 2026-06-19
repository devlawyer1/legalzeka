const express = require('express');
const router = express.Router();
const caseController = require('../controllers/caseController');
const hearingController = require('../controllers/hearingController');
const caseDocumentController = require('../controllers/caseDocumentController');
const petitionController = require('../controllers/petitionController');
const { authenticate } = require('../middleware/auth');
const { firmMember } = require('../middleware/firmAuth');
const upload = require('../middleware/upload');

router.use(authenticate);
router.use(firmMember);

// Dava CRUD
router.post('/', caseController.createCase);
router.get('/', caseController.getCases);
router.get('/:caseId/workspace', caseController.getCaseWorkspace);
router.get('/:id', caseController.getCaseById);
router.put('/:id', caseController.updateCase);
router.delete('/:id', caseController.deleteCase);

// Duruşmalar (Dava bazlı)
router.post('/:caseId/hearings', hearingController.createHearing);
router.get('/:caseId/hearings', hearingController.getHearings);

// Belgeler (Dava bazlı)
router.post('/:caseId/documents', upload.single('file'), caseDocumentController.uploadDocument);
router.get('/:caseId/documents', caseDocumentController.getDocuments);
router.post('/:caseId/documents/:docId/analyze', caseDocumentController.analyzeDocument);
router.delete('/:caseId/documents/:docId', caseDocumentController.deleteDocument);

// Dilekçeler (Dava bazlı)
router.get('/:caseId/petitions', petitionController.getPetitions);
router.post('/:caseId/petitions', petitionController.createPetition);
router.post('/:caseId/petitions/generate', petitionController.generateAiPetition);
router.get('/:caseId/petitions/comparisons', petitionController.getComparisons);
router.post('/:caseId/petitions/compare', petitionController.compareAiPetitions);
router.get('/:caseId/petitions/:id', petitionController.getPetitionById);
router.put('/:caseId/petitions/:id', petitionController.updatePetition);
router.delete('/:caseId/petitions/:id', petitionController.deletePetition);

// Timeline (Dava Süreç Haritası)
const { getCaseTimeline } = require('../controllers/caseTimelineController');
router.get('/:caseId/timeline', getCaseTimeline);

module.exports = router;
