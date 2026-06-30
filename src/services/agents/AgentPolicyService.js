const { z } = require('zod');
const { requirePermission } = require('../practice/PermissionService');

const NODE_TYPES = Object.freeze([
  'START',
  'LOAD_CONTEXT',
  'CALL_TOOL',
  'CALL_MODEL',
  'CONDITION',
  'CREATE_PROPOSAL',
  'WAIT_APPROVAL',
  'NOTIFY_USER',
  'END',
]);

const READ_TOOLS = Object.freeze([
  'matter.get_summary',
  'matter.get_verified_events',
  'matter.get_verified_parties',
  'document.get_pages',
  'document.get_processing_status',
  'document.list_suggestions',
  'legal.search',
  'legal.research',
  'draft.get',
  'draft.analyze',
  'draft.generate_plan',
  'evidence.get_matrix',
  'calculation.list_rules',
  'calculation.prepare',
  'practice.list_tasks',
  'practice.list_deadlines',
  'practice.list_hearings',
  'practice.list_client_updates',
  'proposal.create',
]);

const DIRECT_WRITE_TOOLS = Object.freeze([
  'task.create',
  'deadline.create',
  'matter.event.create',
  'matter.party.create',
  'draft.suggestion.apply',
  'portal.update.share',
  'notification.send',
  'calculation.confirm',
  'invoice.issue',
  'payment.record',
]);

const PROPOSAL_RISK = Object.freeze({
  CREATE_TASK: 'REVERSIBLE_WRITE',
  CREATE_DEADLINE: 'CRITICAL_WRITE',
  START_CALCULATION: 'REVERSIBLE_WRITE',
  ADD_MATTER_EVENT: 'CRITICAL_WRITE',
  ADD_MATTER_PARTY: 'CRITICAL_WRITE',
  ADD_EVIDENCE_RELATION: 'CRITICAL_WRITE',
  CREATE_DRAFT: 'REVERSIBLE_WRITE',
  APPLY_DRAFT_SUGGESTION: 'CRITICAL_WRITE',
  SAVE_RESEARCH: 'REVERSIBLE_WRITE',
  CREATE_CLIENT_UPDATE: 'REVERSIBLE_WRITE',
  SHARE_PORTAL_UPDATE: 'EXTERNAL_ACTION',
  SEND_NOTIFICATION: 'EXTERNAL_ACTION',
  CREATE_TIME_ENTRY: 'REVERSIBLE_WRITE',
});

