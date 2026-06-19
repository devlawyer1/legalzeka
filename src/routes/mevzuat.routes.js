const express = require('express');
const router = express.Router();
const mevzuatController = require('../controllers/mevzuatController');

// REST Endpoints
router.post('/search', mevzuatController.searchMevzuat);
router.get('/content/:id', mevzuatController.getDocumentContent);
router.get('/article/:id', mevzuatController.getArticleContent);
router.get('/tree/:id', mevzuatController.getArticleTree);
router.get('/gerekce/:id', mevzuatController.getGerekceContent);

module.exports = router;
