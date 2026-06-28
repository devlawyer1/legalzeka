const express = require('express');
const controller = require('../controllers/legalSearchController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.post('/legal-search', authenticate, controller.search);
router.get('/legal-sources/:sourceId', authenticate, controller.getSource);
router.get('/legal-sources/:sourceId/related', authenticate, controller.getRelated);
router.get('/legislation/:id/versions', authenticate, controller.getLegislationVersions);

module.exports = router;
