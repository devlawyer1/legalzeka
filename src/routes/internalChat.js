const express = require('express');
const router = express.Router();
const internalChatController = require('../controllers/internalChatController');
const { authenticate } = require('../middleware/auth');
const { firmMember } = require('../middleware/firmAuth');

router.use(authenticate);
router.use(firmMember);

router.get('/', internalChatController.getMessages);
router.post('/', internalChatController.sendMessage);

module.exports = router;