const cron = require('node-cron');
const { pool } = require('../../config/db');
const AuditLogService = require('../AuditLogService');
const { buildAccessContext } = require('../accessContext');
const { requirePermission } = require('../practice/PermissionService');
const { AgentWorkflowService, agentError } = require('./AgentWorkflowService');

function expandField(field, min, max) {
  const values = new Set();
  for (const part of String(field).split(',')) {
    if (part === '*') {
      for (let value = min; value <= max; value += 1) values.add(value);
      continue;
    }
    const stepMatch = part.match(/^\*\/(\d+)$/);
    if (stepMatch) {
      const step = Number(stepMatch[1]);
      if (!step) throw agentError('Invalid cron step.', 400, 'INVALID_CRON');
      for (let value = min; value <= max; value += step) values.add(value);
      continue;
    }
    const rangeMatch = part.match(/^(\d+)-(\d+)(?:\/(\d+))?$/);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      const step = Number(rangeMatch[3] || 1);
      if (start < min || end > max || start > end || !step) throw agentError('Invalid cron range.', 400, 'INVALID_CRON');
      for (let value = start; value <= end; value += step) values.add(value);
      continue;
    }
    if (!/^\d+$/.test(part)) throw agentError('Unsupported cron syntax.', 400, 'INVALID_CRON');
    const value = Number(part);
    if (value < min || value > max) throw agentError('Cron value is out of range.', 400, 'INVALID_CRON');
    values.add(value);
  }
  return values;
}

function validateCronExpression(expression, minimumMinutes = Number(process.env.AGENT_SCHEDULE_MIN_MINUTES || 5)) {
  const value = String(expression || '').trim();
  if (!cron.validate(value)) throw agentError('Invalid cron expression.', 400, 'INVALID_CRON');
  const parts = value.split(/\s+/);
  if (parts.length !== 5) throw agentError('Only five-field cron expressions are supported.', 400, 'INVALID_CRON');
  const minutes = [...expandField(parts[0], 0, 59)].sort((a, b) => a - b);
  if (minutes.length > 1) {
    const gaps = minutes.map((minute, index) => {
      const next = minutes[(index + 1) % minutes.length] + (index === minutes.length - 1 ? 60 : 0);
      return next - minute;
    });
    if (Math.min(...gaps) < minimumMinutes) {
      throw agentError(`Schedule frequency must be at least ${minimumMinutes} minutes.`, 400, 'SCHEDULE_TOO_FREQUENT');
    }
  }
  return value;
}

function zonedParts(date, timezone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', hourCycle: 'h23', weekday: 'short',
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const weekdays = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    minute: Number(parts.minute), hour: Number(parts.hour), day: Number(parts.day),
    month: Number(parts.month), weekday: weekdays[parts.weekday], year: Number(parts.year),
  };
}

function nextRunAt(expression, timezone, after = new Date()) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(after);
  } catch (_) {
    throw agentError('Invalid schedule timezone.', 400, 'INVALID_TIMEZONE');
  }
  const parts = validateCronExpression(expression).split(/\s+/);
  const allowed = [
    expandField(parts[0], 0, 59), expandField(parts[1], 0, 23),
    expandField(parts[2], 1, 31), expandField(parts[3], 1, 12), expandField(parts[4], 0, 7),
  ];
  const cursor = new Date(after.getTime());
  cursor.setUTCSeconds(0, 0);
  cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  const maxIterations = 60 * 24 * 370;
  for (let i = 0; i < maxIterations; i += 1) {
    const local = zonedParts(cursor, timezone);
    const weekdayMatches = allowed[4].has(local.weekday) || (local.weekday === 0 && allowed[4].has(7));
    if (allowed[0].has(local.minute) && allowed[1].has(local.hour)
      && allowed[2].has(local.day) && allowed[3].has(local.month) && weekdayMatches) return cursor;
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  }
  throw agentError('Could not calculate next schedule slot.', 400, 'CRON_NEXT_RUN_NOT_FOUND');
}

class AgentScheduleService {
  constructor({ db = pool, workflowService = new AgentWorkflowService({ db }) } = {}) {
    this.db = db;
    this.workflowService = workflowService;
  }

