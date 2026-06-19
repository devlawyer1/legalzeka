const CorporateEntity = require('../models/CorporateEntity');
const ClientTicket = require('../models/ClientTicket');

// ==================== Modül 10: Kurumsal Ağaç ====================

exports.getCorporateTree = async (req, res) => {
  try {
    const firmId = req.user.firmId;
    const tree = await CorporateEntity.getTreeByFirmId(firmId);
    res.json(tree);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Kurumsal ağaç getirilirken hata oluştu: ' + err.message });
  }
};

exports.createCorporateEntity = async (req, res) => {
  try {
    const firmId = req.user.firmId;
    const data = { ...req.body, firm_id: firmId };
    const entity = await CorporateEntity.create(data);
    res.status(201).json(entity);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Kurumsal iştirak eklenemedi.' });
  }
};

// ==================== Modül 8: VIP SLA ====================

exports.getTickets = async (req, res) => {
  try {
    const firmId = req.user.firmId;
    const tickets = await ClientTicket.getByFirmId(firmId);
    res.json(tickets);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Talepler getirilirken hata oluştu: ' + err.message });
  }
};

exports.createTicket = async (req, res) => {
  try {
    const firmId = req.user.firmId;
    const data = { ...req.body, firm_id: firmId };
    const ticket = await ClientTicket.create(data);
    res.status(201).json(ticket);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Talep oluşturulamadı.' });
  }
};

exports.updateTicketStatus = async (req, res) => {
  try {
    const firmId = req.user.firmId;
    const { id } = req.params;
    const { status } = req.body;
    
    const ticket = await ClientTicket.updateStatus(id, firmId, status);
    res.json(ticket);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Talep durumu güncellenemedi.' });
  }
};
