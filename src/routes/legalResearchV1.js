const express = require('express');
const rateLimit = require('express-rate-limit');
const controller = require('../controllers/legalResearchController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const answerLimiter = rateLimit({
  windowMs: Number(process.env.LEGAL_RESEARCH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.LEGAL_RESEARCH_RATE_LIMIT_MAX || 20),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `user:${req.user.id}`,
  message: {
    success: false,
    code: 'LEGAL_RESEARCH_RATE_LIMITED',
    message: 'Çok fazla hukuk araştırması isteği gönderildi. Lütfen daha sonra tekrar deneyin.',
  },
});

router.use(authenticate);
router.post('/sessions', controller.createSession);
router.get('/sessions', controller.listSessions);
router.get('/sessions/:sessionId', controller.getSession);
router.patch('/sessions/:sessionId', controller.updateSession);
router.delete('/sessions/:sessionId', controller.deleteSession);
router.post('/sessions/:sessionId/messages', controller.addMessage);
router.post('/sessions/:sessionId/answers/:answerId/save-to-matter', controller.saveToMatter);
router.post('/answer', answerLimiter, controller.answer);

module.exports = router;
