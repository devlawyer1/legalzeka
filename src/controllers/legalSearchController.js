const { z } = require('zod');
const { pool } = require('../config/db');
const Case = require('../models/Case');
const { getAccessContext } = require('../services/accessContext');
const { legalSearchService, repository } = require('../services/legalSearch');

const uuidSchema = z.string().uuid();

function httpError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function mapValidationError(error) {
  if (!(error instanceof z.ZodError)) return error;
  return httpError(400, error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '), 'INVALID_SEARCH_REQUEST');
}

async function requestScope(req) {
  const accessContext = await getAccessContext(req);
  if (!accessContext) throw httpError(401, 'Kimlik doğrulaması gerekli.', 'AUTH_REQUIRED');
  return {
    accessContext,
    accessScope: {
      userId: accessContext.userId,
      organizationIds: accessContext.scopes.organizationIds,
    },
  };
}

async function resolveCaseContext(caseId, accessContext) {
  if (!caseId) return null;
  const matter = await Case.findAccessibleById(caseId, accessContext, 'read');
  if (!matter) throw httpError(404, 'Dava bulunamadı.', 'MATTER_NOT_FOUND');
  const { rows: events } = await pool.query(
    `SELECT title
     FROM matter_events
     WHERE case_id = $1
     ORDER BY event_date DESC NULLS LAST, verified_at DESC
     LIMIT 8`,
    [caseId]
  );
  return {
    id: matter.id,
    legalDomain: matter.legal_domain || null,
    events,
    organizationId: matter.scope_type === 'ORGANIZATION' ? matter.law_firm_id : null,
    ownerUserId: matter.scope_type === 'PERSONAL' ? matter.owner_user_id : null,
  };
}

async function search(req, res, next) {
  try {
    const { accessContext, accessScope } = await requestScope(req);
    const caseContext = await resolveCaseContext(req.body?.caseId, accessContext);
    const result = await legalSearchService.search(req.body, {
      requestId: req.requestId,
      accessScope,
      caseContext,
      organizationId: caseContext?.organizationId || accessScope.organizationIds[0] || null,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(mapValidationError(error));
  }
}

async function getSource(req, res, next) {
  try {
    const sourceId = uuidSchema.parse(req.params.sourceId);
    const { accessScope } = await requestScope(req);
    const source = await repository.getSource(sourceId, accessScope);
    if (!source) throw httpError(404, 'Hukuk kaynağı bulunamadı.', 'LEGAL_SOURCE_NOT_FOUND');
    res.json({ success: true, data: source });
  } catch (error) {
    next(mapValidationError(error));
  }
}

async function getRelated(req, res, next) {
  try {
    const sourceId = uuidSchema.parse(req.params.sourceId);
    const { accessScope } = await requestScope(req);
    const source = await repository.getSource(sourceId, accessScope);
    if (!source) throw httpError(404, 'Hukuk kaynağı bulunamadı.', 'LEGAL_SOURCE_NOT_FOUND');
    const related = await repository.getRelated(sourceId, accessScope, 20);
    res.json({ success: true, data: related });
  } catch (error) {
    next(mapValidationError(error));
  }
}

async function getLegislationVersions(req, res, next) {
  try {
    const legislationId = uuidSchema.parse(req.params.id);
    const { accessScope } = await requestScope(req);
    const versions = await repository.getLegislationVersions(legislationId, accessScope);
    if (versions.length === 0) throw httpError(404, 'Mevzuat veya sürümleri bulunamadı.', 'LEGISLATION_NOT_FOUND');
    res.json({ success: true, data: versions });
  } catch (error) {
    next(mapValidationError(error));
  }
}

module.exports = { getLegislationVersions, getRelated, getSource, search };
