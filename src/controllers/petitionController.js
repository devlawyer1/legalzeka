const Petition = require('../models/Petition');
const PetitionComparison = require('../models/PetitionComparison');
const Case = require('../models/Case');
const { generatePetition, comparePetitions } = require('../services/llmService');
const { pool } = require('../config/db');

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function flattenAnalysis(rows, key) {
  return rows.flatMap((row) => asArray(row.extracted_data?.[key]));
}

async function loadWorkspaceContext(caseId, firmId) {
  const { rows } = await pool.query(
    `SELECT cda.extracted_data, cda.warnings, cd.document_name
     FROM case_document_analyses cda
     JOIN case_documents cd ON cd.id = cda.document_id
     WHERE cda.case_id = $1 AND cda.firm_id = $2
     ORDER BY cda.completed_at DESC NULLS LAST`,
    [caseId, firmId]
  );

  return {
    analyzedDocumentCount: rows.length,
    claims: flattenAnalysis(rows, 'claims').slice(0, 12),
    defenses: flattenAnalysis(rows, 'defenses').slice(0, 12),
    facts: flattenAnalysis(rows, 'facts').slice(0, 12),
    evidenceMap: flattenAnalysis(rows, 'evidenceMap').slice(0, 12),
    missingElements: flattenAnalysis(rows, 'missingElements').slice(0, 12),
    contradictions: flattenAnalysis(rows, 'contradictions').slice(0, 12),
    warnings: rows.flatMap((row) => asArray(row.warnings)).slice(0, 12),
  };
}

function formatWorkspaceContext(context) {
  if (!context.analyzedDocumentCount) return 'Analiz edilmiş dosya belgesi yok.';

  return [
    `Analiz edilen belge sayısı: ${context.analyzedDocumentCount}`,
    `İddia/Talep sinyalleri: ${context.claims.join(' | ') || 'Yok'}`,
    `Savunma/İtiraz sinyalleri: ${context.defenses.join(' | ') || 'Yok'}`,
    `Vakıalar: ${context.facts.join(' | ') || 'Yok'}`,
    `Deliller: ${context.evidenceMap.map((item) => item.evidence || item).join(' | ') || 'Yok'}`,
    `Eksik unsur uyarıları: ${context.missingElements.join(' | ') || 'Yok'}`,
  ].join('\n');
}

