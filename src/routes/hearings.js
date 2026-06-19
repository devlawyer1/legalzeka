const express = require('express');
const router = express.Router();
const hearingController = require('../controllers/hearingController');
const { authenticate } = require('../middleware/auth');
const { firmMember } = require('../middleware/firmAuth');

router.use(authenticate);
router.use(firmMember);

// Büronun yaklaşan tüm duruşmaları
router.get('/upcoming', hearingController.getUpcomingHearings);

// Duruşma güncelle/sil (tek bir duruşma ID ile)
router.put('/:id', hearingController.updateHearing);
router.delete('/:id', hearingController.deleteHearing);

module.exports = router;
