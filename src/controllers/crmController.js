const { v4: uuidv4 } = require('uuid');
const Lead = require('../models/Lead');
const Proposal = require('../models/Proposal');
const Case = require('../models/Case');
const Invoice = require('../models/Invoice');

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildInvoiceNumber(prefix = 'LZ') {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  return `${prefix}-${stamp}-${uuidv4().slice(0, 6).toUpperCase()}`;
}

exports.getLeads = async (req, res) => {
  try {
    const { firmId } = req.params;
    const leads = await Lead.findByFirmId(firmId);
    res.json(leads);
  } catch (err) {
    console.error('Error fetching leads:', err);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
};

exports.createLead = async (req, res) => {
  try {
    const { firmId } = req.params;
    const { name, contact_info, subject, estimated_value, assigned_to, notes } = req.body;
    
    const newLead = await Lead.create({
      id: uuidv4(),
      firm_id: firmId,
      name,
      contact_info,
      subject,
      estimated_value: estimated_value || 0,
      stage: 'ilk_gorusme',
      assigned_to: assigned_to || null,
      notes
    });
    
    res.status(201).json(newLead);
  } catch (err) {
    console.error('Error creating lead:', err);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
};

exports.updateLeadStage = async (req, res) => {
  try {
    const { firmId, leadId } = req.params;
    const { stage } = req.body;
    
    const updatedLead = await Lead.update(leadId, { stage }, firmId);
    if (!updatedLead) return res.status(404).json({ error: 'Aday müvekkil bulunamadı' });
    res.json(updatedLead);
  } catch (err) {
    console.error('Error updating lead stage:', err);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
};

exports.updateLead = async (req, res) => {
  try {
    const { firmId, leadId } = req.params;
    const updatedLead = await Lead.update(leadId, req.body, firmId);
    if (!updatedLead) return res.status(404).json({ error: 'Aday müvekkil bulunamadı' });
    res.json(updatedLead);
  } catch (err) {
    console.error('Error updating lead:', err);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
};

exports.deleteLead = async (req, res) => {
  try {
    const { firmId, leadId } = req.params;
    await Lead.delete(leadId, firmId);
    res.json({ message: 'Aday müvekkil silindi' });
  } catch (err) {
    console.error('Error deleting lead:', err);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
};

// ================= Proposals =================

exports.getProposals = async (req, res) => {
  try {
    const { firmId, leadId } = req.params;
    const lead = await Lead.findById(leadId, firmId);
    if (!lead) return res.status(404).json({ error: 'Aday müvekkil bulunamadı' });

    const proposals = await Proposal.findByLeadId(leadId, firmId);
    res.json(proposals);
  } catch (err) {
    console.error('Error fetching proposals:', err);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
};

exports.createProposal = async (req, res) => {
  try {
    const { firmId } = req.params;
    const leadId = req.params.leadId || req.body.lead_id;
    const { title, content, amount, notes, status } = req.body;
    
    const lead = await Lead.findById(leadId, firmId);
    if (!lead) return res.status(404).json({ error: 'Aday müvekkil bulunamadı' });
    
    const newProposal = await Proposal.create({
      id: uuidv4(),
      lead_id: leadId,
      firm_id: firmId,
      title: title || `${lead.subject || 'Hukuki Hizmet'} Teklifi`,
      content: content || notes || 'Hukuki hizmet teklif taslağı',
      amount: amount || 0,
      status: status || 'taslak',
      created_by: req.user.id
    });

    await Lead.update(leadId, { stage: 'pazarlik' }, firmId);
    
    res.status(201).json(newProposal);
  } catch (err) {
    console.error('Error creating proposal:', err);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
};

exports.convertLeadToCase = async (req, res) => {
  try {
    const { firmId, leadId } = req.params;
    const { proposalId, case: caseInput = {}, invoice: invoiceInput = {}, createInvoice = true } = req.body;

    const lead = await Lead.findById(leadId, firmId);
    if (!lead) return res.status(404).json({ error: 'Aday müvekkil bulunamadı' });
    if (lead.converted_case_id) {
      return res.status(409).json({ error: 'Bu aday müvekkil zaten dosyaya dönüştürülmüş.' });
    }

    let proposal = null;
    if (proposalId) {
      proposal = await Proposal.findById(proposalId, firmId);
      if (!proposal || proposal.lead_id !== leadId) {
        return res.status(404).json({ error: 'Teklif bulunamadı' });
      }
    } else {
      const proposals = await Proposal.findByLeadId(leadId, firmId);
      proposal = proposals[0] || null;
    }

    const newCase = await Case.create({
      firmId,
      esasNo: caseInput.esasNo || `CRM-${new Date().getFullYear()}-${lead.id.slice(0, 8)}`,
      mahkeme: caseInput.mahkeme || 'Belirlenecek',
      konu: caseInput.konu || lead.subject || 'Yeni müvekkil dosyası',
      tarafDavaci: caseInput.tarafDavaci || lead.name,
      tarafDavali: caseInput.tarafDavali || caseInput.opponent || 'Belirlenecek',
      durum: 'Açık',
      atananAvukatId: caseInput.atananAvukatId || lead.assigned_to || req.user.id,
      notlar: [
        lead.notes,
        lead.contact_info ? `İletişim: ${lead.contact_info}` : '',
        proposal ? `Teklif: ${proposal.title} (${proposal.amount} TL)` : '',
      ].filter(Boolean).join('\n\n'),
    });

    let invoice = null;
    if (createInvoice) {
      const amount = toNumber(invoiceInput.amount, toNumber(proposal?.amount, toNumber(lead.estimated_value, 0)));
      const taxRate = toNumber(invoiceInput.tax_rate, 20);
      const totalAmount = toNumber(invoiceInput.total_amount, amount * (1 + taxRate / 100));
      invoice = await Invoice.create({
        firm_id: firmId,
        lead_id: leadId,
        case_id: newCase.id,
        client_name: invoiceInput.client_name || lead.name,
        invoice_number: invoiceInput.invoice_number || buildInvoiceNumber('LZ'),
        amount,
        tax_rate: taxRate,
        total_amount: totalAmount,
        issue_date: invoiceInput.issue_date || new Date(),
        due_date: invoiceInput.due_date || addDays(new Date(), 14),
        status: invoiceInput.status || 'pending',
        notes: invoiceInput.notes || 'CRM dönüşüm akışında otomatik oluşturuldu.',
        is_recurring: Boolean(invoiceInput.is_recurring),
      });
    }

    if (proposal) {
      await Proposal.update(proposal.id, { status: 'kabul_edildi' }, firmId);
    }

    const updatedLead = await Lead.update(
      leadId,
      {
        stage: 'sozlesme_imzalandi',
        converted_case_id: newCase.id,
        converted_at: new Date(),
      },
      firmId
    );

    res.status(201).json({
      lead: updatedLead,
      case: newCase,
      proposal,
      invoice,
      nextSteps: [
        'Dosya Odası üzerinden ilk belgeyi yükleyin.',
        'Süre ve görev akışını insan onayıyla başlatın.',
        'Fatura/tahsilat durumunu finans ekranından takip edin.',
      ],
    });
  } catch (err) {
    console.error('Error converting lead:', err);
    res.status(500).json({ error: 'Aday müvekkil dosyaya dönüştürülemedi.' });
  }
};
