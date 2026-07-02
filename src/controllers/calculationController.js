const { z } = require('zod');
const AuditLogService = require('../services/AuditLogService');
const { getAccessContext } = require('../services/accessContext');
const { getCalculationEngine } = require('../services/calculations');
const { validateRuleDefinition, validateSchema } = require('../services/calculations/RuleValidator');

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const common = {
  caseId: uuid.optional().nullable(), draftId: uuid.optional().nullable(), organizationId: uuid.optional().nullable(),
  ruleCode: z.string().trim().min(1).max(120).optional(), effectiveAt: date.optional(),
};
const deadlineSchema = z.object({
  ...common, triggerDate: date.optional(), triggerType: z.string().trim().max(80).optional(),
  serviceType: z.string().trim().max(80).optional(), procedureType: z.string().trim().max(100).optional(),
  legalDomain: z.string().trim().max(120).optional(), calendarCode: z.string().trim().max(80).optional(),
  timezone: z.literal('Europe/Istanbul').optional(), electronicDeliveryDate: date.optional(), notificationDate: date.optional(),
  decisionDate: date.optional(), eventDate: date.optional(), customStartDate: date.optional(),
  interruptionEvents: z.array(z.record(z.unknown())).max(30).optional(), suspensionEvents: z.array(z.record(z.unknown())).max(30).optional(),
}).strict();
const limitationSchema = deadlineSchema.extend({ limitationType: z.enum(['LIMITATION', 'FORFEITURE']).default('LIMITATION') }).strict();
const interestSchema = z.object({
  ...common, principal: z.union([z.string().trim().min(1).max(40), z.number().finite()]), currency: z.string().trim().length(3).default('TRY'),
  startDate: date, endDate: date, rateCode: z.string().trim().max(120).optional(),
  dayCountConvention: z.enum(['ACTUAL_365', 'ACTUAL_360']).optional(),
  roundingMode: z.enum(['ROUND_UP', 'ROUND_DOWN', 'ROUND_CEIL', 'ROUND_FLOOR', 'ROUND_HALF_UP', 'ROUND_HALF_DOWN', 'ROUND_HALF_EVEN', 'ROUND_HALF_CEIL', 'ROUND_HALF_FLOOR']).optional(),
}).strict();
const employmentSchema = z.object({
  ...common, calculationType: z.enum(['SEVERANCE', 'NOTICE_PAY', 'OVERTIME', 'ANNUAL_LEAVE']),
  grossWage: z.union([z.string().trim().min(1).max(40), z.number().finite()]), employmentStartDate: date,
  employmentEndDate: date, workDurationDays: z.number().int().min(0).max(100000).optional(),
  overtimeHours: z.number().min(0).max(100000).optional(), unusedLeaveDays: z.number().min(0).max(100000).optional(),
}).strict();
const feeSchema = z.object({
  ...common, calculationType: z.enum(['COURT_FEE', 'ATTORNEY_FEE', 'ENFORCEMENT_COST']).default('COURT_FEE'),
  baseAmount: z.union([z.string().trim().min(1).max(40), z.number().finite()]), tariffCode: z.string().trim().max(120).optional(),
}).strict();
const createRuleSetSchema = z.object({
  ruleCode: z.string().regex(/^[A-Z][A-Z0-9_]{2,119}$/), name: z.string().trim().min(1).max(300),
  description: z.string().max(5000).optional(), calculationType: z.enum(['DEADLINE', 'LIMITATION', 'FORFEITURE', 'INTEREST', 'COURT_FEE', 'ATTORNEY_FEE', 'SEVERANCE', 'NOTICE_PAY', 'OVERTIME', 'ANNUAL_LEAVE', 'ENFORCEMENT_COST', 'CUSTOM']),
  jurisdiction: z.string().trim().max(80).default('TR'), legalDomain: z.string().trim().max(120).optional(),
}).strict();
const createVersionSchema = z.object({
  versionNumber: z.number().int().positive(), effectiveFrom: date, effectiveTo: date.optional().nullable(),
  inputSchema: z.record(z.unknown()).default({}), ruleDefinition: z.record(z.unknown()), outputSchema: z.record(z.unknown()).default({}),
  legalSourceId: uuid.optional().nullable(), legalReference: z.string().trim().max(5000).optional().nullable(),
  officialSourceReference: z.string().trim().max(5000).optional().nullable(),
}).strict();
const fixtureSchema = z.object({ input: z.record(z.unknown()), expected: z.record(z.unknown()).optional() }).strict();

