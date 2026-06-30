const { z } = require('zod');
const { getAgentServices } = require('../services/agents');
const { getAccessContext } = require('../services/accessContext');
const { WORKFLOW_TYPES, TRIGGER_TYPES, agentError } = require('../services/agents/AgentWorkflowService');

const uuid = z.string().uuid();
const jsonObject = z.record(z.any());
const policies = {
  toolPolicy: jsonObject.optional(),
  modelPolicy: jsonObject.optional(),
  budgetPolicy: jsonObject.optional(),
  triggerPolicy: jsonObject.optional(),
};
const workflowSchema = z.object({
  organizationId: uuid.optional().nullable(),
  scopeType: z.enum(['PERSONAL', 'ORGANIZATION']).optional(),
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(5000).optional().nullable(),
  workflowType: z.enum(WORKFLOW_TYPES),
  definition: jsonObject,
  ...policies,
}).strict();
const workflowPatchSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(5000).optional().nullable(),
  definition: jsonObject.optional(),
  ...policies,
}).strict();
const runSchema = z.object({
  caseId: uuid.optional().nullable(),
  inputData: jsonObject.optional(),
  idempotencyKey: z.string().trim().min(8).max(255).optional().nullable(),
  triggerType: z.enum(TRIGGER_TYPES).optional(),
  triggerReference: z.string().trim().max(255).optional().nullable(),
}).strict();
const rejectSchema = z.object({ reason: z.string().trim().max(2000).optional().nullable() }).strict();
const bulkSchema = z.object({
  approve: z.array(uuid).max(100).optional().default([]),
  reject: z.array(z.union([
    uuid,
    z.object({ id: uuid, reason: z.string().trim().max(2000).optional().nullable() }).strict(),
  ])).max(100).optional().default([]),
}).strict();
const scheduleSchema = z.object({
  caseId: uuid.optional().nullable(),
  cronExpression: z.string().trim().min(5).max(120),
  timezone: z.string().trim().min(1).max(100).optional(),
}).strict();

function mapError(error) {
  if (!(error instanceof z.ZodError)) return error;
  return agentError(error.issues.map((issue) => `${issue.path.join('.') || 'request'}: ${issue.message}`).join('; '), 400, 'INVALID_AGENT_REQUEST');
}

function handler(fn) {
  return async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (error) {
      next(mapError(error));
    }
  };
}

async function context(req) {
  const value = await getAccessContext(req);
  if (!value) throw agentError('Authentication required.', 401, 'AUTH_REQUIRED');
  return value;
}

function listFilters(req) {
  return {
    limit: req.query.limit,
    offset: req.query.offset,
    status: req.query.status,
    workflowType: req.query.workflowType,
    caseId: req.query.caseId,
    sort: req.query.sort,
    direction: req.query.direction,
  };
}

exports.createWorkflow = handler(async (req, res) => {
  const data = await getAgentServices().workflowService.create(workflowSchema.parse(req.body), await context(req), { req });
  res.status(201).json({ success: true, data });
});

exports.listWorkflows = handler(async (req, res) => {
  const data = await getAgentServices().workflowService.list(await context(req), listFilters(req));
  res.json({ success: true, data });
});

exports.getWorkflow = handler(async (req, res) => {
  const data = await getAgentServices().workflowService.get(uuid.parse(req.params.workflowId), await context(req));
  res.json({ success: true, data });
});

exports.updateWorkflow = handler(async (req, res) => {
  const data = await getAgentServices().workflowService.update(
    uuid.parse(req.params.workflowId), workflowPatchSchema.parse(req.body), await context(req), { req }
  );
  res.json({ success: true, data });
});

exports.activateWorkflow = handler(async (req, res) => {
  const data = await getAgentServices().workflowService.setStatus(uuid.parse(req.params.workflowId), 'ACTIVE', await context(req), { req });
  res.json({ success: true, data });
});

exports.pauseWorkflow = handler(async (req, res) => {
  const data = await getAgentServices().workflowService.setStatus(uuid.parse(req.params.workflowId), 'PAUSED', await context(req), { req });
  res.json({ success: true, data });
});

exports.createRun = handler(async (req, res) => {
  const input = runSchema.parse(req.body || {});
  const headerKey = req.get('idempotency-key')?.slice(0, 255);
  const data = await getAgentServices().workflowService.createRun(
    uuid.parse(req.params.workflowId), { ...input, idempotencyKey: headerKey || input.idempotencyKey }, await context(req), { req }
  );
  res.status(201).json({ success: true, data });
});

exports.listRuns = handler(async (req, res) => {
  const data = await getAgentServices().workflowService.listRuns(await context(req), listFilters(req));
  res.json({ success: true, data });
});

exports.getRun = handler(async (req, res) => {
  const data = await getAgentServices().workflowService.getRun(uuid.parse(req.params.runId), await context(req));
  res.json({ success: true, data });
});

exports.cancelRun = handler(async (req, res) => {
  const data = await getAgentServices().workflowService.cancelRun(uuid.parse(req.params.runId), await context(req), { req });
  res.json({ success: true, data });
});

exports.retryRun = handler(async (req, res) => {
  const data = await getAgentServices().workflowService.retryRun(uuid.parse(req.params.runId), await context(req), { req });
  res.json({ success: true, data });
});

exports.listProposals = handler(async (req, res) => {
  const services = getAgentServices();
  const data = await services.proposalService.list(await context(req), services.workflowService, listFilters(req));
  res.json({ success: true, data });
});

exports.approveProposal = handler(async (req, res) => {
  const data = await getAgentServices().approvalService.approve(uuid.parse(req.params.proposalId), await context(req), { req });
  res.json({ success: true, data });
});

exports.rejectProposal = handler(async (req, res) => {
  const input = rejectSchema.parse(req.body || {});
  const data = await getAgentServices().approvalService.reject(uuid.parse(req.params.proposalId), input.reason, await context(req), { req });
  res.json({ success: true, data });
});

exports.bulkReview = handler(async (req, res) => {
  const data = await getAgentServices().approvalService.bulkReview(bulkSchema.parse(req.body || {}), await context(req), { req });
  res.json({ success: true, data });
});

exports.createSchedule = handler(async (req, res) => {
  const data = await getAgentServices().scheduleService.create(
    uuid.parse(req.params.workflowId), scheduleSchema.parse(req.body), await context(req), { req }
  );
  res.status(201).json({ success: true, data });
});

exports.listSchedules = handler(async (req, res) => {
  const data = await getAgentServices().scheduleService.list(uuid.parse(req.params.workflowId), await context(req));
  res.json({ success: true, data });
});

exports.deleteSchedule = handler(async (req, res) => {
  await getAgentServices().scheduleService.disable(uuid.parse(req.params.scheduleId), await context(req), { req });
  res.status(204).end();
});

exports.listCaseRuns = handler(async (req, res) => {
  const data = await getAgentServices().workflowService.listRuns(await context(req), {
    ...listFilters(req), caseId: uuid.parse(req.params.caseId),
  });
  res.json({ success: true, data });
});

exports.listCaseProposals = handler(async (req, res) => {
  const services = getAgentServices();
  const data = await services.proposalService.list(await context(req), services.workflowService, {
    ...listFilters(req), caseId: uuid.parse(req.params.caseId),
  });
  res.json({ success: true, data });
});
