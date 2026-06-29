const { z } = require('zod');
const AuditLogService = require('../services/AuditLogService');
const { getAccessContext } = require('../services/accessContext');
const { getDraftingServices } = require('../services/drafting');

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const section = z.object({
  id: uuid.optional(),
  sectionKey: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(300),
  content: z.string().max(150000),
  sortOrder: z.number().int().min(0).max(100).optional(),
  metadata: z.record(z.unknown()).optional(),
}).strict();
const sections = z.array(section).min(1).max(40).superRefine((value, context) => {
  const limit = Number(process.env.DRAFT_MAX_CHARACTERS || 400000);
  if (value.reduce((total, item) => total + item.content.length, 0) > limit) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: `Taslak ${limit} karakter sınırını aşıyor.` });
  }
});
const createDraftSchema = z.object({
  caseId: uuid,
  title: z.string().trim().min(1).max(300).optional(),
  draftType: z.enum(['PETITION', 'RESPONSE', 'APPEAL', 'OBJECTION', 'NOTICE', 'LEGAL_OPINION', 'OTHER']).default('PETITION'),
  templateId: uuid.optional().nullable(),
  documentId: uuid.optional().nullable(),
  sections: sections.optional(),
}).strict();
const updateDraftSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  status: z.enum(['DRAFT', 'IN_REVIEW', 'FINAL', 'ARCHIVED']).optional(),
  changeSummary: z.string().trim().max(500).optional(),
  sections: sections.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'En az bir değişiklik gerekli.');
const generationSchema = z.object({
  sectionKey: z.string().regex(/^[A-Z][A-Z0-9_]{0,79}$/),
  instruction: z.string().trim().max(2000).optional(),
  query: z.string().trim().max(1000).optional(),
  effectiveAt: date.optional().nullable(),
}).strict();
const analysisSchema = z.object({ effectiveAt: date.optional().nullable() }).strict();
const bulkSchema = z.object({ accept: z.array(uuid).max(100).default([]), reject: z.array(uuid).max(100).default([]) })
  .strict()
  .refine((value) => value.accept.length + value.reject.length > 0, 'En az bir öneri seçilmeli.')
  .refine((value) => !value.accept.some((id) => value.reject.includes(id)), 'Bir öneri hem kabul hem reddedilemez.');
const sourceSearchSchema = z.object({
  query: z.string().trim().min(2).max(1000),
  sourceTypes: z.array(z.string().trim().max(50)).max(10).optional(),
  effectiveAt: date.optional().nullable(),
  currentOnly: z.boolean().optional(),
  counter: z.boolean().optional(),
  limit: z.number().int().min(1).max(20).optional(),
}).strict();
const citationSchema = z.object({
  sectionKey: z.string().regex(/^[A-Z][A-Z0-9_]{0,79}$/),
  claimKey: z.string().trim().min(1).max(120).optional(),
  sourceId: uuid,
  chunkId: uuid,
  excerpt: z.string().min(1).max(2000).optional(),
  effectiveAt: date.optional().nullable(),
  supportType: z.enum(['SUPPORTS', 'CONTRADICTS', 'BACKGROUND']).optional(),
}).strict();
const claimSchema = z.object({
  title: z.string().trim().min(1).max(500),
  description: z.string().max(10000).optional(),
  claimType: z.enum(['FACT', 'LEGAL', 'DEFENSE', 'REQUEST']).optional(),
  assertedByPartyId: uuid.optional().nullable(),
  verified: z.boolean().optional(),
}).strict();
const evidenceSchema = z.object({
  documentId: uuid.optional().nullable(),
  title: z.string().trim().min(1).max(500),
  description: z.string().max(10000).optional(),
  evidenceType: z.string().trim().min(1).max(80).optional(),
  sourcePage: z.number().int().positive().optional().nullable(),
  verified: z.boolean().optional(),
}).strict();
const relationSchema = z.object({
  claimId: uuid,
  evidenceId: uuid,
  relationType: z.enum(['SUPPORTS', 'CONTRADICTS', 'BACKGROUND']).default('SUPPORTS'),
  confidence: z.number().min(0).max(1).optional().nullable(),
  suggestedByAi: z.boolean().optional(),
  verified: z.boolean().optional(),
}).strict();
const relationReviewSchema = z.object({ status: z.enum(['VERIFIED', 'REJECTED']) }).strict();
const draftClaimSchema = z.object({ sectionId: uuid, claimId: uuid }).strict();
const templateFieldsSchema = z.object({
  title: z.string().trim().min(1).max(255),
  content: z.string().max(150000),
  templateType: z.string().trim().max(100).optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  scopeType: z.enum(['PERSONAL', 'ORGANIZATION', 'SYSTEM']).default('PERSONAL'),
  organizationId: uuid.optional().nullable(),
}).strict();
const templateCreateSchema = templateFieldsSchema.superRefine((value, ctx) => {
  if (value.scopeType === 'ORGANIZATION' && !value.organizationId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['organizationId'], message: 'Büro şablonu için organizationId gerekli.' });
});
const templateUpdateSchema = templateFieldsSchema.omit({ scopeType: true, organizationId: true }).partial()
  .refine((value) => Object.keys(value).length > 0, 'En az bir değişiklik gerekli.');

