// ============================================================
// Emsal Atlası - Law Version Routes
// ============================================================

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const lvc = require('../controllers/lawVersionController');

// Arama ve listeleme herkese açık (giriş yapmadan da kullanılabilir)
router.get('/search', lvc.searchLaws);
router.get('/list', lvc.getLawList);

// Detay ve geçmiş — herkese açık
router.get('/:lawNumber/history', lvc.getLawHistory);
router.get('/:lawNumber/history/:articleNumber', lvc.getLawHistory);
router.get('/:lawNumber/:articleNumber/at', lvc.getLawAtDate);

module.exports = router;