function mapError(error) {
  if (!(error instanceof z.ZodError)) return error;
  return Object.assign(new Error(error.issues.map((issue) => `${issue.path.join('.') || 'request'}: ${issue.message}`).join('; ')), { status: 400, code: 'INVALID_CALCULATION_REQUEST' });
}
function handler(fn) { return async (req, res, next) => { try { await fn(req, res); } catch (error) { next(mapError(error)); } }; }
async function context(req) { const value = await getAccessContext(req); if (!value) throw Object.assign(new Error('Authentication required.'), { status: 401 }); return value; }

async function auditCalculation(req, action, run, metadata = {}) {
  await AuditLogService.record({ req, strict: true, action, entityType: 'CALCULATION_RUN', entityId: run.id,
    lawFirmId: run.organization_id, caseId: run.case_id,
    metadata: { calculationId: run.id, ruleSetId: run.rule_set_id, ruleVersionId: run.rule_version_id, status: run.status, resultHash: run.result_hash, warningCodes: (run.warnings || []).map((item) => item.warning_code), ...metadata } });
}
async function auditRule(req, action, version, metadata = {}) {
  await AuditLogService.record({ req, strict: true, action, entityType: 'LEGAL_RULE_VERSION', entityId: version.id,
    metadata: { ruleSetId: version.rule_set_id, ruleVersionId: version.id, status: version.status, ...metadata } });
}

function calculate(kind, schema) {
  return handler(async (req, res) => {
    const engine = getCalculationEngine(); const run = await engine.calculate(kind, schema.parse(req.body || {}), await context(req), { idempotencyKey: req.get('idempotency-key')?.slice(0, 160) || null });
    await auditCalculation(req, 'CALCULATION_CREATED', run);
    await auditCalculation(req, run.status === 'CALCULATED' ? 'CALCULATION_COMPLETED' : run.status === 'NEEDS_INPUT' ? 'CALCULATION_NEEDS_INPUT' : 'CALCULATION_NEEDS_REVIEW', run);
    res.status(201).json({ success: true, data: run });
  });
}

const listRules = handler(async (req, res) => res.json({ success: true, data: await getCalculationEngine().ruleService.listRuleSets({ calculationType: req.query.calculationType || null, includeInactive: req.user.role === 'Admin' && req.query.includeInactive === 'true' }) }));
const listRuleVersions = handler(async (req, res) => res.json({ success: true, data: await getCalculationEngine().ruleService.listVersions(req.params.ruleCode, { includeInactive: req.user.role === 'Admin' && req.query.includeInactive === 'true' }) }));
const listCalculations = handler(async (req, res) => res.json({ success: true, data: await getCalculationEngine().runService.list(await context(req), { caseId: req.query.caseId ? uuid.parse(req.query.caseId) : null, limit: req.query.limit }) }));
const getCalculation = handler(async (req, res) => res.json({ success: true, data: await getCalculationEngine().runService.get(uuid.parse(req.params.calculationId), await context(req)) }));
const voidCalculation = handler(async (req, res) => { const run = await getCalculationEngine().runService.void(uuid.parse(req.params.calculationId), await context(req)); await auditCalculation(req, 'CALCULATION_VOIDED', run); res.status(204).end(); });
const confirmCalculation = handler(async (req, res) => { const run = await getCalculationEngine().runService.confirm(uuid.parse(req.params.calculationId), await context(req)); await auditCalculation(req, 'CALCULATION_CONFIRMED', run); res.json({ success: true, data: run }); });
const createDeadline = handler(async (req, res) => { const engine = getCalculationEngine(); const id = uuid.parse(req.params.calculationId); const deadline = await engine.runService.createDeadline(id, await context(req)); const run = await engine.runService.get(id, await context(req)); await auditCalculation(req, 'DEADLINE_CREATED_FROM_CALCULATION', run, { deadlineId: deadline.id }); res.status(201).json({ success: true, data: deadline }); });
const createTask = handler(async (req, res) => { const engine = getCalculationEngine(); const id = uuid.parse(req.params.calculationId); const task = await engine.runService.createTask(id, await context(req)); const run = await engine.runService.get(id, await context(req)); await auditCalculation(req, 'TASK_CREATED_FROM_CALCULATION', run, { taskId: task.id }); res.status(201).json({ success: true, data: task }); });
const recalculate = handler(async (req, res) => { const run = await getCalculationEngine().recalculate(uuid.parse(req.params.calculationId), await context(req), req.get('idempotency-key')?.slice(0, 160) || null); await auditCalculation(req, 'CALCULATION_RECALCULATED', run, { parentRunId: run.parent_run_id }); res.status(201).json({ success: true, data: run }); });
const linkDraft = handler(async (req, res) => { const data = await getCalculationEngine().runService.linkDraft(uuid.parse(req.params.calculationId), uuid.parse(req.body?.draftId), await context(req)); res.json({ success: true, data }); });

