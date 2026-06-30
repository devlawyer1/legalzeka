const crypto = require('node:crypto');
const { pool } = require('../../config/db');
const AuditLogService = require('../AuditLogService');
const { canUseOrganization } = require('../accessContext');
const { hasPermission, requirePermission } = require('../practice/PermissionService');
const { AgentContextBuilder } = require('./AgentContextBuilder');
const { AgentPolicyService } = require('./AgentPolicyService');
const { AgentQueueService } = require('./AgentQueueService');

const WORKFLOW_TYPES = Object.freeze([
  'MATTER_INTAKE', 'DOCUMENT_REVIEW', 'EVIDENCE_GAP_REVIEW', 'LEGAL_RESEARCH',
  'RESEARCH_MONITOR', 'DRAFT_REVIEW', 'DEADLINE_RISK', 'CLIENT_UPDATE', 'CUSTOM',
]);
const TRIGGER_TYPES = Object.freeze([
  'MANUAL', 'SCHEDULE', 'DOCUMENT_PROCESSED', 'MATTER_UPDATED',
  'DEADLINE_APPROACHING', 'TASK_COMPLETED', 'RESEARCH_CORPUS_UPDATED',
]);

function agentError(message, status = 400, code = 'AGENT_ERROR') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function checksum(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(canonical(payload))).digest('hex');
}

function pageOptions(filters = {}) {
  const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 100);
  const offset = Math.max(Number(filters.offset) || 0, 0);
  return { limit, offset };
}

class AgentWorkflowService {
  constructor({
    db = pool,
    policyService = new AgentPolicyService(),
    queueService = new AgentQueueService({ db }),
    contextBuilder = new AgentContextBuilder({ db }),
  } = {}) {
    this.db = db;
    this.policyService = policyService;
    this.queueService = queueService;
    this.contextBuilder = contextBuilder;
  }

  async assertNotPortal(context, db = this.db) {
    if (context?.isSystemAdmin || context?.memberships?.length) return true;
    const { rowCount } = await db.query(
      `SELECT 1 FROM client_portal_access
       WHERE user_id = $1 AND status = 'ACTIVE' AND revoked_at IS NULL LIMIT 1`,
      [context.userId]
    );
    if (rowCount) throw agentError('Portal users cannot run agents.', 403, 'PORTAL_AGENT_FORBIDDEN');
    return true;
  }

  async findAccessible(workflowId, context, permission = 'read', { db = this.db, lock = false } = {}) {
    const { rows } = await db.query(
      `SELECT workflow.*, version.definition, version.tool_policy, version.model_policy,
              version.budget_policy, version.trigger_policy, version.version_number,
              version.checksum AS version_checksum
       FROM agent_workflows workflow
       LEFT JOIN agent_workflow_versions version ON version.id = workflow.current_version_id
       WHERE workflow.id = $1 AND workflow.deleted_at IS NULL
       ${lock ? 'FOR UPDATE OF workflow' : ''}`,
      [workflowId]
    );
    const workflow = rows[0];
    if (!workflow) throw agentError('Workflow not found.', 404, 'WORKFLOW_NOT_FOUND');
    if (workflow.scope_type === 'SYSTEM' && permission === 'read') return workflow;
    if (workflow.scope_type === 'PERSONAL' && workflow.owner_user_id === context.userId) return workflow;
    if (workflow.scope_type === 'ORGANIZATION'
      && canUseOrganization(context, workflow.organization_id, permission === 'read' ? 'read' : 'write')) {
      return workflow;
    }
    throw agentError('Workflow not found.', 404, 'WORKFLOW_NOT_FOUND');
  }