function buildPetitionControlReport({ petitionType, parties, evidence, additionalNotes, generatedContent, workspaceContext }) {
  const missingRequired = [];
  if (!parties || parties.trim().length < 10) missingRequired.push('Taraf bilgileri zayıf veya eksik.');
  if (!evidence || evidence.trim().length < 10) missingRequired.push('Delil listesi zayıf veya eksik.');
  if (!additionalNotes || additionalNotes.trim().length < 20) missingRequired.push('Olay özeti/talep notları zayıf veya eksik.');
  if (!workspaceContext.analyzedDocumentCount) missingRequired.push('Dosya Odası analizinden beslenen belge bulunmuyor.');

  const content = String(generatedContent || '');
  const hasConclusion = /sonuç\s+ve\s+talep|talep\s+eder|arz\s+ve\s+talep/i.test(content);
  const hasLegalSource = /(HMK|CMK|TBK|TMK|TCK|İİK|IİK|m\.\s*\d+|madde\s+\d+|Yargıtay|Danıştay|AYM|BAM)/i.test(content);

  return {
    petitionType,
    status: missingRequired.length ? 'needs_review' : 'draft_ready',
    requiredInfoMissing: missingRequired,
    missingElements: workspaceContext.missingElements,
    contradictions: workspaceContext.contradictions,
    requestConclusionAlignment: {
      status: hasConclusion ? 'present' : 'needs_review',
      message: hasConclusion
        ? 'Taslakta sonuç ve talep bölümü sinyali bulundu.'
        : 'Sonuç ve talep bölümü manuel kontrol edilmeli.',
    },
    counterpartyObjections: workspaceContext.defenses.length
      ? workspaceContext.defenses
      : ['Karşı tarafın olası itirazları dosya belgeleri üzerinden ayrıca kontrol edilmeli.'],
    sourceVerification: {
      status: hasLegalSource ? 'needs_source_check' : 'missing_sources',
      message: hasLegalSource
        ? 'Taslakta hukuki kaynak atfı sinyali var; madde/emsal doğruluğu kaynaklı araştırmayla kontrol edilmeli.'
        : 'Taslakta açık madde veya emsal atfı yakalanamadı; kaynaklı araştırma eklenmeli.',
    },
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Davanın dilekçelerini getir
 * GET /api/cases/:caseId/petitions
 */
exports.getPetitions = async (req, res, next) => {
  try {
    const firmId = req.user.firmId;
    const caseId = req.params.caseId;

    if (!firmId) return res.status(403).json({ success: false, message: 'Yetkisiz erişim.' });

    const petitions = await Petition.findByCaseId(caseId, firmId);
    res.status(200).json({ success: true, data: petitions });
  } catch (error) {
    next(error);
  }
};

/**
 * Tekil dilekçe getir
 * GET /api/cases/:caseId/petitions/:id
 */
exports.getPetitionById = async (req, res, next) => {
  try {
    const firmId = req.user.firmId;
    const id = req.params.id;

    if (!firmId) return res.status(403).json({ success: false, message: 'Yetkisiz erişim.' });

    const petition = await Petition.findById(id, firmId);
    if (!petition) return res.status(404).json({ success: false, message: 'Dilekçe bulunamadı.' });

    res.status(200).json({ success: true, data: petition });
  } catch (error) {
    next(error);
  }
};

/**
 * Yeni dilekçe oluştur (Manuel veya AI destekli olmadan doğrudan kaydetme)
 * POST /api/cases/:caseId/petitions
 */
exports.createPetition = async (req, res, next) => {
  try {
    const firmId = req.user.firmId;
    const caseId = req.params.caseId;
    const { title, type, content } = req.body;

    if (!firmId) return res.status(403).json({ success: false, message: 'Büro yetkiniz bulunmuyor.' });
    if (!title || !type || !content) {
      return res.status(400).json({ success: false, message: 'Başlık, tür ve içerik zorunludur.' });
    }

    const petition = await Petition.create({
      caseId,
      firmId,
      title,
      type,
      content,
      createdBy: req.user.id
    });

    res.status(201).json({ success: true, data: petition });
  } catch (error) {
    next(error);
  }
};

/**
 * Yapay Zeka ile Dilekçe Üret (Kaydetmeden önce taslak döndürür veya doğrudan kaydeder)
 * POST /api/cases/:caseId/petitions/generate
 */
exports.generateAiPetition = async (req, res, next) => {
  try {
    const firmId = req.user.firmId;
    const caseId = req.params.caseId;
    const { petitionType, parties, evidence, additionalNotes, save = false } = req.body;

    if (!firmId) return res.status(403).json({ success: false, message: 'Yetkisiz erişim.' });

    // Dava bilgilerini al
    const caseData = await Case.findById(caseId, firmId);
    if (!caseData) return res.status(404).json({ success: false, message: 'Dava bulunamadı.' });

    const workspaceContext = await loadWorkspaceContext(caseId, firmId);
    const caseDetails = [
      `Esas No: ${caseData.esas_no}`,
      `Mahkeme: ${caseData.mahkeme}`,
      `Konu: ${caseData.konu}`,
      `Davacı: ${caseData.taraf_davaci || 'Belirtilmedi'}`,
      `Davalı: ${caseData.taraf_davali || 'Belirtilmedi'}`,
      '',
      'DOSYA ODASI ANALİZ ÖZETİ:',
      formatWorkspaceContext(workspaceContext),
    ].join('\n');

    // LLM'den taslak iste
    const generatedContent = await generatePetition(caseDetails, petitionType, parties, evidence, additionalNotes);
    const controlReport = buildPetitionControlReport({
      petitionType,
      parties,
      evidence,
      additionalNotes,
      generatedContent,
      workspaceContext,
    });

    if (save) {
      const petition = await Petition.create({
        caseId,
        firmId,
        title: `${petitionType} Taslağı`,
        type: petitionType,
        content: generatedContent,
        createdBy: req.user.id,
        controlReport,
      });
      return res.status(201).json({ success: true, data: petition });
    }

    res.status(200).json({ success: true, content: generatedContent, controlReport });
  } catch (error) {
    next(error);
  }
};

/**
 * Dilekçe Güncelle
 * PUT /api/cases/:caseId/petitions/:id
 */
exports.updatePetition = async (req, res, next) => {
  try {
    const firmId = req.user.firmId;
    const id = req.params.id;
    const { title, type, content } = req.body;

    const updates = {};
    if (title !== undefined) updates.title = title;
    if (type !== undefined) updates.type = type;
    if (content !== undefined) updates.content = content;

    const updated = await Petition.update(id, firmId, updates);
    if (!updated) return res.status(404).json({ success: false, message: 'Dilekçe bulunamadı.' });

    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

/**
 * Dilekçe Sil
 * DELETE /api/cases/:caseId/petitions/:id
 */
exports.deletePetition = async (req, res, next) => {
  try {
    const firmId = req.user.firmId;
    const id = req.params.id;

    const success = await Petition.delete(id, firmId);
    if (!success) return res.status(404).json({ success: false, message: 'Dilekçe bulunamadı.' });

    res.status(200).json({ success: true, message: 'Dilekçe silindi.' });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// KARŞILAŞTIRMA İŞLEMLERİ
// ==========================================

/**
 * Karşılaştırma Raporlarını Getir
 * GET /api/cases/:caseId/petitions/comparisons
 */
exports.getComparisons = async (req, res, next) => {
  try {
    const firmId = req.user.firmId;
    const caseId = req.params.caseId;

    if (!firmId) return res.status(403).json({ success: false, message: 'Yetkisiz erişim.' });

    const comparisons = await PetitionComparison.findByCaseId(caseId, firmId);
    res.status(200).json({ success: true, data: comparisons });
  } catch (error) {
    next(error);
  }
};

/**
 * Yapay Zeka ile İki Dilekçeyi Karşılaştır ve Kaydet
 * POST /api/cases/:caseId/petitions/compare
 */
exports.compareAiPetitions = async (req, res, next) => {
  try {
    const firmId = req.user.firmId;
    const caseId = req.params.caseId;
    const { petition1Id, petition2Id } = req.body;

    if (!firmId) return res.status(403).json({ success: false, message: 'Yetkisiz erişim.' });

    const p1 = await Petition.findById(petition1Id, firmId);
    const p2 = await Petition.findById(petition2Id, firmId);

    if (!p1 || !p2) {
      return res.status(404).json({ success: false, message: 'Karşılaştırılacak dilekçelerden biri veya her ikisi bulunamadı.' });
    }

    // LLM'den analiz raporu iste
    const aiReport = await comparePetitions(p1.title, p1.content, p2.title, p2.content);

    // Raporu veritabanına kaydet
    const comparison = await PetitionComparison.create({
      caseId,
      firmId,
      petition1Id,
      petition2Id,
      aiReport,
      createdBy: req.user.id
    });

    res.status(201).json({ success: true, data: comparison });
  } catch (error) {
    next(error);
  }
};
