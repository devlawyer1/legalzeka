const Petition = require('../models/Petition');
const PetitionComparison = require('../models/PetitionComparison');
const Case = require('../models/Case');
const { generatePetition, comparePetitions } = require('../services/llmService');
const { pool } = require('../config/db');
const AuditLogService = require('../services/AuditLogService');
const { getAccessContext } = require('../services/accessContext');
const { getDraftingServices } = require('../services/drafting');

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function legacyDraftType(value) {
  const type = String(value || '').toLocaleLowerCase('tr-TR');
  if (/cevap/.test(type)) return 'RESPONSE';
  if (/istinaf|temyiz/.test(type)) return 'APPEAL';
  if (/itiraz/.test(type)) return 'OBJECTION';
  if (/ihtar/.test(type)) return 'NOTICE';
  if (/görüş|mütalaa/.test(type)) return 'LEGAL_OPINION';
  return 'PETITION';
}

function legacyContent(sections) {
  if (sections.length === 1) return sections[0].content;
  return sections.map((section) => `${section.title}\n${section.content}`.trim()).filter(Boolean).join('\n\n');
}

function asLegacyPetition(detail) {
  return {
    id: detail.legacy_petition_id || detail.id,
    draft_id: detail.id,
    case_id: detail.case_id,
    firm_id: detail.organization_id,
    title: detail.title,
    type: detail.draft_type,
    content: legacyContent(detail.sections || []),
    version: detail.versions?.[0]?.version_number || 1,
    control_report: detail.metadata?.lastAnalysis || {},
    created_by: detail.created_by,
    created_at: detail.created_at,
    updated_at: detail.updated_at,
  };
}

async function accessContext(req) {
  const context = await getAccessContext(req);
  if (!context) {
    const error = new Error('Kimlik doğrulaması gerekli.');
    error.status = 401;
    throw error;
  }
  return context;
}

async function resolveLegacyDraft(caseId, id, context) {
  const services = getDraftingServices();
  const drafts = await services.draftService.list({ accessContext: context, caseId, limit: 200 });
  const match = drafts.find((draft) => draft.id === id || draft.legacy_petition_id === id);
  return match ? services.draftService.getDetail(match.id, context) : null;
}

async function auditDraft(req, action, draft, metadata = {}) {
  await AuditLogService.record({
    req,
    strict: true,
    action,
    entityType: 'LEGAL_DRAFT',
    entityId: draft.id,
    caseId: draft.case_id,
    lawFirmId: draft.organization_id,
    metadata: { legacyAdapter: true, ...metadata },
  });
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
    const caseId = req.params.caseId;
    const context = await accessContext(req);
    const services = getDraftingServices();
    const drafts = await services.draftService.list({ accessContext: context, caseId, limit: 200 });
    const petitions = [];
    for (const draft of drafts) {
      petitions.push(asLegacyPetition(await services.draftService.getDetail(draft.id, context)));
    }
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
    const petition = await resolveLegacyDraft(req.params.caseId, req.params.id, await accessContext(req));
    if (!petition) return res.status(404).json({ success: false, message: 'Dilekçe bulunamadı.' });
    res.status(200).json({ success: true, data: asLegacyPetition(petition) });
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
    const caseId = req.params.caseId;
    const { title, type, content } = req.body;
    if (!title || !type || !content) {
      return res.status(400).json({ success: false, message: 'Başlık, tür ve içerik zorunludur.' });
    }
    const context = await accessContext(req);
    const services = getDraftingServices();
    const created = await services.draftService.create({
      caseId, title, draftType: legacyDraftType(type),
      sections: [{ sectionKey: 'FACTS', title: 'Dilekçe Metni', content }],
    }, context);
    const detail = await services.draftService.getDetail(created.id, context);
    await auditDraft(req, 'DRAFT_CREATED', detail, { versionId: detail.current_version_id });
    await auditDraft(req, 'DRAFT_VERSION_CREATED', detail, { versionId: detail.current_version_id, versionNumber: 1 });
    res.status(201).json({
      success: true,
      data: asLegacyPetition(detail),
      deprecation: { replacement: '/api/v1/drafts', canonicalDraftId: detail.id },
    });
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

    res.status(200).json({
      success: true,
      content: generatedContent,
      controlReport,
      approvalRequired: true,
      saved: false,
      saveRequested: Boolean(save),
      message: 'AI çıktısı kullanıcı onayı olmadan belgeye kaydedilmedi.',
    });
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
    const context = await accessContext(req);
    const current = await resolveLegacyDraft(req.params.caseId, req.params.id, context);
    if (!current) return res.status(404).json({ success: false, message: 'Dilekçe bulunamadı.' });
    const input = {};
    if (req.body.title !== undefined) input.title = req.body.title;
    if (req.body.content !== undefined) {
      input.sections = current.sections.map((section) => section.sectionKey === 'FACTS'
        ? { ...section, title: current.sections.length === 1 ? 'Dilekçe Metni' : section.title, content: req.body.content }
        : section);
      input.changeSummary = 'Legacy API kullanıcı düzenlemesi';
    }
    if (!Object.keys(input).length) return res.status(400).json({ success: false, message: 'Güncellenecek alan bulunamadı.' });
    const result = await getDraftingServices().draftService.update(current.id, input, context);
    const updated = await getDraftingServices().draftService.getDetail(current.id, context);
    await auditDraft(req, 'DRAFT_UPDATED', updated, { versionCreated: Boolean(input.sections) });
    if (input.sections) await auditDraft(req, 'DRAFT_VERSION_CREATED', updated, { versionId: result.id, versionNumber: result.version_number });
    res.status(200).json({ success: true, data: asLegacyPetition(updated), deprecation: { replacement: `/api/v1/drafts/${current.id}` } });
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
    const context = await accessContext(req);
    const current = await resolveLegacyDraft(req.params.caseId, req.params.id, context);
    if (!current) return res.status(404).json({ success: false, message: 'Dilekçe bulunamadı.' });
    await getDraftingServices().draftService.softDelete(current.id, context);
    await auditDraft(req, 'DRAFT_UPDATED', current, { status: 'ARCHIVED' });
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
