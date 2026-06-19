const express = require('express');
const router = express.Router({ mergeParams: true });
const corporateController = require('../controllers/corporateController');
const { firmMember } = require('../middleware/firmAuth');

router.use(firmMember);

// Modül 10
router.get('/tree', corporateController.getCorporateTree);
router.post('/tree', corporateController.createCorporateEntity);

// Modül 8
router.get('/tickets', corporateController.getTickets);
router.post('/tickets', corporateController.createTicket);
router.put('/tickets/:id/status', corporateController.updateTicketStatus);

module.exports = router;
