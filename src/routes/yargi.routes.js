const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const yargiController = require('../controllers/yargiController');
const { authenticate } = require('../middleware/auth');
const { checkSubscription } = require('../middleware/checkSubscription');

const yargiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.YARGI_ROUTE_RATE_LIMIT || '30', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: 'YARGI_RATE_LIMITED',
    message: 'Yargi kaynaklarına kısa sürede çok fazla istek gönderildi. Lütfen biraz sonra tekrar deneyin.',
  },
});

router.use(authenticate, checkSubscription, yargiLimiter);

/**
 * LegalZeka self-hosted Yargi-MCP health and circuit snapshot.
 * URL: /api/yargi/health
 */
router.get('/health', yargiController.health);

/**
 * Dinamik Yargı-MCP Arama Rotası
 * URL: /api/yargi/:source/search
 * source: yargitay, danistay, anayasa, uyusmazlik, kik, rekabet, bedesten vb.
 */
router.post('/:source/search', yargiController.search);

/**
 * Dinamik Yargı-MCP Belge Getirme Rotası
 * URL: /api/yargi/:source/document
 */
router.post('/:source/document', yargiController.getDocument);

module.exports = router;
