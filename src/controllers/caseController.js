const Case = require('../models/Case');
const CaseDocument = require('../models/CaseDocument');
const CaseTimelineService = require('../services/caseTimelineService');
const AuditLogService = require('../services/AuditLogService');
const { canUseOrganization, getAccessContext } = require('../services/accessContext');
const { pool } = require('../config/db');

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function collectFromAnalyses(analyses, key) {
  return analyses.flatMap((analysis) => asArray(analysis.extracted_data?.[key]));
}

function presentCase(caseData) {
  if (!caseData) return caseData;
  return {
    ...caseData,
    scopeType: caseData.scope_type,
    ownerUserId: caseData.owner_user_id,
    lawFirmId: caseData.law_firm_id,
  };
}

function normalizeScope(value) {
  return value ? String(value).trim().toUpperCase() : null;
}

exports.createCase = async (req, res, next) => {
  try {
    const {
      esasNo,
      mahkeme,
      konu,
      tarafDavaci,
      tarafDavali,
      durum,
      atananAvukatId,
      notlar,
    } = req.body;
    const accessContext = await getAccessContext(req);
    const lawFirmId = req.body.lawFirmId || req.body.firmId || null;
    const scopeType = normalizeScope(req.body.scopeType) || (lawFirmId ? 'ORGANIZATION' : null);

    if (!['PERSONAL', 'ORGANIZATION'].includes(scopeType)) {
      return res.status(400).json({
        success: false,
        message: 'scopeType PERSONAL veya ORGANIZATION olmalıdır.',
      });
    }

    if (scopeType === 'ORGANIZATION' && (!lawFirmId || !canUseOrganization(accessContext, lawFirmId, 'write'))) {
      await AuditLogService.record({
        req,
        action: 'ACCESS_DENIED',
        entityType: 'CASE',
        lawFirmId,
        success: false,
        metadata: { operation: 'create', scopeType },
      });
      return res.status(403).json({ success: false, message: 'Bu büroda dosya oluşturma yetkiniz yok.' });
    }

    const newCase = await Case.create({
      lawFirmId: scopeType === 'ORGANIZATION' ? lawFirmId : null,
      scopeType,
      ownerUserId: scopeType === 'PERSONAL' ? req.user.id : null,
      esasNo,
      mahkeme,
      konu,
      tarafDavaci,
      tarafDavali,
      durum,
      atananAvukatId,
      notlar,
    });

    await AuditLogService.record({
      req,
      action: 'CASE_CREATED',
      entityType: 'CASE',
      entityId: newCase.id,
      caseId: newCase.id,
      lawFirmId: newCase.law_firm_id,
      metadata: { scopeType: newCase.scope_type },
    });
    res.status(201).json({ success: true, data: presentCase(newCase) });
  } catch (error) {
    next(error);
  }
};

exports.getCases = async (req, res, next) => {
  try {
    const accessContext = await getAccessContext(req);
    const scopeType = normalizeScope(req.query.scopeType);
    if (scopeType && !['PERSONAL', 'ORGANIZATION'].includes(scopeType)) {
      return res.status(400).json({ success: false, message: 'Geçersiz scopeType.' });
    }

    const cases = await Case.findAccessible(accessContext, {
      scopeType,
      lawFirmId: req.query.lawFirmId || req.query.firmId || null,
    });
    res.status(200).json({ success: true, data: cases.map(presentCase) });
  } catch (error) {
    next(error);
  }
};

exports.getCaseById = async (req, res, next) => {
  try {
    await AuditLogService.record({
      req,
      action: 'CASE_VIEWED',
      entityType: 'CASE',
      entityId: req.matter.id,
      caseId: req.matter.id,
      lawFirmId: req.matter.law_firm_id,
    });
    res.status(200).json({ success: true, data: presentCase(req.matter) });
  } catch (error) {
    next(error);
  }
};

