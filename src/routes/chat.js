// ============================================================
// Emsal Atlası - Chat Routes
// Sohbet API endpointleri
// ============================================================

const express = require('express');
const router = express.Router();
const { optionalAuthenticate } = require('../middleware/auth');
const {
  createConversation,
  getConversations,
  getMessages,
  sendMessage,
  deleteConversation,
} = require('../controllers/chatController');

// Tüm chat rotaları optionalAuthenticate kullanır
// (Hem misafir hem kayıtlı kullanıcılar erişebilir)
router.use(optionalAuthenticate);

// Sohbet CRUD
router.post('/conversations', createConversation);
router.get('/conversations', getConversations);
router.get('/conversations/:id/messages', getMessages);
router.post('/conversations/:id/messages', sendMessage);
router.post('/conversations/:id/messages/stream', require('../controllers/chatController').sendMessageStream);
router.delete('/conversations/:id', deleteConversation);

module.exports = router;
