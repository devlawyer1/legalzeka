const CaseDocument = require('../models/CaseDocument');
const Case = require('../models/Case');
const Task = require('../models/Task');
const DeadlineService = require('../services/deadlineService');
const { chat } = require('../services/llmService');
const { parseFileText } = require('../utils/fileParser');
const path = require('path');

function compact(text, max = 9000) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function extractDates(text) {
  const dateRegex = /\b(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}-\d{2}-\d{2})\b/g;
  return [...new Set(String(text || '').match(dateRegex) || [])].slice(0, 30);
}

function extractLinesByKeywords(text, keywords, limit = 8) {
  const lowerKeywords = keywords.map((keyword) => keyword.toLocaleLowerCase('tr-TR'));
  return String(text || '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((line) => line.trim())
    .filter((line) => {
      const lower = line.toLocaleLowerCase('tr-TR');
      return line.length > 25 && lowerKeywords.some((keyword) => lower.includes(keyword));
    })
    .slice(0, limit);
}

function buildFallbackAnalysis({ text, document, caseData }) {
  const dates = extractDates(text);
  const claims = extractLinesByKeywords(text, ['iddia', 'talep', 'dava', 'alacak', 'tazminat', 'fesih']);
  const defenses = extractLinesByKeywords(text, ['savunma', 'itiraz', 'redd', 'zamanaşımı', 'yetki', 'usul']);
  const evidenceLines = extractLinesByKeywords(text, ['delil', 'sözleşme', 'dekont', 'tanık', 'rapor', 'tutanak', 'whatsapp']);
  const warnings = [];

  if (!text || text.trim().length < 200) {
    warnings.push({
      code: 'LOW_TEXT_EXTRACTION',
      label: 'Metin çıkarımı zayıf',
      message: 'Belgeden sınırlı metin çıkarıldı; OCR veya orijinal dosya kalitesi kontrol edilmeli.',
    });
  }

  if (claims.length === 0) {
    warnings.push({
      code: 'CLAIMS_NOT_DETECTED',
      label: 'İddia/talep bulunamadı',
      message: 'Belgede otomatik iddia veya talep cümlesi yakalanamadı; manuel kontrol önerilir.',
    });
  }

  return {
    document: {
      id: document.id,
      name: document.document_name,
      type: document.document_type || 'Genel',
    },
    parties: {
      claimant: caseData?.taraf_davaci || null,
      defendant: caseData?.taraf_davali || null,
    },
    claims,
    defenses,
    facts: extractLinesByKeywords(text, ['olay', 'tarihinde', 'gerçekleş', 'meydana', 'taraflar']),
    timeline: dates.map((date) => ({
      date,
      event: 'Belgede geçen tarih',
      sourceDocument: document.document_name,
      legalImportance: 'Manuel önemlendirme bekliyor',
    })),
    evidenceMap: evidenceLines.map((line) => ({
      evidence: line.slice(0, 160),
      relatedFact: 'Belge metninden otomatik çıkarım',
      legalElement: 'Manuel sınıflandırma bekliyor',
    })),
    contradictions: [],
    missingElements: warnings.map((warning) => warning.message),
    nextActions: [
      'Belge analizini avukat kontrolünden geçir',
      'Eksik delil ve süre risklerini dosya görevlerine dönüştür',
    ],
    summary: `${document.document_name} belgesinden ${dates.length} tarih, ${claims.length} iddia/talep, ${defenses.length} savunma/itiraz sinyali çıkarıldı.`,
    warnings,
  };
}

function extractJson(text) {
  if (!text) return null;
  const raw = String(text).trim();
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i) || raw.match(/```\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch (_) {
    return null;
  }
}

async function enrichWithAi({ text, fallback, caseData }) {
  if (!text || text.trim().length < 200) return fallback;

  const systemPrompt = `Sen Legal Zeka Dosya Odasi analiz motorusun.
Yalnizca verilen belge metni ve dava bilgisine dayan.
Kesin karar, kazanma ihtimali veya nihai hukuki sonuc uretme.
Cevabi yalnizca gecerli JSON olarak ver.`;

  const userPrompt = `Dava bilgisi:
Mahkeme: ${caseData?.mahkeme || 'Belirtilmemis'}
Esas No: ${caseData?.esas_no || 'Belirtilmemis'}
Konu: ${caseData?.konu || 'Belirtilmemis'}
Davaci: ${caseData?.taraf_davaci || 'Belirtilmemis'}
Davali: ${caseData?.taraf_davali || 'Belirtilmemis'}

Belge metni:
${compact(text)}

Su JSON semasina uy:
{
  "parties": {"claimant": string|null, "defendant": string|null, "attorneys": string[]},
  "claims": string[],
  "defenses": string[],
  "facts": string[],
  "timeline": [{"date": string, "event": string, "sourceDocument": string, "legalImportance": string}],
  "evidenceMap": [{"evidence": string, "relatedFact": string, "legalElement": string}],
  "contradictions": string[],
  "missingElements": string[],
  "nextActions": string[],
  "summary": string,
  "warnings": [{"code": string, "label": string, "message": string}]
}`;

  try {
    const aiText = await chat([], userPrompt, systemPrompt);
    const parsed = extractJson(aiText);
    if (!parsed) return fallback;
    return {
      ...fallback,
      ...parsed,
      document: fallback.document,
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : fallback.warnings,
    };
  } catch (error) {
    console.error('[CaseDocumentAnalysis] AI enrichment failed:', error.message);
    return fallback;
  }
}

async function createHumanReviewTasks({ firmId, caseId, userId, deadlines }) {
  const tasks = [];

  for (const deadline of deadlines || []) {
    try {
      const taskDueDate = new Date(deadline.deadline_date);
      if (!Number.isNaN(taskDueDate.getTime())) {
        taskDueDate.setDate(taskDueDate.getDate() - 3);
        if (taskDueDate < new Date()) {
          taskDueDate.setTime(new Date(deadline.deadline_date).getTime());
        }
      }

      const task = await Task.create({
        firmId,
        caseId,
        baslik: `${deadline.title} hazırlık kontrolü`,
        aciklama: [
          'Belge analizi süre riski tespit etti.',
          'Süre ve hukuki işlem avukat onayından geçmeden nihai işleme dönüştürülmemelidir.',
          deadline.description,
        ].filter(Boolean).join('\n\n'),
        atayanId: userId,
        atananId: userId,
        sonTarih: Number.isNaN(taskDueDate.getTime()) ? null : taskDueDate,
        oncelik: deadline.priority === 'critical' ? 'Kritik' : 'Yüksek',
        durum: 'Yapılacak',
      });
      tasks.push(task);
    } catch (error) {
      console.error('[CaseDocumentAnalysis] Workflow task failed:', error.message);
    }
  }

  return tasks;
}

/**
 * Davaya Belge Yükle
 * POST /api/cases/:caseId/documents
 */
exports.uploadDocument = async (req, res, next) => {
  try {
    const firmId = req.user.firmId;
    const caseId = req.params.caseId;

    if (!firmId) return res.status(403).json({ success: false, message: 'Büro yetkiniz bulunmuyor.' });

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Lütfen bir dosya yükleyin.' });
    }

    const document = await CaseDocument.create({
      caseId,
      firmId,
      documentName: req.file.originalname,
      fileUrl: `/uploads/${req.file.filename}`,
      uploadedBy: req.user.id,
      documentType: req.body.documentType || req.body.document_type || 'Genel',
      description: req.body.description || null,
    });

    res.status(201).json({ success: true, data: document });
  } catch (error) {
    next(error);
  }
};

/**
 * Belge Analizi
 * POST /api/cases/:caseId/documents/:docId/analyze
 */
exports.analyzeDocument = async (req, res, next) => {
  try {
    const firmId = req.user.firmId;
    const caseId = req.params.caseId;
    const docId = req.params.docId;

    if (!firmId) return res.status(403).json({ success: false, message: 'Yetkisiz erişim.' });

    const [document, caseData] = await Promise.all([
      CaseDocument.findById(docId, firmId, caseId),
      Case.findById(caseId, firmId),
    ]);

    if (!document || !caseData) {
      return res.status(404).json({ success: false, message: 'Dava veya belge bulunamadı.' });
    }

    const relativePath = String(document.file_url || '').replace(/^\/+/, '');
    const filePath = path.join(__dirname, '..', '..', relativePath);
    let extractedText = '';

    try {
      extractedText = await parseFileText(filePath);
    } catch (parseError) {
      await CaseDocument.markAnalysisFailed(docId, firmId, parseError.message);
      return res.status(422).json({
        success: false,
        message: `Belge metni çıkarılamadı: ${parseError.message}`,
      });
    }

    const fallback = buildFallbackAnalysis({ text: extractedText, document, caseData });
    const extractedData = await enrichWithAi({ text: extractedText, fallback, caseData });
    const warnings = Array.isArray(extractedData.warnings) ? extractedData.warnings : [];

    const analysis = await CaseDocument.saveAnalysis({
      firmId,
      caseId,
      documentId: docId,
      extractedText,
      summary: extractedData.summary || fallback.summary,
      extractedData,
      warnings,
      createdBy: req.user.id,
    });

    const deadlines = await DeadlineService.processDocumentAnalysis(
      { document, text: extractedText, analysis: extractedData },
      firmId,
      caseId,
      req.user.id
    );
    const tasks = await createHumanReviewTasks({
      firmId,
      caseId,
      userId: req.user.id,
      deadlines,
    });

    res.status(200).json({
      success: true,
      data: {
        analysis,
        extractedData,
        warnings,
        workflowAutomations: {
          deadlines,
          tasks,
          requiresHumanApproval: true,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Davanın Belgelerini Listele
 * GET /api/cases/:caseId/documents
 */
exports.getDocuments = async (req, res, next) => {
  try {
    const firmId = req.user.firmId;
    const caseId = req.params.caseId;

    if (!firmId) return res.status(403).json({ success: false, message: 'Yetkisiz erişim.' });

    const documents = await CaseDocument.findByCaseId(caseId, firmId);
    res.status(200).json({ success: true, data: documents });
  } catch (error) {
    next(error);
  }
};

/**
 * Belge Sil
 * DELETE /api/cases/:caseId/documents/:docId
 */
exports.deleteDocument = async (req, res, next) => {
  try {
    const firmId = req.user.firmId;
    const docId = req.params.docId;

    const deleted = await CaseDocument.delete(docId, firmId);
    if (!deleted) return res.status(404).json({ success: false, message: 'Belge bulunamadı.' });

    // Dosyayı diskten de silmek isterseniz burada fs.unlink yapılabilir
    res.status(200).json({ success: true, message: 'Belge silindi.' });
  } catch (error) {
    next(error);
  }
};
