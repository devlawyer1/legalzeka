const { pool } = require('../../config/db');
const AuditLogService = require('../AuditLogService');
const { buildAccessContext } = require('../accessContext');
const { CalculationRunService } = require('../calculations/CalculationRunService');
const { CalculationEngine } = require('../calculations/CalculationEngine');
const { createDraftingServices } = require('../drafting');
const { LegalResearchService } = require('../legalResearch/LegalResearchService');
const { acceptLocked, lockSuggestion } = require('../matterSuggestionService');
const { PracticeNotificationService } = require('../practice/NotificationService');
const { PracticeManagementService } = require('../practice/PracticeManagementService');
const { AgentPolicyService } = require('./AgentPolicyService');
const { AgentProposalService } = require('./AgentProposalService');
const { AgentWorkflowService, agentError } = require('./AgentWorkflowService');

class AgentApprovalService {
  constructor({
    db = pool,
    policyService = new AgentPolicyService(),
    proposalService = null,
    workflowService = null,
  } = {}) {
    this.db = db;
    this.policyService = policyService;
    this.workflowService = workflowService || new AgentWorkflowService({ db });
    this.proposalService = proposalService || new AgentProposalService({ db, policyService });
  }

  async _freshContext(actorUserId, db) {
    const context = await buildAccessContext(actorUserId, { db });
    if (!context) throw agentError('User is no longer active.', 403, 'ACTOR_INACTIVE');
    await this.workflowService.assertNotPortal(context, db);
    return context;
  }

  async _authorize(proposal, context, db) {
    const run = await this.workflowService.findRunAccessible(proposal.run_id, context, { db });
    if (run.organization_id) {
      this.policyService.requireApprovalPermission(context, run.organization_id, proposal.risk_level);
    } else if (run.user_id !== context.userId) {
      throw agentError('Permission denied.', 403, 'PERMISSION_DENIED');
    }
    if (proposal.case_id) await this.workflowService.contextBuilder.practiceService.matter(proposal.case_id, context, 'write', db);
    return run;
  }

