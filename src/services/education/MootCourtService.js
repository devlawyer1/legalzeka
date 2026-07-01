const { pool } = require('../../config/db');
const AuditLogService = require('../AuditLogService');
const { EducationAccessService, educationError } = require('./EducationAccessService');
const { EducationAiService } = require('./EducationAiService');
const { EntitlementService } = require('./EntitlementService');
const { AcademicIntegrityService } = require('./AcademicIntegrityService');
const { assertNoInventedIdentifiers } = require('./GroundingPolicy');

const ROLES = Object.freeze(['CLAIMANT','RESPONDENT','JUDGE','ACADEMIC_OBSERVER']);

class MootCourtService {
  constructor({ db = pool, access = new EducationAccessService({ db }), ai = new EducationAiService({ db }), entitlements = new EntitlementService({ db }), integrity = new AcademicIntegrityService({ db }) } = {}) {
    this.db = db; this.access = access; this.ai = ai; this.entitlements = entitlements; this.integrity = integrity;
  }

  async createScenario(input, context) {
    await this.entitlements.require(context, 'EDU_MOOT');
    await this.access.getWorkspace(input.workspaceId, context, 'write');
    const sourceIds = await this.access.assertSources(input.sourceIds || [], context);
    if (!sourceIds.length) throw educationError('Moot scenario requires legal sources.', 400, 'MOOT_SOURCE_REQUIRED');
    const roles = (input.roles || ROLES).filter((role) => ROLES.includes(role));
    const { rows } = await this.db.query(
      `INSERT INTO moot_scenarios (workspace_id,title,facts,issues,roles,source_ids,evidence,rubric,status,created_by)
       VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7::jsonb,$8::jsonb,$9,$10) RETURNING *`,
      [input.workspaceId, input.title, input.facts, JSON.stringify(input.issues || []), JSON.stringify(roles), sourceIds,
        JSON.stringify(input.evidence || []), JSON.stringify(input.rubric || {}), input.status || 'DRAFT', context.userId]
    );
    return rows[0];
  }

  async startSession(scenarioId, input, context, { req } = {}) {
    const scenario = await this.db.query('SELECT * FROM moot_scenarios WHERE id=$1', [scenarioId]);
    if (!scenario.rows[0]) throw educationError('Moot scenario not found.', 404, 'MOOT_SCENARIO_NOT_FOUND');
    await this.access.getWorkspace(scenario.rows[0].workspace_id, context);
    if (!ROLES.includes(input.selectedRole) || !scenario.rows[0].roles.includes(input.selectedRole)) throw educationError('Invalid moot role.', 400, 'INVALID_MOOT_ROLE');
    const { rows } = await this.db.query(
      `INSERT INTO moot_sessions (scenario_id,user_id,selected_role) VALUES ($1,$2,$3) RETURNING *`,
      [scenarioId, context.userId, input.selectedRole]
    );
    await AuditLogService.record({ db: this.db, req: req || { user: { id: context.userId } }, action: 'MOOT_SESSION_STARTED', entityType: 'MOOT_SESSION', entityId: rows[0].id, metadata: { workspaceId: scenario.rows[0].workspace_id, selectedRole: input.selectedRole } });
    return rows[0];
  }

  async message(sessionId, input, context) {
    const result = await this.db.query(
      `SELECT session.*,scenario.workspace_id,scenario.facts,scenario.issues,scenario.source_ids,scenario.rubric
       FROM moot_sessions session JOIN moot_scenarios scenario ON scenario.id=session.scenario_id WHERE session.id=$1`, [sessionId]
    );
    const session = result.rows[0];
    if (!session || session.user_id !== context.userId) throw educationError('Moot session not found.', 404, 'MOOT_SESSION_NOT_FOUND');
    await this.access.getWorkspace(session.workspace_id, context);
    await this.integrity.assertAllowed({ assignmentId: input.assignmentId || null, operation: 'MOOT_ASSISTANT' });
    const sourceIds = await this.access.assertSources(session.source_ids || [], context);
    const sources = [];
    for (const id of sourceIds) {
      const source = await this.access.getSource(id, null, context);
      sources.push({ sourceId: id, title: source.title, excerpt: String(source.content || '').slice(0, 5000) });
    }
    const ai = await this.ai.run({
      operation: 'MOOT_ASSISTANT', workspaceId: session.workspace_id, userId: context.userId,
      systemPrompt: 'Act as the opposing moot participant, not as a court. Return {response,citations:[{sourceId}],rubricFeedback:{criteria:[],summary}}. Do not give a final legal judgment.',
      payload: { facts: session.facts, issues: session.issues, selectedRole: session.selected_role, userArgument: String(input.message).slice(0, 12000), rubric: session.rubric, sources },
    });
    const cited = (ai.output.citations || []).map((item) => item.sourceId);
    if (cited.some((id) => !sourceIds.includes(id))) throw educationError('Moot assistant invented a source.', 422, 'AI_SOURCE_OUT_OF_SCOPE');
    assertNoInventedIdentifiers(ai.output.response, sources);
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await client.query("INSERT INTO moot_messages (session_id,role,content) VALUES ($1,'USER',$2)", [sessionId, String(input.message).slice(0, 12000)]);
      const response = await client.query(
        `INSERT INTO moot_messages (session_id,role,content,citations,rubric_feedback)
         VALUES ($1,'ASSISTANT',$2,$3::jsonb,$4::jsonb) RETURNING *`,
        [sessionId, String(ai.output.response || '').slice(0, 12000), JSON.stringify(ai.output.citations || []), JSON.stringify(ai.output.rubricFeedback || {})]
      );
      await client.query('COMMIT');
      return { ...response.rows[0], aiUsageId: ai.usage.id };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
}

module.exports = { MootCourtService, ROLES };
