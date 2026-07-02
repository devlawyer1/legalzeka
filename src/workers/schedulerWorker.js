const { pool } = require('../config/db');
const { AgentScheduleService } = require('../services/agents/AgentScheduleService');
const { getRedisProvider } = require('../services/redis/RedisProvider');

const PG_LOCK_KEY = 76439278;

class SchedulerWorker {
  constructor({ db = pool, redis = getRedisProvider(), agentSchedules = new AgentScheduleService({ db }) } = {}) {
    this.db = db; this.redis = redis; this.agentSchedules = agentSchedules;
  }

  async withLock(operation) {
    if (process.env.REDIS_URL || this.redis.client) {
      const key = this.redis.key('scheduler-lock', ['global']); const owner = await this.redis.acquireLock(key, Number(process.env.SCHEDULER_LOCK_TTL_MS || 55000));
      if (!owner) return { skipped: true, reason: 'LOCKED' };
      try { return await operation(); } finally { await this.redis.releaseLock(key, owner); }
    }
    const client = await this.db.connect();
    try {
      const locked = await client.query('SELECT pg_try_advisory_lock($1) AS locked', [PG_LOCK_KEY]);
      if (!locked.rows[0].locked) return { skipped: true, reason: 'LOCKED' };
      try { return await operation(); } finally { await client.query('SELECT pg_advisory_unlock($1)', [PG_LOCK_KEY]); }
    } finally { client.release(); }
  }

  async runOnce() {
    return this.withLock(async () => {
      const agentRuns = await this.agentSchedules.runDue({ limit: 100 });
      const eventRuns = await this.agentSchedules.triggerOperationalEvents();
      const expiredExports = await this.db.query("UPDATE data_export_jobs SET status='EXPIRED' WHERE status='COMPLETED' AND expires_at<=now() RETURNING id");
      const expiredProposals = await this.db.query("UPDATE agent_proposals SET status='EXPIRED',updated_at=now() WHERE status='PENDING' AND expires_at<=now() RETURNING id");
      const reminders = await this.db.query(
        `INSERT INTO practice_notifications(organization_id,recipient_user_id,event_type,channel,title,entity_type,entity_id,idempotency_key,status)
         SELECT task.organization_id,task.assigned_to,'TASK_DUE','IN_APP','Yaklasan gorev','TASK',task.id,
                'scheduler:task:'||task.id::text||':'||task.due_at::date::text,'QUEUED'
         FROM tasks task WHERE task.deleted_at IS NULL AND task.status NOT IN ('DONE','CANCELLED')
           AND task.due_at>now() AND task.due_at<=now()+interval '24 hours' AND task.assigned_to IS NOT NULL
         ON CONFLICT(idempotency_key,channel) DO NOTHING RETURNING id`
      );
      return { agentRuns: agentRuns.length, eventRuns: eventRuns.length, expiredExports: expiredExports.rowCount, expiredProposals: expiredProposals.rowCount, reminders: reminders.rowCount };
    });
  }
}

async function main() {
  const worker = new SchedulerWorker(); let stopping = false;
  const stop = () => { stopping = true; };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  while (!stopping) {
    await worker.runOnce().catch((error) => console.error(JSON.stringify({ level: 'error', event: 'scheduler_worker_failed', code: error.code, message: error.message })));
    await new Promise((resolve) => setTimeout(resolve, Number(process.env.SCHEDULER_POLL_INTERVAL_MS || 60000)));
  }
  await pool.end();
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = { PG_LOCK_KEY, SchedulerWorker };