  async _execute(proposal, run, context, db, req) {
    const practice = new PracticeManagementService({
      db,
      notifications: new PracticeNotificationService({ db }),
    });
    const payload = this.proposalService.validatePayload(proposal.proposal_type, proposal.payload);
    if (proposal.proposal_type === 'CREATE_TASK') {
      const task = await practice.createTask(proposal.case_id, {
        ...payload,
        sourceType: 'AGENT',
        sourceId: proposal.id,
      }, context, { req });
      return { entityType: 'task', id: task.id };
    }
    if (proposal.proposal_type === 'CREATE_DEADLINE') {
      const calculation = new CalculationRunService({ db });
      const calculationRun = await calculation.get(payload.calculationRunId, context, { db });
      if (calculationRun.case_id !== proposal.case_id) {
        throw agentError('Calculation belongs to another Matter.', 400, 'CALCULATION_CASE_MISMATCH');
      }
      const deadline = await calculation.createDeadline(payload.calculationRunId, context, { db });
      return { entityType: 'deadline', id: deadline.id };
    }
    if (proposal.proposal_type === 'CREATE_CLIENT_UPDATE') {
      const update = await practice.createMatterUpdate(proposal.case_id, payload, context, { req, emitAgentEvent: false });
      return { entityType: 'matter_update', id: update.id };
    }
    if (proposal.proposal_type === 'SHARE_PORTAL_UPDATE') {
      const update = await db.query(
        `SELECT id, title FROM matter_updates
         WHERE id = $1 AND case_id = $2 AND visibility = 'CLIENT_VISIBLE'`,
        [payload.updateId, proposal.case_id]
      );
      if (!update.rows[0]) throw agentError('Shareable update not found.', 404, 'CLIENT_UPDATE_NOT_SHAREABLE');
      const shared = await practice.sharePortalItem({
        caseId: proposal.case_id,
        clientId: payload.clientId,
        itemType: 'UPDATE',
        itemId: payload.updateId,
        title: payload.title,
      }, context, { req });
      return { entityType: 'portal_shared_item', id: shared.id };
    }
    if (proposal.proposal_type === 'SEND_NOTIFICATION') {
      const notification = await practice.notifications.notify({
        db,
        organizationId: run.organization_id,
        ownerUserId: run.organization_id ? null : run.user_id,
        recipientUserId: payload.recipientUserId,
        eventType: 'AGENT_APPROVED_NOTIFICATION',
        title: payload.title,
        body: payload.body || null,
        entityType: 'agent_proposal',
        entityId: proposal.id,
        idempotencyKey: `agent-proposal:${proposal.id}:notification`,
        email: false,
      });
      return { entityType: 'practice_notification', id: notification.id };
    }
    if (proposal.proposal_type === 'CREATE_TIME_ENTRY') {
      const entry = await practice.createTimeEntry({
        caseId: proposal.case_id,
        description: payload.description || 'Agent review',
        durationMinutes: payload.durationMinutes,
        billable: payload.billable,
      }, context, { req });
      return { entityType: 'time_entry', id: entry.id };
    }
    if (proposal.proposal_type === 'ADD_EVIDENCE_RELATION') {
      const drafting = createDraftingServices({ db });
      const relation = await drafting.evidenceMatrixService.createRelation(proposal.case_id, {
        claimId: payload.claimId,
        evidenceId: payload.evidenceId,
        relationType: payload.relationType || 'SUPPORTS',
        suggestedByAi: true,
        verified: false,
      }, context);
      return { entityType: 'claim_evidence_relation', id: relation.id };
    }
    if (proposal.proposal_type === 'ADD_MATTER_EVENT' || proposal.proposal_type === 'ADD_MATTER_PARTY') {
      const suggestion = await lockSuggestion(db, proposal.case_id, payload.suggestionId);
      const expected = proposal.proposal_type === 'ADD_MATTER_PARTY' ? ['PARTY'] : ['EVENT', 'DATE'];
      if (!expected.includes(suggestion.suggestion_type)) {
        throw agentError('Extraction suggestion type does not match proposal.', 400, 'SUGGESTION_TYPE_MISMATCH');
      }
      const accepted = await acceptLocked(db, suggestion, context.userId, req);
      return { entityType: 'matter_twin_entity', id: accepted.suggestion.target_entity_id || suggestion.id };
    }
    if (proposal.proposal_type === 'CREATE_DRAFT') {
      const drafting = createDraftingServices({ db });
      const draft = await drafting.draftService.create({
        caseId: proposal.case_id,
        draftType: payload.draftType,
        title: payload.title,
      }, context, { db });
      return { entityType: 'legal_draft', id: draft.id };
    }
    if (proposal.proposal_type === 'APPLY_DRAFT_SUGGESTION') {
      const drafting = createDraftingServices({ db });
      const result = await drafting.suggestionService.accept(payload.draftId, payload.suggestionId, context, { db });
      return { entityType: 'legal_draft_version', id: result.versionId || result.version?.id };
    }
    if (proposal.proposal_type === 'SAVE_RESEARCH') {
      const research = new LegalResearchService({ db });
      const note = await research.saveAnswerToMatter({
        sessionId: payload.sessionId,
        answerId: payload.answerId,
        accessContext: context,
        title: payload.title,
      });
      if (note.case_id !== proposal.case_id) throw agentError('Research belongs to another Matter.', 400, 'RESEARCH_CASE_MISMATCH');
      return { entityType: 'matter_research_note', id: note.id };
    }
    if (proposal.proposal_type === 'START_CALCULATION') {
      const engine = new CalculationEngine({ db });
      const type = payload.calculationType;
      const kind = type === 'DEADLINE' ? 'deadline'
        : type === 'INTEREST' ? 'interest'
          : ['SEVERANCE', 'NOTICE'].includes(type) ? 'employment'
            : 'fee';
      const input = {
        ...payload.input,
        caseId: proposal.case_id,
        ...(kind === 'employment' ? { calculationType: type === 'NOTICE' ? 'NOTICE_PAY' : type } : {}),
        ...(kind === 'fee' ? { calculationType: type } : {}),
      };
      const calculation = await engine.calculate(kind, input, context, {
        idempotencyKey: `agent-proposal:${proposal.id}`,
        db,
      });
      return { entityType: 'calculation_run', id: calculation.id };
    }
    throw agentError('Proposal execution is not supported.', 409, 'PROPOSAL_EXECUTION_UNSUPPORTED');
  }

