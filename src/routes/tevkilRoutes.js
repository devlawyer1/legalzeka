const express = require('express');
const router = express.Router();
const tevkilController = require('../controllers/tevkilController');
const { authenticate } = require('../middleware/auth'); // JWT auth

// İlan Pazarı
router.post('/ads', authenticate, tevkilController.createAd);
router.get('/ads', authenticate, tevkilController.getAds);
router.get('/my-ads', authenticate, tevkilController.getMyAds);

// Başvurular
router.post('/apply', authenticate, tevkilController.applyToAd);
router.get('/my-applications', authenticate, tevkilController.getMyApplications);
router.post('/handle-application', authenticate, tevkilController.handleApplication);

// AI
router.post('/improve-description', authenticate, tevkilController.improveDescriptionWithAI);

module.exports = router;