  async create(workflowId, input, context, { req } = {}) {
    const workflow = await this.workflowService.findAccessible(workflowId, context, 'write');
    if (workflow.status !== 'ACTIVE') throw agentError('Workflow must be active before scheduling.', 409, 'WORKFLOW_NOT_ACTIVE');
    if (workflow.organization_id) requirePermission(context, workflow.organization_id, 'AGENT_SCHEDULE');
    const expression = validateCronExpression(input.cronExpression);
    const timezone = input.timezone || 'Europe/Istanbul';
    if (input.caseId) {
      const matter = await this.workflowService.contextBuilder.matter(input.caseId, context);
      if (workflow.organization_id && matter.law_firm_id !== workflow.organization_id) {
        throw agentError('Matter is outside workflow tenant.', 400, 'WORKFLOW_MATTER_SCOPE_MISMATCH');
      }
    }
    const next = nextRunAt(expression, timezone);
    const { rows } = await this.db.query(
      `INSERT INTO agent_schedules (
         workflow_id, case_id, cron_expression, timezone, next_run_at, status, created_by
       ) VALUES ($1,$2,$3,$4,$5,'ACTIVE',$6) RETURNING *`,
      [workflowId, input.caseId || null, expression, timezone, next, context.userId]
    );
    await AuditLogService.record({
      req, action: 'AGENT_SCHEDULE_CREATED', entityType: 'AGENT_SCHEDULE', entityId: rows[0].id,
      lawFirmId: workflow.organization_id, caseId: input.caseId || null,
      metadata: { workflowId, timezone, cronExpression: expression, nextRunAt: next.toISOString() },
    });
    return rows[0];
  }

  async list(workflowId, context) {
    await this.workflowService.findAccessible(workflowId, context);
    const { rows } = await this.db.query(
      `SELECT * FROM agent_schedules WHERE workflow_id = $1 AND status <> 'DISABLED'
       ORDER BY created_at DESC LIMIT 100`,
      [workflowId]
    );
    return rows;
  }

  async disable(scheduleId, context, { req } = {}) {
    const { rows } = await this.db.query(
      `SELECT schedule.*, workflow.organization_id
       FROM agent_schedules schedule JOIN agent_workflows workflow ON workflow.id = schedule.workflow_id
       WHERE schedule.id = $1`,
      [scheduleId]
    );
    if (!rows[0]) throw agentError('Schedule not found.', 404, 'SCHEDULE_NOT_FOUND');
    await this.workflowService.findAccessible(rows[0].workflow_id, context, 'write');
    if (rows[0].organization_id) requirePermission(context, rows[0].organization_id, 'AGENT_SCHEDULE');
    const updated = await this.db.query(
      `UPDATE agent_schedules SET status = 'DISABLED', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING *`,
      [scheduleId]
    );
    await AuditLogService.record({
      req, action: 'AGENT_SCHEDULE_DISABLED', entityType: 'AGENT_SCHEDULE', entityId: scheduleId,
      lawFirmId: rows[0].organization_id, caseId: rows[0].case_id,
      metadata: { workflowId: rows[0].workflow_id },
    });
    return updated.rows[0];
  }

