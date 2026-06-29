const { z } = require('zod');
const AuditLogService = require('../services/AuditLogService');
const { getAccessContext } = require('../services/accessContext');
const { getLegalResearchService } = require('../services/legalResearch');

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const createSessionSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  organizationId: z.string().uuid().optional().nullable(),
  caseId: z.string().uuid().optional().nullable(),
  effectiveAt: z.union([dateSchema, z.null()]).optional(),
  legalDomain: z.string().trim().max(120).optional().nullable(),
}).strict();
const titleSchema = z.object({ title: z.string().trim().min(1).max(300) }).strict();
const messageSchema = z.object({
  content: z.string().trim().min(1).max(1000),
  structuredContent: z.record(z.unknown()).optional().default({}),
}).strict();
const saveNoteSchema = z.object({ title: z.string().trim().min(1).max(300).optional() }).strict();
const uuidSchema = z.string().uuid();

function validationError(error) {
  if (!(error instanceof z.ZodError)) return error;
  const mapped = new Error(error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '));
  mapped.status = 400;
  mapped.code = 'INVALID_RESEARCH_REQUEST';
  return mapped;
}

async function accessContext(req) {
  const context = await getAccessContext(req);
  if (!context) {
    const error = new Error('Kimlik doğrulaması gerekli.');
    error.status = 401;
    error.code = 'AUTH_REQUIRED';
    throw error;
  }
  return context;
}

async function createSession(req, res, next) {
  try {
    const input = createSessionSchema.parse(req.body || {});
    const context = await accessContext(req);
    const session = await getLegalResearchService().createSession(input, context);
    await AuditLogService.record({
      req,
      action: 'LEGAL_RESEARCH_SESSION_CREATED',
      entityType: 'LEGAL_RESEARCH_SESSION',
      entityId: session.id,
      caseId: session.case_id,
      lawFirmId: session.organization_id,
      metadata: { effectiveAt: session.effective_at, legalDomain: session.legal_domain },
    });
    res.status(201).json({ success: true, data: session });
  } catch (error) {
    next(validationError(error));
  }
}

async function listSessions(req, res, next) {
  try {
    const context = await accessContext(req);
    const caseId = req.query.caseId ? uuidSchema.parse(req.query.caseId) : null;
    const sessions = await getLegalResearchService().sessionService.list({
      accessContext: context,
      caseId,
      limit: req.query.limit,
    });
    res.json({ success: true, data: sessions });
  } catch (error) {
    next(validationError(error));
  }
}

async function getSession(req, res, next) {
  try {
    const context = await accessContext(req);
    const sessionId = uuidSchema.parse(req.params.sessionId);
    const session = await getLegalResearchService().sessionService.getDetail(sessionId, context);
    res.json({ success: true, data: session });
  } catch (error) {
    next(validationError(error));
  }
}

async function updateSession(req, res, next) {
  try {
    const context = await accessContext(req);
    const sessionId = uuidSchema.parse(req.params.sessionId);
    const { title } = titleSchema.parse(req.body || {});
    const session = await getLegalResearchService().sessionService.updateTitle(sessionId, context, title);
    res.json({ success: true, data: session });
  } catch (error) {
    next(validationError(error));
  }
}

async function deleteSession(req, res, next) {
  try {
    const context = await accessContext(req);
    const sessionId = uuidSchema.parse(req.params.sessionId);
    await getLegalResearchService().sessionService.softDelete(sessionId, context);
    await AuditLogService.record({
      req,
      action: 'LEGAL_RESEARCH_SESSION_DELETED',
      entityType: 'LEGAL_RESEARCH_SESSION',
      entityId: sessionId,
      metadata: {},
    });
    res.status(204).end();
  } catch (error) {
    next(validationError(error));
  }
}

async function addMessage(req, res, next) {
  try {
    const context = await accessContext(req);
    const sessionId = uuidSchema.parse(req.params.sessionId);
    const input = messageSchema.parse(req.body || {});
    const message = await getLegalResearchService().sessionService.addMessage(sessionId, context, {
      role: 'USER',
      content: input.content,
      structuredContent: input.structuredContent,
    });
    res.status(201).json({ success: true, data: message });
  } catch (error) {
    next(validationError(error));
  }
}

async function answer(req, res, next) {
  try {
    const context = await accessContext(req);
    const result = await getLegalResearchService().answer(req.body || {}, context, {
      idempotencyKey: req.get('Idempotency-Key') || null,
      requestId: req.requestId,
      req,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(validationError(error));
  }
}

async function saveToMatter(req, res, next) {
  try {
    const context = await accessContext(req);
    const sessionId = uuidSchema.parse(req.params.sessionId);
    const answerId = uuidSchema.parse(req.params.answerId);
    const input = saveNoteSchema.parse(req.body || {});
    const note = await getLegalResearchService().saveAnswerToMatter({
      sessionId,
      answerId,
      accessContext: context,
      title: input.title,
    });
    res.status(201).json({ success: true, data: note });
  } catch (error) {
    next(validationError(error));
  }
}

module.exports = {
  addMessage,
  answer,
  createSession,
  deleteSession,
  getSession,
  listSessions,
  saveToMatter,
  updateSession,
};
