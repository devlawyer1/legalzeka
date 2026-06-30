const { performance } = require('node:perf_hooks');
const { z } = require('zod');
const { pool } = require('../../config/db');
const { buildAccessContext } = require('../accessContext');
const { getCalculationEngine } = require('../calculations');
const { createDraftingServices } = require('../drafting');
const { getLegalResearchService } = require('../legalResearch');
const { legalSearchService } = require('../legalSearch');
const { requirePermission } = require('../practice/PermissionService');
const { PracticeManagementService } = require('../practice/PracticeManagementService');
const { AgentContextBuilder } = require('./AgentContextBuilder');
const { AgentProposalService } = require('./AgentProposalService');
const { READ_TOOLS } = require('./AgentPolicyService');
const { agentError, checksum } = require('./AgentWorkflowService');

const uuid = z.string().uuid();
const safeObject = z.record(z.any());
const safeOutput = z.union([z.record(z.any()), z.array(z.any())]);

function summarize(value) {
  if (Array.isArray(value)) return { kind: 'list', count: value.length };
  if (!value || typeof value !== 'object') return { kind: typeof value };
  const summary = { kind: 'object', keys: Object.keys(value).slice(0, 20) };
  for (const [key, item] of Object.entries(value)) {
    if (Array.isArray(item)) summary[`${key}Count`] = item.length;
  }
  return summary;
}

class AgentToolRegistry {
  constructor({
    db = pool,
    contextBuilder = new AgentContextBuilder({ db }),
    proposalService = new AgentProposalService({ db }),
    searchService = legalSearchService,
    researchService = getLegalResearchService(),
    draftingServices = createDraftingServices({ db }),
    calculationEngine = getCalculationEngine(),
    practiceService = new PracticeManagementService({ db }),
  } = {}) {
    this.db = db;
    this.contextBuilder = contextBuilder;
    this.proposalService = proposalService;
    this.searchService = searchService;
    this.researchService = researchService;
    this.draftingServices = draftingServices;
    this.calculationEngine = calculationEngine;
    this.practiceService = practiceService;
    this.tools = new Map();
    this._registerDefaults();
  }

  register(name, definition) {
    if (!READ_TOOLS.includes(name)) throw agentError(`Tool is outside allowlist: ${name}.`, 400, 'TOOL_NOT_ALLOWED');
    if (this.tools.has(name)) throw agentError(`Tool already registered: ${name}.`, 500, 'DUPLICATE_TOOL');
    this.tools.set(name, Object.freeze({ version: '1', riskLevel: 'READ_ONLY', ...definition }));
  }

