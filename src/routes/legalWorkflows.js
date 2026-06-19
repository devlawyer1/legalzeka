const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const { authenticate } = require('../middleware/auth');
const { checkSubscription } = require('../middleware/checkSubscription');
const controller = require('../controllers/legalWorkflowController');

router.get('/', authenticate, controller.getCatalog);
router.get('/profile', authenticate, controller.getProfile);
router.put('/profile', authenticate, controller.updateProfile);
router.post('/run', authenticate, checkSubscription, upload.single('document'), controller.runWorkflow);

module.exports = router;