  async create(input, context, { req } = {}) {
    await this.assertNotPortal(context);
    if (!WORKFLOW_TYPES.includes(input.workflowType)) throw agentError('Unknown workflow type.', 400, 'INVALID_WORKFLOW_TYPE');
    const scopeType = input.scopeType || (input.organizationId ? 'ORGANIZATION' : 'PERSONAL');
    const organizationId = scopeType === 'ORGANIZATION' ? input.organizationId : null;
    if (scopeType === 'ORGANIZATION') {
      if (!organizationId) throw agentError('Organization is required.', 400, 'ORGANIZATION_REQUIRED');
      requirePermission(context, organizationId, 'AGENT_WORKFLOW_CREATE');
    } else if (scopeType !== 'PERSONAL') {
      throw agentError('Unsupported workflow scope.', 400, 'INVALID_WORKFLOW_SCOPE');
    }
    const validated = this.policyService.validateDefinition(input.definition, input.toolPolicy || {});
    const policies = this.policyService.validatePolicies(input);
    const versionChecksum = checksum({ definition: validated.definition, toolPolicy: validated.toolPolicy, ...policies });
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const workflowId = crypto.randomUUID();
      const versionId = crypto.randomUUID();
      const { rows } = await client.query(
        `INSERT INTO agent_workflows (
           id, organization_id, owner_user_id, scope_type, name, description,
           workflow_type, status, current_version_id, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,'DRAFT',$8,$3)
         RETURNING *`,
        [workflowId, organizationId, context.userId, scopeType, input.name, input.description || null, input.workflowType, versionId]
      );
      await client.query(
        `INSERT INTO agent_workflow_versions (
           id, workflow_id, version_number, definition, tool_policy, model_policy,
           budget_policy, trigger_policy, checksum, created_by
         ) VALUES ($1,$2,1,$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9)`,
        [versionId, workflowId, JSON.stringify(validated.definition), JSON.stringify(validated.toolPolicy),
          JSON.stringify(policies.modelPolicy), JSON.stringify(policies.budgetPolicy),
          JSON.stringify(policies.triggerPolicy), versionChecksum, context.userId]
      );
      await AuditLogService.record({
        db: client, strict: true, req, action: 'AGENT_WORKFLOW_CREATED', entityType: 'AGENT_WORKFLOW',
        entityId: workflowId, lawFirmId: organizationId, metadata: { scopeType, workflowType: input.workflowType },
      });
      await AuditLogService.record({
        db: client, strict: true, req, action: 'AGENT_WORKFLOW_VERSION_CREATED', entityType: 'AGENT_WORKFLOW_VERSION',
        entityId: versionId, lawFirmId: organizationId, metadata: { workflowId, versionNumber: 1, checksum: versionChecksum },
      });
      await client.query('COMMIT');
      return { ...rows[0], current_version_id: versionId, version_number: 1, checksum: versionChecksum };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async list(context, filters = {}) {
    await this.assertNotPortal(context);
    const { limit, offset } = pageOptions(filters);
    const organizationIds = (context.memberships || []).filter((item) => item.canRead).map((item) => item.lawFirmId);
    const params = [context.userId, organizationIds, context.isSystemAdmin, limit, offset];
    const clauses = [
      'workflow.deleted_at IS NULL',
      `(
        workflow.scope_type = 'SYSTEM'
        OR (workflow.scope_type = 'PERSONAL' AND workflow.owner_user_id = $1)
        OR (workflow.scope_type = 'ORGANIZATION' AND (workflow.organization_id = ANY($2::uuid[]) OR $3::boolean = true))
      )`,
    ];
    if (filters.status) {
      params.push(filters.status);
      clauses.push(`workflow.status = $${params.length}`);
    }
    if (filters.workflowType) {
      params.push(filters.workflowType);
      clauses.push(`workflow.workflow_type = $${params.length}`);
    }
    const sortMap = { createdAt: 'workflow.created_at', name: 'workflow.name', updatedAt: 'workflow.updated_at' };
    const sort = sortMap[filters.sort] || sortMap.updatedAt;
    const direction = String(filters.direction).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const { rows } = await this.db.query(
      `SELECT workflow.*, version.version_number, version.definition, version.tool_policy,
              version.model_policy, version.budget_policy, version.trigger_policy, version.checksum
       FROM agent_workflows workflow
       LEFT JOIN agent_workflow_versions version ON version.id = workflow.current_version_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY workflow.is_system_template DESC, ${sort} ${direction}, workflow.id
       LIMIT $4 OFFSET $5`,
      params
    );
    return rows;
  }

  async get(workflowId, context) {
    const workflow = await this.findAccessible(workflowId, context);
    const { rows: versions } = await this.db.query(
      `SELECT id, version_number, checksum, created_by, created_at
       FROM agent_workflow_versions WHERE workflow_id = $1 ORDER BY version_number DESC`,
      [workflowId]
    );
    return { ...workflow, versions };
  }

  async update(workflowId, input, context, { req } = {}) {
    await this.assertNotPortal(context);
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const workflow = await this.findAccessible(workflowId, context, 'write', { db: client, lock: true });
      if (workflow.is_system_template) throw agentError('System templates are immutable.', 409, 'SYSTEM_TEMPLATE_IMMUTABLE');
      if (workflow.organization_id) requirePermission(context, workflow.organization_id, 'AGENT_WORKFLOW_CREATE');
      let version = null;
      if (input.definition || input.toolPolicy || input.modelPolicy || input.budgetPolicy || input.triggerPolicy) {
        const validated = this.policyService.validateDefinition(
          input.definition || workflow.definition,
          input.toolPolicy || workflow.tool_policy || {}
        );
        const policies = this.policyService.validatePolicies({
          modelPolicy: input.modelPolicy || workflow.model_policy || {},
          budgetPolicy: input.budgetPolicy || workflow.budget_policy || {},
          triggerPolicy: input.triggerPolicy || workflow.trigger_policy || {},
        });
        const versionChecksum = checksum({ definition: validated.definition, toolPolicy: validated.toolPolicy, ...policies });
        const nextNumber = Number(workflow.version_number || 0) + 1;
        const versionId = crypto.randomUUID();
        const inserted = await client.query(
          `INSERT INTO agent_workflow_versions (
             id, workflow_id, version_number, definition, tool_policy, model_policy,
             budget_policy, trigger_policy, checksum, created_by
           ) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10)
           RETURNING *`,
          [versionId, workflow.id, nextNumber, JSON.stringify(validated.definition), JSON.stringify(validated.toolPolicy),
            JSON.stringify(policies.modelPolicy), JSON.stringify(policies.budgetPolicy), JSON.stringify(policies.triggerPolicy),
            versionChecksum, context.userId]
        );
        version = inserted.rows[0];
        await AuditLogService.record({
          db: client, strict: true, req, action: 'AGENT_WORKFLOW_VERSION_CREATED', entityType: 'AGENT_WORKFLOW_VERSION',
          entityId: versionId, lawFirmId: workflow.organization_id, metadata: { workflowId, versionNumber: nextNumber, checksum: versionChecksum },
        });
      }
      const { rows } = await client.query(
        `UPDATE agent_workflows
         SET name = COALESCE($2, name), description = COALESCE($3, description),
             current_version_id = COALESCE($4, current_version_id), updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 RETURNING *`,
        [workflowId, input.name || null, input.description === undefined ? null : input.description, version?.id || null]
      );
      await client.query('COMMIT');
      return { ...rows[0], version: version || undefined };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async setStatus(workflowId, status, context, { req } = {}) {
    const workflow = await this.findAccessible(workflowId, context, 'write');
    if (workflow.is_system_template) throw agentError('System templates cannot be activated.', 409, 'SYSTEM_TEMPLATE_IMMUTABLE');
    if (workflow.organization_id) requirePermission(context, workflow.organization_id, 'AGENT_WORKFLOW_ACTIVATE');
    else if (workflow.owner_user_id !== context.userId) throw agentError('Permission denied.', 403, 'PERMISSION_DENIED');
    if (status === 'ACTIVE' && !workflow.current_version_id) throw agentError('Workflow has no version.', 409, 'WORKFLOW_VERSION_REQUIRED');
    const { rows } = await this.db.query(
      `UPDATE agent_workflows SET status = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [workflowId, status]
    );
    await AuditLogService.record({
      req, action: status === 'ACTIVE' ? 'AGENT_WORKFLOW_ACTIVATED' : 'AGENT_WORKFLOW_PAUSED',
      entityType: 'AGENT_WORKFLOW', entityId: workflowId, lawFirmId: workflow.organization_id,
      metadata: { status, versionId: workflow.current_version_id },
    });
    return rows[0];
  }

  async createRun(workflowId, input, context, { req, db = this.db } = {}) {
    await this.assertNotPortal(context, db);
    const workflow = await this.findAccessible(workflowId, context, 'read', { db });
    if (workflow.status !== 'ACTIVE') throw agentError('Workflow is not active.', 409, 'WORKFLOW_NOT_ACTIVE');
    if (workflow.organization_id) requirePermission(context, workflow.organization_id, 'AGENT_RUN');
    else if (workflow.owner_user_id !== context.userId) throw agentError('Permission denied.', 403, 'PERMISSION_DENIED');
    let matter = null;
    if (input.caseId) {
      matter = await this.contextBuilder.matter(input.caseId, context, 'read');
      if (workflow.organization_id && matter.law_firm_id !== workflow.organization_id) {
        throw agentError('Matter is outside workflow tenant.', 400, 'WORKFLOW_MATTER_SCOPE_MISMATCH');
      }
      if (!workflow.organization_id && matter.owner_user_id !== context.userId) {
        throw agentError('Matter is outside personal workflow scope.', 400, 'WORKFLOW_MATTER_SCOPE_MISMATCH');
      }
    }
    const triggerType = input.triggerType || 'MANUAL';
    if (JSON.stringify(input.inputData || {}).length > 100000) {
      throw agentError('Agent run input is too large.', 413, 'AGENT_INPUT_TOO_LARGE');
    }
    if (!TRIGGER_TYPES.includes(triggerType)) throw agentError('Unknown trigger type.', 400, 'INVALID_TRIGGER_TYPE');
    const idempotencyKey = input.idempotencyKey || null;
    const client = db === this.db && typeof this.db.connect === 'function' ? await this.db.connect() : null;
    const tx = client || db;
    try {
      if (client) await tx.query('BEGIN');
      if (idempotencyKey) {
        const existing = await tx.query(
          'SELECT * FROM agent_runs WHERE user_id = $1 AND idempotency_key = $2 LIMIT 1',
          [context.userId, idempotencyKey]
        );
        if (existing.rows[0]) {
          if (client) await tx.query('COMMIT');
          return existing.rows[0];
        }
      }
      const runId = crypto.randomUUID();
      const inserted = await tx.query(
          `INSERT INTO agent_runs (
             id, workflow_id, workflow_version_id, user_id, organization_id, case_id,
             status, trigger_type, trigger_reference, input_data, idempotency_key
           ) VALUES ($1,$2,$3,$4,$5,$6,'QUEUED',$7,$8,$9::jsonb,$10)
           ON CONFLICT DO NOTHING
           RETURNING *`,
          [runId, workflow.id, workflow.current_version_id, context.userId, workflow.organization_id || null,
            input.caseId || null, triggerType, input.triggerReference || null,
            JSON.stringify(input.inputData || {}), idempotencyKey]
        );
      if (!inserted.rows[0]) {
        const existing = await tx.query(
          `SELECT * FROM agent_runs
           WHERE ($2::varchar IS NOT NULL AND user_id = $1 AND idempotency_key = $2)
              OR ($5::varchar IS NOT NULL AND workflow_id = $3 AND trigger_type = $4 AND trigger_reference = $5)
           ORDER BY created_at DESC LIMIT 1`,
          [context.userId, idempotencyKey, workflow.id, triggerType, input.triggerReference || null]
        );
        if (!existing.rows[0]) throw error;
        if (client) await tx.query('COMMIT');
        return existing.rows[0];
      }
      const run = inserted.rows[0];
      await this.queueService.enqueue(run, { db: tx });
      await AuditLogService.record({
        db: tx, strict: true, req, action: 'AGENT_RUN_QUEUED', entityType: 'AGENT_RUN', entityId: run.id,
        lawFirmId: run.organization_id, caseId: run.case_id,
        metadata: { workflowId: run.workflow_id, workflowVersionId: run.workflow_version_id, triggerType },
      });
      if (client) await tx.query('COMMIT');
      return run;
    } catch (error) {
      if (client) await tx.query('ROLLBACK');
      throw error;
    } finally {
      client?.release();
    }
  }

  async findRunAccessible(runId, context, { db = this.db, lock = false } = {}) {
    const { rows } = await db.query(
      `SELECT run.*, workflow.name AS workflow_name, workflow.scope_type,
              version.version_number, version.definition, version.tool_policy,
              version.model_policy, version.budget_policy, version.trigger_policy
       FROM agent_runs run
       JOIN agent_workflows workflow ON workflow.id = run.workflow_id
       JOIN agent_workflow_versions version ON version.id = run.workflow_version_id
       WHERE run.id = $1 ${lock ? 'FOR UPDATE OF run' : ''}`,
      [runId]
    );
    const run = rows[0];
    if (!run) throw agentError('Agent run not found.', 404, 'AGENT_RUN_NOT_FOUND');
    if (context.isSystemAdmin || run.user_id === context.userId
      || (run.organization_id && canUseOrganization(context, run.organization_id, 'read'))) return run;
    throw agentError('Agent run not found.', 404, 'AGENT_RUN_NOT_FOUND');
  }

  async listRuns(context, filters = {}) {
    await this.assertNotPortal(context);
    const { limit, offset } = pageOptions(filters);
    const organizationIds = (context.memberships || []).filter((item) => item.canRead).map((item) => item.lawFirmId);
    const params = [context.userId, organizationIds, context.isSystemAdmin];
    const clauses = [`(run.user_id = $1 OR run.organization_id = ANY($2::uuid[]) OR $3::boolean = true)`];
    if (filters.caseId) {
      await this.contextBuilder.matter(filters.caseId, context);
      params.push(filters.caseId);
      clauses.push(`run.case_id = $${params.length}`);
    }
    if (filters.status) {
      params.push(filters.status);
      clauses.push(`run.status = $${params.length}`);
    }
    params.push(limit, offset);
    const limitParam = params.length - 1;
    const offsetParam = params.length;
    const sortMap = { createdAt: 'run.created_at', updatedAt: 'run.updated_at', cost: 'run.estimated_cost' };
    const sort = sortMap[filters.sort] || sortMap.createdAt;
    const direction = String(filters.direction).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const { rows } = await this.db.query(
      `SELECT run.*, workflow.name AS workflow_name, version.version_number
       FROM agent_runs run
       JOIN agent_workflows workflow ON workflow.id = run.workflow_id
       JOIN agent_workflow_versions version ON version.id = run.workflow_version_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY ${sort} ${direction}, run.id
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      params
    );
    return rows.map((run) => {
      if (!run.organization_id || hasPermission(context, run.organization_id, 'AGENT_VIEW_COSTS')) return run;
      return { ...run, estimated_cost: null, input_tokens: null, output_tokens: null };
    });
  }

  async getRun(runId, context) {
    const run = await this.findRunAccessible(runId, context);
    const [steps, tools, proposals] = await Promise.all([
      this.db.query('SELECT * FROM agent_run_steps WHERE run_id = $1 ORDER BY step_number', [runId]),
      this.db.query('SELECT * FROM agent_tool_calls WHERE run_id = $1 ORDER BY created_at', [runId]),
      this.db.query('SELECT * FROM agent_proposals WHERE run_id = $1 ORDER BY created_at', [runId]),
    ]);
    const canViewCosts = !run.organization_id || hasPermission(context, run.organization_id, 'AGENT_VIEW_COSTS');
    return {
      ...run,
      ...(canViewCosts ? {} : { estimated_cost: null, input_tokens: null, output_tokens: null }),
      steps: steps.rows,
      toolCalls: tools.rows,
      proposals: proposals.rows,
    };
  }

  async cancelRun(runId, context, { req } = {}) {
    const run = await this.findRunAccessible(runId, context);
    if (run.organization_id) requirePermission(context, run.organization_id, 'AGENT_CANCEL_RUN');
    else if (run.user_id !== context.userId) throw agentError('Permission denied.', 403, 'PERMISSION_DENIED');
    if (['COMPLETED', 'FAILED', 'CANCELLED', 'BUDGET_EXCEEDED'].includes(run.status)) return run;
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `UPDATE agent_runs
         SET status = 'CANCELLED', cancelled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 RETURNING *`,
        [runId]
      );
      await this.queueService.cancel(runId, { db: client });
      await AuditLogService.record({
        db: client, strict: true, req, action: 'AGENT_RUN_CANCELLED', entityType: 'AGENT_RUN', entityId: runId,
        lawFirmId: run.organization_id, caseId: run.case_id, metadata: { workflowId: run.workflow_id },
      });
      await client.query('COMMIT');
      return rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async retryRun(runId, context, { req } = {}) {
    const run = await this.findRunAccessible(runId, context);
    if (!['FAILED', 'PARTIALLY_COMPLETED'].includes(run.status)) {
      throw agentError('Only failed runs can be retried.', 409, 'RUN_NOT_RETRYABLE');
    }
    if (run.organization_id) requirePermission(context, run.organization_id, 'AGENT_RUN');
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `UPDATE agent_runs
         SET status = 'QUEUED', failed_at = NULL, error_code = NULL, safe_error_message = NULL,
             retry_count = retry_count + 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 RETURNING *`,
        [runId]
      );
      await this.queueService.enqueue(rows[0], { db: client, reason: `manual-retry-${rows[0].retry_count}` });
      await AuditLogService.record({
        db: client, strict: true, req, action: 'AGENT_RUN_QUEUED', entityType: 'AGENT_RUN', entityId: runId,
        lawFirmId: run.organization_id, caseId: run.case_id, metadata: { retry: true, retryCount: rows[0].retry_count },
      });
      await client.query('COMMIT');
      return rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async resumeAfterApproval(runId, { db = this.db } = {}) {
    const { rows } = await db.query(
      `UPDATE agent_runs
       SET status = 'QUEUED', approval_wait_ms = approval_wait_ms + GREATEST(0,
             (EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - waiting_approval_at)) * 1000)::bigint),
           waiting_approval_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'WAITING_APPROVAL'
         AND NOT EXISTS (SELECT 1 FROM agent_proposals WHERE run_id = $1 AND status = 'PENDING')
       RETURNING *`,
      [runId]
    );
    if (rows[0]) await this.queueService.enqueue(rows[0], { db, reason: 'approval-resume' });
    return rows[0] || null;
  }

  async triggerEvent({ workflowId, eventType, eventKey, caseId = null, userId, context, inputData = {} }) {
    if (!eventKey) throw agentError('Event key is required.', 400, 'EVENT_KEY_REQUIRED');
    return this.createRun(workflowId, {
      caseId,
      triggerType: eventType,
      triggerReference: String(eventKey).slice(0, 255),
      idempotencyKey: `event:${workflowId}:${eventType}:${eventKey}`.slice(0, 255),
      inputData,
    }, context || { userId }, {});
  }
}

module.exports = {
  AgentWorkflowService,
  TRIGGER_TYPES,
  WORKFLOW_TYPES,
  agentError,
  canonical,
  checksum,
  pageOptions,
};
