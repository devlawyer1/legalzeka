const Case = require('../models/Case');
const CaseDocument = require('../models/CaseDocument');
const CaseTimelineService = require('../services/caseTimelineService');
const { pool } = require('../config/db');

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function collectFromAnalyses(analyses, key) {
  return analyses.flatMap((analysis) => asArray(analysis.extracted_data?.[key]));
}

/**
 * Yeni dava dosyası oluşturur
 * POST /api/cases
 */
exports.createCase = async (req, res, next) => {
  try {
    const { esasNo, mahkeme, konu, tarafDavaci, tarafDavali, durum, atananAvukatId, notlar } = req.body;
    const firmId = req.user.firmId; // firmAuth middleware sets this

    if (!firmId) {
      return res.status(403).json({ success: false, message: 'Büro yetkiniz bulunmuyor.' });
    }

    const newCase = await Case.create({
      firmId, 
      esasNo, 
      mahkeme, 
      konu, 
      tarafDavaci, 
      tarafDavali, 
      durum, 
      atananAvukatId, 
      notlar
    });

    res.status(201).json({ success: true, data: newCase });
  } catch (error) {
    next(error);
  }
};

/**
 * Bürodaki tüm davaları getirir
 * GET /api/cases
 */
exports.getCases = async (req, res, next) => {
  try {
    const firmId = req.user.firmId;
    if (!firmId) return res.status(403).json({ success: false, message: 'Yetkisiz erişim.' });
    
    const cases = await Case.findByFirmId(firmId);
    res.status(200).json({ success: true, data: cases });
  } catch (error) {
    next(error);
  }
};

/**
 * Tekil dava detayı
 * GET /api/cases/:id
 */
exports.getCaseById = async (req, res, next) => {
  try {
    const firmId = req.user.firmId;
    const caseId = req.params.id;
    if (!firmId) return res.status(403).json({ success: false, message: 'Yetkisiz erişim.' });

    const caseData = await Case.findById(caseId, firmId);
    if (!caseData) return res.status(404).json({ success: false, message: 'Dava bulunamadı.' });

    res.status(200).json({ success: true, data: caseData });
  } catch (error) {
    next(error);
  }
};

/**
 * Dava günceller
 * PUT /api/cases/:id
 */
exports.updateCase = async (req, res, next) => {
  try {
    const firmId = req.user.firmId;
    const caseId = req.params.id;
    
    // Convert camelCase keys to snake_case equivalent expected by BD
    const payload = {};
    if (req.body.esasNo !== undefined) payload.esas_no = req.body.esasNo;
    if (req.body.mahkeme !== undefined) payload.mahkeme = req.body.mahkeme;
    if (req.body.konu !== undefined) payload.konu = req.body.konu;
    if (req.body.tarafDavaci !== undefined) payload.taraf_davaci = req.body.tarafDavaci;
    if (req.body.tarafDavali !== undefined) payload.taraf_davali = req.body.tarafDavali;
    if (req.body.durum !== undefined) payload.durum = req.body.durum;
    if (req.body.atananAvukatId !== undefined) payload.atanan_avukat_id = req.body.atananAvukatId;
    if (req.body.notlar !== undefined) payload.notlar = req.body.notlar;

    const updated = await Case.update(caseId, firmId, payload);
    if (!updated) return res.status(404).json({ success: false, message: 'Dava bulunamadı veya değiştirilemedi.' });
    
    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

/**
 * Dava Siler (Soft delete)
 * DELETE /api/cases/:id
 */
exports.deleteCase = async (req, res, next) => {
  try {
    const firmId = req.user.firmId;
    const caseId = req.params.id;
    
    const success = await Case.delete(caseId, firmId);
    if (!success) return res.status(404).json({ success: false, message: 'Dava bulunamadı.' });
    
    res.status(200).json({ success: true, message: 'Dava arşive kaldırıldı.' });
  } catch (error) {
    next(error);
  }
};

/**
 * AI Dosya Odası çalışma alanı
 * GET /api/cases/:caseId/workspace
 */
exports.getCaseWorkspace = async (req, res, next) => {
  try {
    const firmId = req.user.firmId;
    const caseId = req.params.caseId;

    if (!firmId) return res.status(403).json({ success: false, message: 'Yetkisiz erişim.' });

    const caseData = await Case.findById(caseId, firmId);
    if (!caseData) return res.status(404).json({ success: false, message: 'Dava bulunamadı.' });

    const [documents, analysisResult, timelineResult] = await Promise.all([
      CaseDocument.findByCaseId(caseId, firmId),
      pool.query(
        `SELECT cda.*, cd.document_name
         FROM case_document_analyses cda
         JOIN case_documents cd ON cd.id = cda.document_id
         WHERE cda.case_id = $1 AND cda.firm_id = $2
         ORDER BY cda.completed_at DESC NULLS LAST, cda.created_at DESC`,
        [caseId, firmId]
      ),
      CaseTimelineService.buildTimeline(caseId).catch((error) => ({
        caseInfo: caseData,
        events: [],
        totalEvents: 0,
        error: error.message,
      })),
    ]);

    const analyses = analysisResult.rows || [];
    const claims = collectFromAnalyses(analyses, 'claims');
    const defenses = collectFromAnalyses(analyses, 'defenses');
    const facts = collectFromAnalyses(analyses, 'facts');
    const evidenceMap = collectFromAnalyses(analyses, 'evidenceMap');
    const contradictions = collectFromAnalyses(analyses, 'contradictions');
    const missingElements = collectFromAnalyses(analyses, 'missingElements');
    const nextActions = collectFromAnalyses(analyses, 'nextActions');
    const analysisTimeline = collectFromAnalyses(analyses, 'timeline');

    res.status(200).json({
      success: true,
      data: {
        case: caseData,
        documents,
        analyses,
        parties: {
          claimant: caseData.taraf_davaci,
          defendant: caseData.taraf_davali,
          attorneys: collectFromAnalyses(analyses, 'parties')
            .flatMap((party) => asArray(party?.attorneys))
            .filter(Boolean),
        },
        claims,
        defenses,
        facts,
        timeline: [
          ...(timelineResult.events || []),
          ...analysisTimeline.map((event) => ({
            date: event.date,
            title: event.event,
            description: event.legalImportance,
            type: 'ai_extract',
            severity: 'info',
            icon: 'file-search',
            meta: event,
          })),
        ].filter((event) => event.date).sort((a, b) => new Date(a.date) - new Date(b.date)),
        evidenceMap,
        contradictions,
        missingElements,
        nextActions,
      },
    });
  } catch (error) {
    next(error);
  }
};
