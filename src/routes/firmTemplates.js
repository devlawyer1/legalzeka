const express = require('express');
const router = express.Router({ mergeParams: true }); // firmId'yi URL'den alabilmek için
const templateController = require('../controllers/firmTemplateController');

// GET /api/firms/:firmId/templates
router.get('/', templateController.getFirmTemplates);

// POST /api/firms/:firmId/templates
router.post('/', templateController.createTemplate);

// DELETE /api/firms/:firmId/templates/:id
router.delete('/:id', templateController.deleteTemplate);

// POST /api/firms/:firmId/templates/generate-draft
router.post('/generate-draft', templateController.generateDraft);

module.exports = router;