function mapError(error) {
  if (!(error instanceof z.ZodError)) return error;
  const mapped = new Error(error.issues.map((issue) => `${issue.path.join('.') || 'request'}: ${issue.message}`).join('; '));
  mapped.status = 400;
  mapped.code = 'INVALID_DRAFT_REQUEST';
  return mapped;
}

async function context(req) {
  const accessContext = await getAccessContext(req);
  if (!accessContext) {
    const error = new Error('Kimlik doğrulaması gerekli.');
    error.status = 401;
    error.code = 'AUTH_REQUIRED';
    throw error;
  }
  return accessContext;
}

function handler(fn) {
  return async (req, res, next) => {
    try { await fn(req, res); } catch (error) { next(mapError(error)); }
  };
}

async function audit(req, action, draft, metadata = {}) {
  await AuditLogService.record({
    req,
    strict: true,
    action,
    entityType: 'LEGAL_DRAFT',
    entityId: draft.id,
    caseId: draft.case_id,
    lawFirmId: draft.organization_id,
    metadata,
  });
}

const createDraft = handler(async (req, res) => {
  const accessContext = await context(req);
  const draft = await getDraftingServices().draftService.create(createDraftSchema.parse(req.body || {}), accessContext);
  await audit(req, 'DRAFT_CREATED', draft, { draftType: draft.draft_type, versionId: draft.current_version_id });
  await audit(req, 'DRAFT_VERSION_CREATED', draft, { versionId: draft.current_version_id, versionNumber: 1 });
  res.status(201).json({ success: true, data: draft });
});

const listDrafts = handler(async (req, res) => {
  const accessContext = await context(req);
  const caseId = req.query.caseId ? uuid.parse(req.query.caseId) : null;
  const data = await getDraftingServices().draftService.list({ accessContext, caseId, limit: req.query.limit });
  res.json({ success: true, data });
});

const getDraft = handler(async (req, res) => {
  const data = await getDraftingServices().draftService.getDetail(uuid.parse(req.params.draftId), await context(req));
  res.json({ success: true, data });
});

const updateDraft = handler(async (req, res) => {
  const accessContext = await context(req);
  const draftId = uuid.parse(req.params.draftId);
  const input = updateDraftSchema.parse(req.body || {});
  const result = await getDraftingServices().draftService.update(draftId, input, accessContext);
  const draft = await getDraftingServices().draftService.findAccessibleDraft(draftId, accessContext);
  await audit(req, 'DRAFT_UPDATED', draft, { versionCreated: Boolean(input.sections), status: input.status || draft.status });
  if (input.sections) await audit(req, 'DRAFT_VERSION_CREATED', draft, { versionId: result.id, versionNumber: result.version_number });
  res.json({ success: true, data: result });
});

