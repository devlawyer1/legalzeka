const express = require('express');
const router = express.Router({ mergeParams: true });
const financeController = require('../controllers/financeController');
const { firmMember } = require('../middleware/firmAuth');

// Tüm bu rotalar /api/firms/:firmId/finance altında çalışacak
// ve firmAuth.js içindeki firmMember middleware'i tarafından korunacaktır.

router.use(firmMember);

router.get('/stats', financeController.getDashboardStats);
router.get('/invoices', financeController.getInvoices);
router.post('/invoices', financeController.createInvoice);
router.put('/invoices/:id/status', financeController.updateInvoiceStatus);
router.post('/payments', financeController.addPayment);

module.exports = router;