  _registerDefaults() {
    const caseInput = z.object({ caseId: uuid.optional() }).strict();
    this.register('matter.get_summary', {
      inputSchema: caseInput,
      outputSchema: safeOutput,
      execute: ({ caseId }, context) => this.contextBuilder.getMatterSummary(caseId, context),
    });
    this.register('matter.get_verified_events', {
      inputSchema: caseInput,
      outputSchema: safeOutput,
      execute: ({ caseId }, context) => this.contextBuilder.getVerifiedEvents(caseId, context),
    });
    this.register('matter.get_verified_parties', {
      inputSchema: caseInput,
      outputSchema: safeOutput,
      execute: ({ caseId }, context) => this.contextBuilder.getVerifiedParties(caseId, context),
    });
    this.register('document.get_pages', {
      inputSchema: z.object({ caseId: uuid.optional(), documentId: uuid, pageNumbers: z.array(z.number().int().positive()).max(20).optional() }).strict(),
      outputSchema: safeOutput,
      execute: (input, context) => this.contextBuilder.getDocumentPages(input.caseId, input.documentId, context, input.pageNumbers || []),
    });
    this.register('document.get_processing_status', {
      inputSchema: z.object({ caseId: uuid.optional(), documentId: uuid }).strict(),
      outputSchema: safeOutput,
      execute: (input, context) => this.contextBuilder.getDocumentStatus(input.caseId, input.documentId, context),
    });
    this.register('document.list_suggestions', {
      inputSchema: z.object({ caseId: uuid.optional(), documentId: uuid }).strict(),
      outputSchema: safeOutput,
      execute: (input, context) => this.contextBuilder.listDocumentSuggestions(input.caseId, input.documentId, context),
    });
    this.register('legal.search', {
      inputSchema: z.object({ caseId: uuid.optional(), query: z.string().trim().min(3).max(1000), pageSize: z.number().int().min(1).max(20).optional() }).strict(),
      outputSchema: safeOutput,
      execute: async (input, context, run) => {
        const caseContext = input.caseId ? await this.contextBuilder.getMatterSummary(input.caseId, context) : null;
        const response = await this.searchService.search({
          query: input.query,
          caseId: input.caseId || null,
          page: 1,
          pageSize: input.pageSize || 10,
          mode: 'HYBRID',
        }, {
          requestId: `agent-${run.id}`,
          accessScope: { userId: context.userId, organizationIds: context.scopes.organizationIds },
          caseContext,
          organizationId: run.organization_id,
        });
        return {
          results: (response.results || []).map((item) => ({
            sourceId: item.sourceId,
            chunkId: item.metadata?.chunkId,
            sourceType: item.sourceType,
            title: item.title,
            excerpt: item.excerpt,
            score: item.score,
          })),
          resultCount: response.results?.length || 0,
        };
      },
    });
    this.register('legal.research', {
      inputSchema: z.object({ caseId: uuid.optional(), query: z.string().trim().min(3).max(1000) }).strict(),
      outputSchema: safeOutput,
      execute: async (input, context, run) => {
        const answer = await this.researchService.answer({
          query: input.query,
          caseId: input.caseId || null,
          idempotencyKey: `agent-research:${run.id}`,
        }, context, { idempotencyKey: `agent-research:${run.id}`, requestId: `agent-${run.id}` });
        return {
          sessionId: answer.sessionId,
          answerId: answer.answerId,
          status: answer.status,
          summary: answer.summary,
          analysis: answer.analysis,
          citations: (answer.citations || []).filter((item) => item.verificationStatus !== 'REJECTED'),
          warnings: answer.warnings || [],
          usage: answer.usage || {},
        };
      },
    });
    this.register('draft.get', {
      inputSchema: z.object({ caseId: uuid.optional(), draftId: uuid }).strict(),
      outputSchema: safeOutput,
      execute: async (input, context) => {
        const draft = await this.draftingServices.draftService.getDetail(input.draftId, context);
        if (input.caseId && draft.case_id !== input.caseId) throw agentError('Draft belongs to another Matter.', 400, 'DRAFT_CASE_MISMATCH');
        return draft;
      },
    });
    this.register('draft.analyze', {
      riskLevel: 'REVERSIBLE_WRITE',
      inputSchema: z.object({ caseId: uuid.optional(), draftId: uuid }).strict(),
      outputSchema: safeOutput,
      execute: async (input, context) => {
        const draft = await this.draftingServices.draftService.findAccessibleDraft(input.draftId, context);
        if (!draft || (input.caseId && draft.case_id !== input.caseId)) throw agentError('Draft not found.', 404, 'DRAFT_NOT_FOUND');
        return this.draftingServices.suggestionService.analyze(input.draftId, {}, context, { emitAgentEvent: false });
      },
    });
    this.register('draft.generate_plan', {
      riskLevel: 'REVERSIBLE_WRITE',
      inputSchema: z.object({ caseId: uuid.optional(), draftId: uuid }).strict(),
      outputSchema: safeOutput,
      execute: async (input, context) => {
        const draft = await this.draftingServices.draftService.findAccessibleDraft(input.draftId, context);
        if (!draft || (input.caseId && draft.case_id !== input.caseId)) throw agentError('Draft not found.', 404, 'DRAFT_NOT_FOUND');
        return this.draftingServices.suggestionService.generatePlan(input.draftId, context);
      },
    });
    this.register('evidence.get_matrix', {
      inputSchema: caseInput,
      outputSchema: safeOutput,
      execute: (input, context) => this.draftingServices.evidenceMatrixService.getMatrix(input.caseId, context),
    });
    this.register('calculation.list_rules', {
      inputSchema: z.object({ calculationType: z.string().trim().max(80).optional().nullable() }).strict(),
      outputSchema: safeOutput,
      execute: (input) => this.calculationEngine.ruleService.listRuleSets({ calculationType: input.calculationType || null, includeInactive: false }),
    });
    this.register('calculation.prepare', {
      inputSchema: z.object({ caseId: uuid.optional(), calculationType: z.string().trim().min(1).max(80), knownInputs: safeObject.optional() }).strict(),
      outputSchema: safeOutput,
      execute: async (input, context) => {
        if (input.caseId) await this.contextBuilder.matter(input.caseId, context);
        const rules = await this.calculationEngine.ruleService.listRuleSets({ calculationType: input.calculationType, includeInactive: false });
        return { calculationType: input.calculationType, knownInputs: input.knownInputs || {}, rules, requiresHumanConfirmation: true };
      },
    });
    this.register('practice.list_tasks', {
      inputSchema: caseInput,
      outputSchema: safeOutput,
      execute: (input, context) => this.practiceService.listTasks(input.caseId, context, { limit: 100 }),
    });
    this.register('practice.list_deadlines', {
      inputSchema: caseInput,
      outputSchema: safeOutput,
      execute: (input, context) => this.practiceService.listDeadlines(input.caseId, context),
    });
    this.register('practice.list_hearings', {
      inputSchema: caseInput,
      outputSchema: safeOutput,
      execute: (input, context) => this.practiceService.listHearings(input.caseId, context),
    });
    this.register('practice.list_client_updates', {
      inputSchema: caseInput,
      outputSchema: safeOutput,
      execute: (input, context) => this.contextBuilder.listClientVisibleUpdates(input.caseId, context),
    });
    this.register('proposal.create', {
      riskLevel: 'REVERSIBLE_WRITE',
      inputSchema: z.object({
        caseId: uuid.optional(),
        proposalType: z.string().trim().min(1).max(50),
        title: z.string().trim().min(1).max(255),
        description: z.string().trim().max(2000).optional().nullable(),
        payload: safeObject,
      }).strict(),
      outputSchema: safeOutput,
      execute: (input, _context, run, meta) => this.proposalService.create({
        run,
        stepId: meta.stepId,
        proposalType: input.proposalType,
        title: input.title,
        description: input.description,
        payload: input.payload,
        caseId: input.caseId || run.case_id,
        db: meta.db,
      }),
    });
  }