const deleteDraft = handler(async (req, res) => {
  const accessContext = await context(req);
  const draftId = uuid.parse(req.params.draftId);
  const draft = await getDraftingServices().draftService.findAccessibleDraft(draftId, accessContext, 'write');
  if (!draft) {
    const error = new Error('Taslak bulunamadı.'); error.status = 404; error.code = 'DRAFT_NOT_FOUND'; throw error;
  }
  await getDraftingServices().draftService.softDelete(draftId, accessContext);
  await audit(req, 'DRAFT_UPDATED', draft, { status: 'ARCHIVED' });
  res.status(204).end();
});

const listVersions = handler(async (req, res) => {
  const accessContext = await context(req);
  const draftId = uuid.parse(req.params.draftId);
  const draft = await getDraftingServices().draftService.findAccessibleDraft(draftId, accessContext);
  if (!draft) { const error = new Error('Taslak bulunamadı.'); error.status = 404; throw error; }
  res.json({ success: true, data: await getDraftingServices().versionService.list(draftId) });
});

const compareVersions = handler(async (req, res) => {
  const accessContext = await context(req);
  const draftId = uuid.parse(req.params.draftId);
  const draft = await getDraftingServices().draftService.findAccessibleDraft(draftId, accessContext);
  if (!draft) { const error = new Error('Taslak bulunamadı.'); error.status = 404; throw error; }
  const data = await getDraftingServices().versionService.compare(draftId, uuid.parse(req.query.left), uuid.parse(req.query.right));
  res.json({ success: true, data });
});

const generatePlan = handler(async (req, res) => {
  const accessContext = await context(req);
  const draftId = uuid.parse(req.params.draftId);
  const draft = await getDraftingServices().draftService.findAccessibleDraft(draftId, accessContext, 'write');
  if (!draft) { const error = new Error('Taslak bulunamadı.'); error.status = 404; throw error; }
  await audit(req, 'DRAFT_ANALYSIS_STARTED', draft, { operation: 'PLAN' });
  try {
    const data = await getDraftingServices().suggestionService.generatePlan(draftId, accessContext);
    await audit(req, 'DRAFT_ANALYSIS_COMPLETED', draft, { operation: 'PLAN', runId: data.runId });
    res.json({ success: true, data });
  } catch (error) {
    await audit(req, 'DRAFT_ANALYSIS_FAILED', draft, { operation: 'PLAN', errorCode: error.code || 'PLAN_FAILED' });
    throw error;
  }
});

const generateSection = handler(async (req, res) => {
  const accessContext = await context(req);
  const draftId = uuid.parse(req.params.draftId);
  const input = generationSchema.parse(req.body || {});
  const draft = await getDraftingServices().draftService.findAccessibleDraft(draftId, accessContext, 'write');
  if (!draft) { const error = new Error('Taslak bulunamadı.'); error.status = 404; throw error; }
  await audit(req, 'DRAFT_ANALYSIS_STARTED', draft, { operation: 'SECTION', sectionKey: input.sectionKey });
  try {
    const data = await getDraftingServices().suggestionService.generateSection(draftId, input, accessContext);
    await audit(req, 'DRAFT_ANALYSIS_COMPLETED', draft, { operation: 'SECTION', runId: data.runId, sectionKey: input.sectionKey });
    res.json({ success: true, data });
  } catch (error) {
    await audit(req, 'DRAFT_ANALYSIS_FAILED', draft, { operation: 'SECTION', errorCode: error.code || 'SECTION_FAILED' });
    throw error;
  }
});

const analyzeDraft = handler(async (req, res) => {
  const accessContext = await context(req);
  const draftId = uuid.parse(req.params.draftId);
  const input = analysisSchema.parse(req.body || {});
  const draft = await getDraftingServices().draftService.findAccessibleDraft(draftId, accessContext, 'write');
  if (!draft) { const error = new Error('Taslak bulunamadı.'); error.status = 404; throw error; }
  await audit(req, 'DRAFT_ANALYSIS_STARTED', draft, { operation: 'ANALYSIS' });
  try {
    const data = await getDraftingServices().suggestionService.analyze(draftId, input, accessContext);
    await audit(req, 'DRAFT_ANALYSIS_COMPLETED', draft, { operation: 'ANALYSIS', runId: data.runId, findingCount: data.findings.length });
    res.json({ success: true, data });
  } catch (error) {
    await audit(req, 'DRAFT_ANALYSIS_FAILED', draft, { operation: 'ANALYSIS', errorCode: error.code || 'ANALYSIS_FAILED' });
    throw error;
  }
});

