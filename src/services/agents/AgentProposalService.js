const { z } = require('zod');
const { pool } = require('../../config/db');
const AuditLogService = require('../AuditLogService');
const { AgentPolicyService } = require('./AgentPolicyService');
const { canonical, checksum, agentError, pageOptions } = require('./AgentWorkflowService');

const uuid = z.string().uuid();
const dateTime = z.string().datetime({ offset: true }).or(z.string().datetime({ local: true }));
const proposalSchemas = Object.freeze({
  CREATE_TASK: z.object({
    title: z.string().trim().min(1).max(255),
    description: z.string().trim().max(5000).optional().nullable(),
    dueAt: dateTime.optional().nullable(),
    priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
    assignedTo: uuid.optional().nullable(),
  }).strict(),
  CREATE_DEADLINE: z.object({
    calculationRunId: uuid,
  }).strict(),
  START_CALCULATION: z.object({
    calculationType: z.enum(['DEADLINE', 'INTEREST', 'SEVERANCE', 'NOTICE', 'COURT_FEE', 'ATTORNEY_FEE']),
    input: z.record(z.any()),
  }).strict(),
  ADD_MATTER_EVENT: z.object({
    suggestionId: uuid,
    title: z.string().trim().min(1).max(500),
    eventDate: z.string().date().optional().nullable(),
    sourceDocumentId: uuid.optional().nullable(),
    sourcePage: z.number().int().positive().optional().nullable(),
  }).strict(),
  ADD_MATTER_PARTY: z.object({
    suggestionId: uuid,
    name: z.string().trim().min(1).max(500),
    partyType: z.enum(['PERSON', 'ORGANIZATION', 'UNKNOWN']).optional(),
    role: z.string().trim().max(80),
    sourceDocumentId: uuid.optional().nullable(),
    sourcePage: z.number().int().positive().optional().nullable(),
  }).strict(),
  ADD_EVIDENCE_RELATION: z.object({
    claimId: uuid,
    evidenceId: uuid,
    relationType: z.enum(['SUPPORTS', 'CONTRADICTS', 'BACKGROUND']).optional(),
  }).strict(),
  CREATE_DRAFT: z.object({
    draftType: z.string().trim().min(1).max(80),
    title: z.string().trim().min(1).max(255),
  }).strict(),
  APPLY_DRAFT_SUGGESTION: z.object({ draftId: uuid, suggestionId: uuid }).strict(),
  SAVE_RESEARCH: z.object({ sessionId: uuid, answerId: uuid, title: z.string().trim().max(255).optional() }).strict(),
  CREATE_CLIENT_UPDATE: z.object({
    title: z.string().trim().min(1).max(255),
    content: z.string().trim().min(1).max(10000),
    visibility: z.enum(['INTERNAL', 'CLIENT_VISIBLE']).optional().default('CLIENT_VISIBLE'),
  }).strict(),
  SHARE_PORTAL_UPDATE: z.object({ clientId: uuid, updateId: uuid, title: z.string().trim().min(1).max(255) }).strict(),
  SEND_NOTIFICATION: z.object({
    recipientUserId: uuid,
    title: z.string().trim().min(1).max(255),
    body: z.string().trim().max(2000).optional().nullable(),
  }).strict(),
  CREATE_TIME_ENTRY: z.object({
    description: z.string().trim().max(3000).optional().nullable(),
    durationMinutes: z.number().int().min(1).max(100000),
    billable: z.boolean().optional(),
  }).strict(),
});

class AgentProposalService {
  constructor({ db = pool, policyService = new AgentPolicyService() } = {}) {
    this.db = db;
    this.policyService = policyService;
  }

  validatePayload(proposalType, payload) {
    const schema = proposalSchemas[proposalType];
    if (!schema) throw agentError('Unknown proposal type.', 400, 'UNKNOWN_PROPOSAL_TYPE');
    return schema.parse(payload || {});
  }

