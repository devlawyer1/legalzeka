const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { firmMember } = require('../middleware/firmAuth');
const workdeskController = require('../controllers/workdeskController');

router.get('/overview', authenticate, firmMember, workdeskController.getOverview);

module.exports = router;