  async runDue({ limit = 20 } = {}) {
    const client = await this.db.connect();
    const queued = [];
    try {
      await client.query('BEGIN');
      const due = await client.query(
        `SELECT schedule.*, workflow.organization_id
         FROM agent_schedules schedule
         JOIN agent_workflows workflow ON workflow.id = schedule.workflow_id
         WHERE schedule.status = 'ACTIVE' AND schedule.next_run_at <= CURRENT_TIMESTAMP
           AND workflow.status = 'ACTIVE' AND workflow.deleted_at IS NULL
         ORDER BY schedule.next_run_at
         FOR UPDATE OF schedule SKIP LOCKED
         LIMIT $1`,
        [Math.min(Math.max(Number(limit) || 20, 1), 100)]
      );
      for (const schedule of due.rows) {
        const slot = new Date(schedule.next_run_at).toISOString();
        const next = nextRunAt(schedule.cron_expression, schedule.timezone, new Date(schedule.next_run_at));
        await client.query(
          `UPDATE agent_schedules SET last_run_at = $2, next_run_at = $3,
           updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [schedule.id, schedule.next_run_at, next]
        );
        const context = await buildAccessContext(schedule.created_by, { db: client });
        if (!context) continue;
        const run = await this.workflowService.createRun(schedule.workflow_id, {
          caseId: schedule.case_id,
          triggerType: 'SCHEDULE',
          triggerReference: `${schedule.id}:${slot}`,
          idempotencyKey: `schedule:${schedule.id}:${slot}`.slice(0, 255),
          inputData: { scheduleId: schedule.id, slot },
        }, context, { db: client });
        queued.push(run);
      }
      await client.query('COMMIT');
      return queued;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async triggerEvent({ eventType, eventKey, organizationId = null, caseId = null, inputData = {} }) {
    const { rows } = await this.db.query(
      `SELECT workflow.*, version.trigger_policy
       FROM agent_workflows workflow
       JOIN agent_workflow_versions version ON version.id = workflow.current_version_id
       WHERE workflow.status = 'ACTIVE' AND workflow.deleted_at IS NULL
         AND workflow.is_system_template = false
         AND (($2::uuid IS NULL AND workflow.organization_id IS NULL) OR workflow.organization_id = $2)
         AND version.trigger_policy->'events' ? $1`,
      [eventType, organizationId]
    );
    const queued = [];
    for (const workflow of rows) {
      const cooldownSeconds = Number(workflow.trigger_policy?.cooldownSeconds || 300);
      const recent = await this.db.query(
        `SELECT 1 FROM agent_runs
         WHERE workflow_id = $1 AND trigger_type = $2 AND case_id IS NOT DISTINCT FROM $3
           AND created_at > CURRENT_TIMESTAMP - ($4::int * INTERVAL '1 second')
         LIMIT 1`,
        [workflow.id, eventType, caseId, cooldownSeconds]
      );
      if (recent.rowCount) continue;
      const context = await buildAccessContext(workflow.owner_user_id, { db: this.db });
      if (!context) continue;
      queued.push(await this.workflowService.createRun(workflow.id, {
        caseId,
        triggerType: eventType,
        triggerReference: String(eventKey).slice(0, 255),
        idempotencyKey: `event:${workflow.id}:${eventType}:${eventKey}`.slice(0, 255),
        inputData,
      }, context));
    }
    return queued;
  }

  async triggerOperationalEvents() {
    const { rows } = await this.db.query(
      `SELECT 'deadline' AS kind, id, organization_id, case_id,
              deadline_date AS occurs_at
       FROM deadline_alerts
       WHERE deleted_at IS NULL AND is_acknowledged = false
         AND deadline_date > CURRENT_TIMESTAMP
         AND deadline_date <= CURRENT_TIMESTAMP + INTERVAL '24 hours'
       UNION ALL
       SELECT 'hearing' AS kind, id, firm_id AS organization_id, case_id,
              COALESCE(scheduled_at, hearing_date, tarih_saat) AS occurs_at
       FROM hearings
       WHERE COALESCE(cancelled_at, NULL) IS NULL
         AND COALESCE(scheduled_at, hearing_date, tarih_saat) > CURRENT_TIMESTAMP
         AND COALESCE(scheduled_at, hearing_date, tarih_saat) <= CURRENT_TIMESTAMP + INTERVAL '24 hours'
       ORDER BY occurs_at
       LIMIT 200`
    );
    const queued = [];
    for (const item of rows) {
      const runs = await this.triggerEvent({
        eventType: 'DEADLINE_APPROACHING',
        eventKey: `${item.kind}:${item.id}:${new Date(item.occurs_at).toISOString()}`,
        organizationId: item.organization_id || null,
        caseId: item.case_id,
        inputData: { entityType: item.kind, entityId: item.id, occursAt: item.occurs_at },
      });
      queued.push(...runs);
    }
    return queued;
  }
}

module.exports = {
  AgentScheduleService,
  expandField,
  nextRunAt,
  validateCronExpression,
  zonedParts,
};