  async create({ run, stepId = null, proposalType, title, description = null, payload, caseId = null, expiresAt = null, req = null, db = this.db }) {
    const validatedPayload = this.validatePayload(proposalType, payload);
    const targetCaseId = caseId || run.case_id || null;
    if (!targetCaseId && proposalType !== 'SEND_NOTIFICATION') {
      throw agentError('Proposal requires a Matter.', 400, 'PROPOSAL_MATTER_REQUIRED');
    }
    if (run.case_id && targetCaseId && run.case_id !== targetCaseId) {
      throw agentError('Proposal cannot target another Matter.', 400, 'PROPOSAL_CASE_MISMATCH');
    }
    const riskLevel = this.policyService.riskForProposal(proposalType);
    const deduplicationKey = checksum({ stepId, proposalType, caseId: targetCaseId, payload: canonical(validatedPayload) });
    const { rows } = await db.query(
      `INSERT INTO agent_proposals (
         run_id, step_id, case_id, proposal_type, title, description, payload,
         deduplication_key, risk_level, status, expires_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,'PENDING',$10)
       ON CONFLICT (run_id, deduplication_key) DO UPDATE SET updated_at = agent_proposals.updated_at
       RETURNING *`,
      [run.id, stepId, targetCaseId, proposalType, title, description, JSON.stringify(validatedPayload),
        deduplicationKey, riskLevel, expiresAt]
    );
    const proposal = rows[0];
    await db.query(
      `UPDATE agent_runs SET proposal_count = (
         SELECT count(*)::int FROM agent_proposals WHERE run_id = $1
       ), updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [run.id]
    );
    await AuditLogService.record({
      db, strict: true, req, action: 'AGENT_PROPOSAL_CREATED', entityType: 'AGENT_PROPOSAL',
      entityId: proposal.id, lawFirmId: run.organization_id, caseId: targetCaseId,
      metadata: { runId: run.id, proposalType, riskLevel, deduplicationKey },
    });
    return proposal;
  }

  async findAccessible(proposalId, context, workflowService, { db = this.db, lock = false } = {}) {
    const { rows } = await db.query(
      `SELECT proposal.*, run.organization_id, run.user_id, run.workflow_id, run.status AS run_status
       FROM agent_proposals proposal
       JOIN agent_runs run ON run.id = proposal.run_id
       WHERE proposal.id = $1 ${lock ? 'FOR UPDATE OF proposal' : ''}`,
      [proposalId]
    );
    if (!rows[0]) throw agentError('Proposal not found.', 404, 'PROPOSAL_NOT_FOUND');
    await workflowService.findRunAccessible(rows[0].run_id, context, { db });
    return rows[0];
  }

  async list(context, workflowService, filters = {}) {
    const { limit, offset } = pageOptions(filters);
    const organizationIds = (context.memberships || []).filter((item) => item.canRead).map((item) => item.lawFirmId);
    const params = [context.userId, organizationIds, context.isSystemAdmin];
    const clauses = ['(run.user_id = $1 OR run.organization_id = ANY($2::uuid[]) OR $3::boolean = true)'];
    if (filters.caseId) {
      await workflowService.contextBuilder.matter(filters.caseId, context);
      params.push(filters.caseId);
      clauses.push(`proposal.case_id = $${params.length}`);
    }
    if (filters.status) {
      params.push(filters.status);
      clauses.push(`proposal.status = $${params.length}`);
    }
    params.push(limit, offset);
    const { rows } = await this.db.query(
      `SELECT proposal.*, workflow.name AS workflow_name
       FROM agent_proposals proposal
       JOIN agent_runs run ON run.id = proposal.run_id
       JOIN agent_workflows workflow ON workflow.id = run.workflow_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY proposal.created_at DESC, proposal.id
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return rows;
  }

  async expirePending({ db = this.db } = {}) {
    const { rows } = await db.query(
      `UPDATE agent_proposals
       SET status = 'EXPIRED', updated_at = CURRENT_TIMESTAMP
       WHERE status = 'PENDING' AND expires_at IS NOT NULL AND expires_at <= CURRENT_TIMESTAMP
       RETURNING *`
    );
    for (const proposal of rows) {
      await db.query(
        `INSERT INTO agent_approval_events (proposal_id, action, actor_user_id, metadata)
         SELECT $1, 'EXPIRED', run.user_id, '{}'::jsonb FROM agent_runs run WHERE run.id = $2`,
        [proposal.id, proposal.run_id]
      );
    }
    return rows;
  }
}

module.exports = { AgentProposalService, proposalSchemas };
