const express = require('express');
const router = express.Router();
const emsalController = require('../controllers/emsalController');

// REST Endpoints for Emsal (Precedent) search
router.post('/yargitay/search', emsalController.searchYargitay);

module.exports = router;