const createRuleSet = handler(async (req, res) => { const data = await getCalculationEngine().ruleService.createRuleSet(createRuleSetSchema.parse(req.body || {}), req.user.id); res.status(201).json({ success: true, data }); });
const createRuleVersion = handler(async (req, res) => { const input = createVersionSchema.parse(req.body || {}); validateSchema(input.inputSchema, 'inputSchema'); validateSchema(input.outputSchema, 'outputSchema'); validateRuleDefinition(input.ruleDefinition); const data = await getCalculationEngine().ruleService.createVersion(req.params.ruleCode, input, req.user.id); await auditRule(req, 'RULE_VERSION_CREATED', data); res.status(201).json({ success: true, data }); });
const reviewRuleVersion = handler(async (req, res) => { const data = await getCalculationEngine().ruleService.review(req.params.ruleCode, uuid.parse(req.params.versionId), req.user.id); await auditRule(req, 'RULE_VERSION_REVIEWED', data); res.json({ success: true, data }); });
const activateRuleVersion = handler(async (req, res) => { const data = await getCalculationEngine().ruleService.activate(req.params.ruleCode, uuid.parse(req.params.versionId), req.user.id); await auditRule(req, 'RULE_VERSION_ACTIVATED', data); res.json({ success: true, data }); });
const retireRuleVersion = handler(async (req, res) => { const data = await getCalculationEngine().ruleService.retire(req.params.ruleCode, uuid.parse(req.params.versionId)); await auditRule(req, 'RULE_VERSION_RETIRED', data); res.json({ success: true, data }); });
const testRuleVersion = handler(async (req, res) => { const fixture = fixtureSchema.parse(req.body || {}); const version = await getCalculationEngine().ruleService.getVersion(req.params.ruleCode, uuid.parse(req.params.versionId)); if (!version) throw Object.assign(new Error('Rule version not found.'), { status: 404 }); validateRuleDefinition(version.rule_definition); res.json({ success: true, data: { valid: true, fixtureAccepted: true, expected: fixture.expected || null, checksum: version.checksum } }); });

module.exports = {
  activateRuleVersion, calculateDeadline: calculate('deadline', deadlineSchema), calculateEmployment: calculate('employment', employmentSchema),
  calculateFee: calculate('fee', feeSchema), calculateInterest: calculate('interest', interestSchema), calculateLimitation: calculate('limitation', limitationSchema),
  confirmCalculation, createDeadline, createRuleSet, createRuleVersion, createTask, getCalculation, linkDraft, listCalculations,
  listRules, listRuleVersions, recalculate, retireRuleVersion, reviewRuleVersion, testRuleVersion, voidCalculation,
};
