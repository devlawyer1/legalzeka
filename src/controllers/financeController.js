const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildInvoiceNumber(prefix = 'LZ') {
  const now = new Date();
  return `${prefix}-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getTime()).slice(-5)}`;
}

exports.getDashboardStats = async (req, res) => {
  try {
    const firmId = req.firm.id;
    const stats = await Invoice.getDashboardStats(firmId);
    
    // Formatting numbers properly
    res.json({
      total_pending: parseFloat(stats.total_pending) || 0,
      total_paid: parseFloat(stats.total_paid) || 0,
      total_overdue: parseFloat(stats.total_overdue) || 0,
      mrr: parseFloat(stats.mrr) || 0
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Finansal veriler getirilirken hata oluştu.' });
  }
};

exports.getInvoices = async (req, res) => {
  try {
    const firmId = req.firm.id;
    const invoices = await Invoice.getByFirmId(firmId);
    res.json(invoices);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Faturalar getirilirken hata oluştu.' });
  }
};

exports.createInvoice = async (req, res) => {
  try {
    const firmId = req.firm.id;
    const taxRate = toNumber(req.body.tax_rate, 20);
    const amount = toNumber(req.body.amount, toNumber(req.body.total_amount, 0));
    const totalAmount = toNumber(req.body.total_amount, amount * (1 + taxRate / 100));
    const data = {
      ...req.body,
      firm_id: firmId,
      amount,
      tax_rate: taxRate,
      total_amount: totalAmount,
      invoice_number: req.body.invoice_number || buildInvoiceNumber('LZ'),
      issue_date: req.body.issue_date || new Date(),
      notes: req.body.notes || req.body.description || null,
    };
    
    const invoice = await Invoice.create(data);
    res.status(201).json(invoice);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fatura oluşturulamadı.' });
  }
};

exports.updateInvoiceStatus = async (req, res) => {
  try {
    const firmId = req.firm.id;
    const { id } = req.params;
    const { status } = req.body;
    
    const invoice = await Invoice.updateStatus(id, firmId, status);
    res.json(invoice);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fatura durumu güncellenemedi.' });
  }
};

exports.addPayment = async (req, res) => {
  try {
    const firmId = req.firm.id;
    const { invoice_id, amount, payment_date, payment_method, reference_no, notes } = req.body;
    
    const payment = await Payment.create({
      firm_id: firmId,
      invoice_id,
      amount,
      payment_date,
      payment_method,
      reference_no,
      notes
    });
    
    res.status(201).json(payment);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ödeme eklenemedi.' });
  }
};
