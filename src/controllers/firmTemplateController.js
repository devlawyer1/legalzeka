const FirmTemplate = require('../models/FirmTemplate');
const TemplateRagService = require('../services/templateRagService');

// Firmaya ait tüm şablonları getir
exports.getFirmTemplates = async (req, res) => {
  try {
    const firmId = req.params.firmId;
    const templates = await FirmTemplate.findByFirm(firmId);
    res.json({ data: templates });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Yeni şablon ekle ve vektörize et
exports.createTemplate = async (req, res) => {
  try {
    const firmId = req.params.firmId;
    const { title, content, template_type, tags } = req.body;
    const userId = req.user?.id || req.body.userId; // auth middleware varsa req.user'dan gelir

    const template = await FirmTemplate.create({
      firm_id: firmId,
      title,
      content,
      template_type,
      tags,
      created_by: userId
    });

    // RAG için embedding işlemini asenkron başlat
    TemplateRagService.indexTemplate(template.id).catch(err => {
      console.error('Şablon embedding hatası:', err);
    });

    res.status(201).json({ message: 'Şablon başarıyla oluşturuldu ve indeksleniyor.', data: template });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Şablon sil
exports.deleteTemplate = async (req, res) => {
  try {
    const { id, firmId } = req.params;
    const deleted = await FirmTemplate.delete(id, firmId);
    if (!deleted) return res.status(404).json({ error: 'Şablon bulunamadı.' });
    res.json({ message: 'Şablon silindi.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Yapay zeka ile şablon üzerinden taslak üret (Kurumsal Hafıza)
exports.generateDraft = async (req, res) => {
  try {
    const firmId = req.params.firmId;
    const { prompt, caseData } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt gereklidir.' });
    }

    const result = await TemplateRagService.generateDraftFromTemplates(firmId, prompt, caseData);
    
    res.json({ data: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