const SUSPICIOUS_CODE = /(?:\beval\s*\(|\bFunction\s*\(|\brequire\s*\(|\bimport\s*\(|child_process|javascript:|powershell|cmd\.exe|bash\s+-c|\/bin\/sh|\bexec\s*\()/i;
const FORBIDDEN_KEYS = /^(code|script|javascript|shell|command|sql|dynamicImport)$/i;
const stepSchema = z.object({
  id: z.string().trim().regex(/^[a-z][a-z0-9_-]{0,79}$/i),
  type: z.enum(NODE_TYPES),
  scope: z.array(z.enum([
    'MATTER_SUMMARY', 'VERIFIED_EVENTS', 'VERIFIED_PARTIES', 'DOCUMENT_PAGES',
    'DOCUMENT_STATUS', 'EVIDENCE_MATRIX', 'TASKS', 'DEADLINES', 'HEARINGS',
    'CLIENT_VISIBLE_UPDATES',
  ])).max(12).optional(),
  tool: z.string().trim().max(120).optional(),
  input: z.record(z.any()).optional(),
  schema: z.string().trim().max(120).optional(),
  proposalType: z.enum(Object.keys(PROPOSAL_RISK)).optional(),
  fromStep: z.string().trim().max(80).optional(),
  title: z.string().trim().max(255).optional(),
  description: z.string().trim().max(2000).optional(),
  payload: z.record(z.any()).optional(),
  condition: z.object({
    sourceStep: z.string().trim().max(80),
    path: z.string().trim().max(160).optional(),
    operator: z.enum(['EXISTS', 'NOT_EXISTS', 'EQUALS', 'NOT_EQUALS', 'GREATER_THAN', 'LESS_THAN']),
    value: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  }).strict().optional(),
  then: z.string().trim().max(80).optional(),
  else: z.string().trim().max(80).optional(),
  message: z.string().trim().max(255).optional(),
}).strict();

const definitionSchema = z.object({
  steps: z.array(stepSchema).min(2),
}).strict();

const modelPolicySchema = z.object({
  taskType: z.string().trim().max(80).optional().default('CONTROLLED_AGENT'),
  preferredProvider: z.enum(['ollama', 'gemini', 'openai', 'claude', 'bedrock']).optional().nullable(),
  preferredModel: z.string().trim().max(160).optional().nullable(),
  fallbackModels: z.array(z.string().trim().max(160)).max(4).optional().default([]),
  maxInputTokens: z.number().int().min(100).max(200000).optional().default(12000),
  maxOutputTokens: z.number().int().min(50).max(16000).optional().default(2500),
  maxCalls: z.number().int().min(0).max(20).optional().default(3),
  maxEstimatedCost: z.number().min(0).max(100).optional().default(1),
  timeout: z.number().int().min(1000).max(300000).optional().default(60000),
}).strict();

const budgetPolicySchema = z.object({
  maxToolCalls: z.number().int().min(0).max(100).optional().default(12),
  maxProposals: z.number().int().min(0).max(50).optional().default(8),
  maxRunMs: z.number().int().min(1000).max(3600000).optional().default(300000),
}).strict();

const triggerPolicySchema = z.object({
  events: z.array(z.enum([
    'DOCUMENT_PROCESSED', 'MATTER_UPDATED', 'DEADLINE_APPROACHING', 'TASK_COMPLETED',
    'RESEARCH_CORPUS_UPDATED',
  ])).max(7).optional().default([]),
  cooldownSeconds: z.number().int().min(60).max(86400).optional().default(300),
}).strict();

function policyError(message, code = 'AGENT_POLICY_VIOLATION') {
  const error = new Error(message);
  error.status = 400;
  error.code = code;
  return error;
}

function scanForCode(value, path = 'definition') {
  if (typeof value === 'string') {
    if (SUSPICIOUS_CODE.test(value)) throw policyError(`Arbitrary code is not allowed at ${path}.`, 'ARBITRARY_CODE_REJECTED');
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanForCode(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.test(key)) throw policyError(`Forbidden workflow field: ${key}.`, 'ARBITRARY_CODE_REJECTED');
    scanForCode(item, `${path}.${key}`);
  }
}

class AgentPolicyService {
  constructor({ maxSteps = Number(process.env.AGENT_MAX_WORKFLOW_STEPS || 30) } = {}) {
    this.maxSteps = Math.max(2, Math.min(Number(maxSteps) || 30, 100));
  }

  validateDefinition(rawDefinition, rawToolPolicy = {}) {
    if (JSON.stringify(rawDefinition || {}).length > 200000) {
      throw policyError('Workflow definition is too large.', 'WORKFLOW_DEFINITION_TOO_LARGE');
    }
    scanForCode(rawDefinition);
    const definition = definitionSchema.parse(rawDefinition);
    if (definition.steps.length > this.maxSteps) {
      throw policyError(`Workflow exceeds the ${this.maxSteps} step limit.`, 'WORKFLOW_STEP_LIMIT');
    }
    if (definition.steps[0].type !== 'START' || definition.steps.at(-1).type !== 'END') {
      throw policyError('Workflow must begin with START and end with END.', 'INVALID_WORKFLOW_BOUNDARY');
    }
    const ids = new Map();
    definition.steps.forEach((step, index) => {
      if (ids.has(step.id)) throw policyError(`Duplicate workflow step: ${step.id}.`, 'DUPLICATE_WORKFLOW_STEP');
      ids.set(step.id, index);
      if (step.type === 'CALL_TOOL') {
        if (!step.tool || !READ_TOOLS.includes(step.tool)) {
          const code = DIRECT_WRITE_TOOLS.includes(step.tool) ? 'DIRECT_WRITE_TOOL_FORBIDDEN' : 'TOOL_NOT_ALLOWED';
          throw policyError(`Tool is not allowed: ${step.tool || 'missing'}.`, code);
        }
      }
      if (step.type === 'CALL_MODEL' && !step.schema) {
        throw policyError('CALL_MODEL requires a registered output schema.', 'MODEL_SCHEMA_REQUIRED');
      }
      if (step.type === 'CREATE_PROPOSAL' && !step.proposalType) {
        throw policyError('CREATE_PROPOSAL requires proposalType.', 'PROPOSAL_TYPE_REQUIRED');
      }
      if (step.fromStep && !ids.has(step.fromStep)) {
        throw policyError(`Unknown source step: ${step.fromStep}.`, 'UNKNOWN_WORKFLOW_SOURCE');
      }
    });
    definition.steps.forEach((step, index) => {
      for (const target of [step.then, step.else].filter(Boolean)) {
        if (!ids.has(target)) throw policyError(`Unknown workflow target: ${target}.`, 'UNKNOWN_WORKFLOW_TARGET');
        if (ids.get(target) <= index) throw policyError('Backward workflow edges are not allowed.', 'WORKFLOW_CYCLE_REJECTED');
      }
    });
    const requestedTools = rawToolPolicy.allowedTools || READ_TOOLS;
    if (!Array.isArray(requestedTools) || requestedTools.some((tool) => !READ_TOOLS.includes(tool))) {
      throw policyError('Tool policy contains a non-allowlisted tool.', 'TOOL_POLICY_REJECTED');
    }
    for (const step of definition.steps.filter((item) => item.type === 'CALL_TOOL')) {
      if (!requestedTools.includes(step.tool)) throw policyError(`Tool policy denies ${step.tool}.`, 'TOOL_POLICY_REJECTED');
    }
    return {
      definition,
      toolPolicy: { mode: 'ALLOWLIST', allowedTools: [...new Set(requestedTools)] },
    };
  }

  validatePolicies({ modelPolicy = {}, budgetPolicy = {}, triggerPolicy = {} } = {}) {
    return {
      modelPolicy: modelPolicySchema.parse(modelPolicy),
      budgetPolicy: budgetPolicySchema.parse(budgetPolicy),
      triggerPolicy: triggerPolicySchema.parse(triggerPolicy),
    };
  }

  riskForProposal(proposalType) {
    const risk = PROPOSAL_RISK[proposalType];
    if (!risk) throw policyError('Unknown proposal type.', 'UNKNOWN_PROPOSAL_TYPE');
    return risk;
  }

  requireApprovalPermission(context, organizationId, riskLevel) {
    const permission = ['CRITICAL_WRITE', 'EXTERNAL_ACTION'].includes(riskLevel)
      ? 'AGENT_APPROVE_CRITICAL'
      : 'AGENT_APPROVE_REVERSIBLE';
    requirePermission(context, organizationId, permission);
    return permission;
  }
}

module.exports = {
  AgentPolicyService,
  DIRECT_WRITE_TOOLS,
  NODE_TYPES,
  PROPOSAL_RISK,
  READ_TOOLS,
  budgetPolicySchema,
  definitionSchema,
  modelPolicySchema,
  policyError,
  triggerPolicySchema,
};