  async execute({ run, version, stepId, toolName, input = {}, timeoutMs = 60000 }) {
    const tool = this.tools.get(toolName);
    if (!tool) throw agentError('Tool is not registered.', 400, 'TOOL_NOT_REGISTERED');
    const allowed = version.tool_policy?.allowedTools || READ_TOOLS;
    if (!allowed.includes(toolName)) throw agentError('Workflow tool policy denied this call.', 403, 'TOOL_POLICY_DENIED');
    const context = await buildAccessContext(run.user_id, { db: this.db });
    if (!context) throw agentError('Agent user is inactive.', 403, 'ACTOR_INACTIVE');
    if (run.organization_id) requirePermission(context, run.organization_id, 'AGENT_RUN');
    const parsedInput = tool.inputSchema.parse({ ...input, ...(run.case_id ? { caseId: input.caseId || run.case_id } : {}) });
    if (run.case_id && parsedInput.caseId && parsedInput.caseId !== run.case_id) {
      throw agentError('Tool cannot cross Matter scope.', 400, 'TOOL_CASE_MISMATCH');
    }
    if (run.case_id) await this.contextBuilder.matter(run.case_id, context);
    const call = await this.db.query(
      `INSERT INTO agent_tool_calls (
         run_id, step_id, tool_name, tool_version, risk_level, status, input_hash
       ) VALUES ($1,$2,$3,$4,$5,'RUNNING',$6) RETURNING *`,
      [run.id, stepId, toolName, tool.version, tool.riskLevel, checksum(parsedInput)]
    );
    const started = performance.now();
    let timer;
    try {
      const result = await Promise.race([
        tool.execute(parsedInput, context, run, { stepId, db: this.db }),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(agentError('Tool call timed out.', 504, 'TOOL_TIMEOUT')), timeoutMs);
        }),
      ]);
      const output = tool.outputSchema.parse(result);
      const durationMs = Math.max(0, Math.round(performance.now() - started));
      await this.db.query(
        `UPDATE agent_tool_calls
         SET status = 'COMPLETED', output_hash = $2, duration_ms = $3
         WHERE id = $1`,
        [call.rows[0].id, checksum(output), durationMs]
      );
      await this.db.query(
        `UPDATE agent_runs SET tool_call_count = tool_call_count + 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [run.id]
      );
      return { output, summary: summarize(output), riskLevel: tool.riskLevel, durationMs };
    } catch (error) {
      const durationMs = Math.max(0, Math.round(performance.now() - started));
      await this.db.query(
        `UPDATE agent_tool_calls
         SET status = 'FAILED', duration_ms = $2, error_code = $3 WHERE id = $1`,
        [call.rows[0].id, durationMs, String(error.code || 'TOOL_FAILED').slice(0, 80)]
      );
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

module.exports = { AgentToolRegistry, safeOutput, summarize };