  async _approveLocked(proposal, context, db, req) {
    if (proposal.status === 'EXECUTED') return { proposal, idempotent: true };
    if (proposal.status !== 'PENDING') throw agentError('Proposal is no longer pending.', 409, 'PROPOSAL_NOT_PENDING');
    if (proposal.expires_at && new Date(proposal.expires_at) <= new Date()) {
      await db.query("UPDATE agent_proposals SET status = 'EXPIRED', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [proposal.id]);
      throw agentError('Proposal has expired.', 409, 'PROPOSAL_EXPIRED');
    }
    const run = await this._authorize(proposal, context, db);
    await db.query(
      `UPDATE agent_proposals SET status = 'APPROVED', reviewed_by = $2,
       reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [proposal.id, context.userId]
    );
    await db.query(
      `INSERT INTO agent_approval_events (proposal_id, action, actor_user_id, metadata)
       VALUES ($1,'APPROVED',$2,$3::jsonb)`,
      [proposal.id, context.userId, JSON.stringify({ riskLevel: proposal.risk_level })]
    );
    const execution = await this._execute(proposal, run, context, db, req);
    const executionReference = `${execution.entityType}:${execution.id}`;
    const { rows } = await db.query(
      `UPDATE agent_proposals
       SET status = 'EXECUTED', execution_reference = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING *`,
      [proposal.id, executionReference]
    );
    await db.query(
      `INSERT INTO agent_approval_events (proposal_id, action, actor_user_id, metadata)
       VALUES ($1,'EXECUTED',$2,$3::jsonb)`,
      [proposal.id, context.userId, JSON.stringify({ executionReference })]
    );
    await AuditLogService.record({
      db, strict: true, req, action: 'AGENT_PROPOSAL_APPROVED', entityType: 'AGENT_PROPOSAL',
      entityId: proposal.id, lawFirmId: run.organization_id, caseId: proposal.case_id,
      metadata: { runId: run.id, proposalType: proposal.proposal_type, riskLevel: proposal.risk_level },
    });
    await AuditLogService.record({
      db, strict: true, req, action: 'AGENT_PROPOSAL_EXECUTED', entityType: 'AGENT_PROPOSAL',
      entityId: proposal.id, lawFirmId: run.organization_id, caseId: proposal.case_id,
      metadata: { runId: run.id, executionReference },
    });
    return { proposal: rows[0], execution, idempotent: false };
  }

  async approve(proposalId, actorContext, { req } = {}) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const context = await this._freshContext(actorContext.userId, client);
      const proposal = await this.proposalService.findAccessible(proposalId, context, this.workflowService, { db: client, lock: true });
      const result = await this._approveLocked(proposal, context, client, req);
      await this.workflowService.resumeAfterApproval(proposal.run_id, { db: client });
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async reject(proposalId, reason, actorContext, { req } = {}) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const context = await this._freshContext(actorContext.userId, client);
      const proposal = await this.proposalService.findAccessible(proposalId, context, this.workflowService, { db: client, lock: true });
      if (proposal.status === 'REJECTED') {
        await client.query('COMMIT');
        return { proposal, idempotent: true };
      }
      if (proposal.status !== 'PENDING') throw agentError('Proposal is no longer pending.', 409, 'PROPOSAL_NOT_PENDING');
      const run = await this._authorize(proposal, context, client);
      const { rows } = await client.query(
        `UPDATE agent_proposals SET status = 'REJECTED', reviewed_by = $2,
         reviewed_at = CURRENT_TIMESTAMP, rejection_reason = $3, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 RETURNING *`,
        [proposal.id, context.userId, reason || null]
      );
      await client.query(
        `INSERT INTO agent_approval_events (proposal_id, action, actor_user_id, reason)
         VALUES ($1,'REJECTED',$2,$3)`,
        [proposal.id, context.userId, reason || null]
      );
      await AuditLogService.record({
        db: client, strict: true, req, action: 'AGENT_PROPOSAL_REJECTED', entityType: 'AGENT_PROPOSAL',
        entityId: proposal.id, lawFirmId: run.organization_id, caseId: proposal.case_id,
        metadata: { runId: run.id, proposalType: proposal.proposal_type, hasReason: Boolean(reason) },
      });
      await this.workflowService.resumeAfterApproval(proposal.run_id, { db: client });
      await client.query('COMMIT');
      return { proposal: rows[0], idempotent: false };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async bulkReview({ approve = [], reject = [] }, actorContext, { req } = {}) {
    const approveIds = [...new Set(approve)];
    const rejectItems = reject.map((item) => typeof item === 'string' ? { id: item, reason: null } : item);
    const rejectIds = rejectItems.map((item) => item.id);
    if (new Set([...approveIds, ...rejectIds]).size !== approveIds.length + rejectIds.length) {
      throw agentError('A proposal cannot have two bulk actions.', 400, 'DUPLICATE_BULK_TARGET');
    }
    if (!approveIds.length && !rejectIds.length) throw agentError('Bulk review is empty.', 400, 'EMPTY_BULK_REVIEW');
    if (approveIds.length + rejectIds.length > 100) throw agentError('Bulk review limit exceeded.', 400, 'BULK_LIMIT');
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const context = await this._freshContext(actorContext.userId, client);
      const ids = [...approveIds, ...rejectIds];
      const result = await client.query(
        `SELECT proposal.*, run.organization_id, run.user_id
         FROM agent_proposals proposal JOIN agent_runs run ON run.id = proposal.run_id
         WHERE proposal.id = ANY($1::uuid[]) ORDER BY proposal.id FOR UPDATE OF proposal`,
        [ids]
      );
      if (result.rows.length !== ids.length) throw agentError('One or more proposals were not found.', 404, 'PROPOSAL_NOT_FOUND');
      const caseKeys = new Set(result.rows.map((item) => `${item.organization_id || 'personal'}:${item.case_id || 'none'}`));
      if (caseKeys.size !== 1) throw agentError('Bulk review cannot cross Matter or tenant scope.', 409, 'BULK_SCOPE_MISMATCH');
      const approvals = result.rows.filter((item) => approveIds.includes(item.id));
      if (approvals.some((item) => ['CRITICAL_WRITE', 'EXTERNAL_ACTION'].includes(item.risk_level))) {
        throw agentError('Critical and external proposals require individual approval.', 409, 'BULK_CRITICAL_APPROVAL_FORBIDDEN');
      }
      const outputs = [];
      for (const proposal of approvals) outputs.push(await this._approveLocked(proposal, context, client, req));
      for (const item of rejectItems) {
        const proposal = result.rows.find((row) => row.id === item.id);
        if (proposal.status !== 'PENDING') throw agentError('Proposal is no longer pending.', 409, 'PROPOSAL_NOT_PENDING');
        const run = await this._authorize(proposal, context, client);
        const updated = await client.query(
          `UPDATE agent_proposals SET status = 'REJECTED', reviewed_by = $2,
           reviewed_at = CURRENT_TIMESTAMP, rejection_reason = $3, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 RETURNING *`,
          [proposal.id, context.userId, item.reason || null]
        );
        await client.query(
          `INSERT INTO agent_approval_events (proposal_id, action, actor_user_id, reason)
           VALUES ($1,'REJECTED',$2,$3)`,
          [proposal.id, context.userId, item.reason || null]
        );
        outputs.push({ proposal: updated.rows[0], runId: run.id });
      }
      for (const runId of [...new Set(result.rows.map((item) => item.run_id))]) {
        await this.workflowService.resumeAfterApproval(runId, { db: client });
      }
      await client.query('COMMIT');
      return outputs;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = { AgentApprovalService };