const listSuggestions = handler(async (req, res) => {
  res.json({ success: true, data: await getDraftingServices().suggestionService.list(uuid.parse(req.params.draftId), await context(req)) });
});

async function reviewSuggestion(req, res, action) {
  const accessContext = await context(req);
  const draftId = uuid.parse(req.params.draftId);
  const suggestionId = uuid.parse(req.params.suggestionId);
  const services = getDraftingServices();
  const result = action === 'accept'
    ? await services.suggestionService.accept(draftId, suggestionId, accessContext)
    : await services.suggestionService.reject(draftId, suggestionId, accessContext);
  const draft = await services.draftService.findAccessibleDraft(draftId, accessContext);
  await audit(req, action === 'accept' ? 'DRAFT_SUGGESTION_ACCEPTED' : 'DRAFT_SUGGESTION_REJECTED', draft, {
    suggestionId, versionId: result.version?.id || result.versionId || null, idempotent: result.idempotent,
  });
  if (action === 'accept' && !result.idempotent && result.version) {
    await audit(req, 'DRAFT_VERSION_CREATED', draft, { versionId: result.version.id, versionNumber: result.version.version_number });
  }
  res.json({ success: true, data: result });
}

const acceptSuggestion = handler((req, res) => reviewSuggestion(req, res, 'accept'));
const rejectSuggestion = handler((req, res) => reviewSuggestion(req, res, 'reject'));
const bulkReview = handler(async (req, res) => {
  const accessContext = await context(req);
  const draftId = uuid.parse(req.params.draftId);
  const input = bulkSchema.parse(req.body || {});
  const result = await getDraftingServices().suggestionService.bulkReview(draftId, input, accessContext);
  const draft = await getDraftingServices().draftService.findAccessibleDraft(draftId, accessContext);
  if (input.accept.length) await audit(req, 'DRAFT_SUGGESTION_ACCEPTED', draft, { suggestionCount: input.accept.length, bulk: true, versionId: result.version?.id });
  if (input.reject.length) await audit(req, 'DRAFT_SUGGESTION_REJECTED', draft, { suggestionCount: input.reject.length, bulk: true });
  if (result.version) await audit(req, 'DRAFT_VERSION_CREATED', draft, { versionId: result.version.id, versionNumber: result.version.version_number, bulk: true });
  res.json({ success: true, data: result });
});

const searchSources = handler(async (req, res) => {
  const data = await getDraftingServices().citationService.search(uuid.parse(req.params.draftId), sourceSearchSchema.parse(req.body || {}), await context(req));
  res.json({ success: true, data });
});
const addCitation = handler(async (req, res) => {
  const accessContext = await context(req);
  const draftId = uuid.parse(req.params.draftId);
  const data = await getDraftingServices().citationService.add(draftId, citationSchema.parse(req.body || {}), accessContext);
  const draft = await getDraftingServices().draftService.findAccessibleDraft(draftId, accessContext);
  await audit(req, 'DRAFT_VERSION_CREATED', draft, { versionId: data.created_version_id, versionNumber: data.version_number, reason: 'CITATION_ADDED' });
  res.status(201).json({ success: true, data });
});
const removeCitation = handler(async (req, res) => {
  const accessContext = await context(req);
  const draftId = uuid.parse(req.params.draftId);
  const data = await getDraftingServices().citationService.remove(draftId, uuid.parse(req.params.citationId), accessContext);
  const draft = await getDraftingServices().draftService.findAccessibleDraft(draftId, accessContext);
  await audit(req, 'DRAFT_VERSION_CREATED', draft, { versionId: data.created_version_id, versionNumber: data.version_number, reason: 'CITATION_REMOVED' });
  res.json({ success: true, data });
});