exports.updateCase = async (req, res, next) => {
  try {
    const payload = {};
    if (req.body.esasNo !== undefined) payload.esas_no = req.body.esasNo;
    if (req.body.mahkeme !== undefined) payload.mahkeme = req.body.mahkeme;
    if (req.body.konu !== undefined) payload.konu = req.body.konu;
    if (req.body.tarafDavaci !== undefined) payload.taraf_davaci = req.body.tarafDavaci;
    if (req.body.tarafDavali !== undefined) payload.taraf_davali = req.body.tarafDavali;
    if (req.body.durum !== undefined) payload.durum = req.body.durum;
    if (req.body.atananAvukatId !== undefined) payload.atanan_avukat_id = req.body.atananAvukatId;
    if (req.body.notlar !== undefined) payload.notlar = req.body.notlar;

    const updated = await Case.updateAccessible(req.matter.id, req.accessContext, payload);
    if (!updated) return res.status(404).json({ success: false, message: 'Dava bulunamadı veya değiştirilemedi.' });

    await AuditLogService.record({
      req,
      action: 'CASE_UPDATED',
      entityType: 'CASE',
      entityId: updated.id,
      caseId: updated.id,
      lawFirmId: updated.law_firm_id,
      metadata: { fields: Object.keys(payload) },
    });
    res.status(200).json({ success: true, data: presentCase(updated) });
  } catch (error) {
    next(error);
  }
};

exports.deleteCase = async (req, res, next) => {
  try {
    const success = await Case.deleteAccessible(req.matter.id, req.accessContext);
    if (!success) return res.status(404).json({ success: false, message: 'Dava bulunamadı.' });

    await AuditLogService.record({
      req,
      action: 'CASE_DELETED',
      entityType: 'CASE',
      entityId: req.matter.id,
      caseId: req.matter.id,
      lawFirmId: req.matter.law_firm_id,
    });
    res.status(200).json({ success: true, message: 'Dava arşive kaldırıldı.' });
  } catch (error) {
    next(error);
  }
};

exports.getCaseWorkspace = async (req, res, next) => {
  try {
    const caseData = req.matter;
    const caseId = caseData.id;
    const [documents, analysisResult, timelineResult, matterParties, matterEvents] = await Promise.all([
      CaseDocument.findByCaseIdAccessible(caseId, req.accessContext),
      pool.query(
        `SELECT cda.*, cd.document_name
         FROM case_document_analyses cda
         JOIN case_documents cd ON cd.id = cda.document_id
         WHERE cda.case_id = $1 AND cd.deleted_at IS NULL
         ORDER BY cda.completed_at DESC NULLS LAST, cda.created_at DESC`,
        [caseId]
      ),
      CaseTimelineService.buildTimeline(caseId).catch((error) => ({
        caseInfo: caseData,
        events: [],
        totalEvents: 0,
        error: error.message,
      })),
      pool.query(
        `SELECT mp.*, cd.original_filename
         FROM matter_parties mp JOIN case_documents cd ON cd.id = mp.source_document_id
         WHERE mp.case_id = $1 ORDER BY mp.verified_at DESC`,
        [caseId]
      ),
      pool.query(
        `SELECT me.*, cd.original_filename
         FROM matter_events me JOIN case_documents cd ON cd.id = me.source_document_id
         WHERE me.case_id = $1 ORDER BY me.event_date NULLS LAST, me.verified_at DESC`,
        [caseId]
      ),
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

    await AuditLogService.record({
      req,
      action: 'CASE_VIEWED',
      entityType: 'CASE_WORKSPACE',
      entityId: caseId,
      caseId,
      lawFirmId: caseData.law_firm_id,
    });
    res.status(200).json({
      success: true,
      data: {
        case: presentCase(caseData),
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
        matterTwin: {
          parties: matterParties.rows,
          events: matterEvents.rows,
          metadata: {
            caseNumber: caseData.esas_no,
            court: caseData.mahkeme,
            legalDomain: caseData.legal_domain,
          },
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports.presentCase = presentCase;
