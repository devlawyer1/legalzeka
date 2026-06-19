const express = require('express');
const router = express.Router();
const SimulationController = require('../controllers/simulationController');
const { authenticate } = require('../middleware/auth');
const { checkSubscription } = require('../middleware/checkSubscription');

// Tüm rotalar giriş yapmış kullanıcılar için
router.use(authenticate);
// (İsteğe bağlı: checkSubscription eklenebilir, şimdilik authenticate yeterli)

// Oturum Başlatma ve Listeleme
router.get('/', SimulationController.getHistory);
router.post('/start', SimulationController.startSession);

// Oturum İçi Etkileşimler
router.post('/message', SimulationController.sendMessage);
router.post('/next-stage', SimulationController.nextStage);
router.post('/evaluate', SimulationController.evaluate);

// Tekil Oturum Detayı
router.get('/:id', SimulationController.getSessionDetails);

module.exports = router;