const listTemplates = handler(async (req, res) => {
  const data = await getDraftingServices().draftService.listTemplates(await context(req), { caseId: req.query.caseId ? uuid.parse(req.query.caseId) : null });
  res.json({ success: true, data });
});
const createTemplate = handler(async (req, res) => {
  const data = await getDraftingServices().draftService.createTemplate(templateCreateSchema.parse(req.body || {}), await context(req));
  res.status(201).json({ success: true, data });
});
const updateTemplate = handler(async (req, res) => {
  const data = await getDraftingServices().draftService.updateTemplate(uuid.parse(req.params.templateId), templateUpdateSchema.parse(req.body || {}), await context(req));
  res.json({ success: true, data });
});
const deleteTemplate = handler(async (req, res) => {
  await getDraftingServices().draftService.deleteTemplate(uuid.parse(req.params.templateId), await context(req));
  res.status(204).end();
});
const getEvidenceMatrix = handler(async (req, res) => {
  const data = await getDraftingServices().evidenceMatrixService.getMatrix(uuid.parse(req.params.caseId), await context(req));
  res.json({ success: true, data });
});
const createClaim = handler(async (req, res) => {
  const accessContext = await context(req); const caseId = uuid.parse(req.params.caseId);
  const data = await getDraftingServices().evidenceMatrixService.createClaim(caseId, claimSchema.parse(req.body || {}), accessContext);
  await AuditLogService.record({ req, strict: true, action: 'CLAIM_CREATED', entityType: 'MATTER_CLAIM', entityId: data.id, caseId, metadata: { claimType: data.claim_type } });
  res.status(201).json({ success: true, data });
});
const createEvidence = handler(async (req, res) => {
  const data = await getDraftingServices().evidenceMatrixService.createEvidence(uuid.parse(req.params.caseId), evidenceSchema.parse(req.body || {}), await context(req));
  res.status(201).json({ success: true, data });
});
const createEvidenceRelation = handler(async (req, res) => {
  const accessContext = await context(req); const caseId = uuid.parse(req.params.caseId);
  const data = await getDraftingServices().evidenceMatrixService.createRelation(caseId, relationSchema.parse(req.body || {}), accessContext);
  await AuditLogService.record({ req, strict: true, action: 'EVIDENCE_RELATION_CREATED', entityType: 'CLAIM_EVIDENCE_RELATION', entityId: data.id, caseId, metadata: { relationType: data.relation_type, verificationStatus: data.verification_status } });
  res.status(201).json({ success: true, data });
});
const reviewEvidenceRelation = handler(async (req, res) => {
  const input = relationReviewSchema.parse(req.body || {});
  const data = await getDraftingServices().evidenceMatrixService.reviewRelation(uuid.parse(req.params.caseId), uuid.parse(req.params.relationId), input.status, await context(req));
  res.json({ success: true, data });
});
const linkDraftClaim = handler(async (req, res) => {
  const data = await getDraftingServices().evidenceMatrixService.linkDraftClaim(uuid.parse(req.params.draftId), draftClaimSchema.parse(req.body || {}), await context(req));
  res.status(201).json({ success: true, data });
});

function exportHandler(format) {
  return handler(async (req, res) => {
    const accessContext = await context(req); const draftId = uuid.parse(req.params.draftId);
    const service = getDraftingServices().exportService;
    const result = format === 'docx' ? await service.toDocx(draftId, accessContext) : await service.toPdf(draftId, accessContext);
    await audit(req, 'DRAFT_EXPORTED', result.draft, { format, versionId: result.draft.current_version_id, byteSize: result.buffer.length });
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(result.filename)}`);
    res.setHeader('Content-Length', String(result.buffer.length));
    res.end(result.buffer);
  });
}

module.exports = {
  acceptSuggestion, addCitation, analyzeDraft, bulkReview, compareVersions, createClaim, createDraft, createTemplate,
  createEvidence, createEvidenceRelation, deleteDraft, exportDocx: exportHandler('docx'), exportPdf: exportHandler('pdf'),
  generatePlan, generateSection, getDraft, getEvidenceMatrix, linkDraftClaim, listDrafts, listSuggestions,
  deleteTemplate, listTemplates, listVersions, rejectSuggestion, removeCitation, reviewEvidenceRelation, searchSources,
  updateDraft, updateTemplate,
};
