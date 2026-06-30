const crypto = require('node:crypto');
const { pool } = require('../../config/db');
const documentJobs = require('../documentJobService');

function agentBackoffMs(attemptCount) {
  const schedule = String(process.env.AGENT_RUN_BACKOFF_MS || '30000,120000,600000')
    .split(',')
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isFinite(value) && value >= 0);
  const values = schedule.length ? schedule : [30000, 120000, 600000];
  return values[Math.min(Math.max(Number(attemptCount) - 1, 0), values.length - 1)];
}

class AgentQueueService {
  constructor({ db = pool } = {}) {
    this.db = db;
  }

  async enqueue(run, { db = this.db, reason = 'initial' } = {}) {
    const existing = await db.query(
      `SELECT * FROM document_processing_jobs
       WHERE agent_run_id = $1 AND status IN ('QUEUED', 'RUNNING', 'RETRYING')
       ORDER BY created_at DESC LIMIT 1`,
      [run.id]
    );
    if (existing.rows[0]) return existing.rows[0];
    const key = `AGENT_RUN:${run.id}:${reason}:${crypto.randomUUID()}`;
    try {
      const { rows } = await db.query(
        `INSERT INTO document_processing_jobs (
           document_id, case_id, organization_id, owner_user_id, agent_run_id,
           job_type, status, priority, max_attempts, idempotency_key, payload
         ) VALUES (NULL, $1, $2, $3, $4, 'AGENT_RUN', 'QUEUED', 0, $5, $6, $7::jsonb)
         RETURNING *`,
        [
          run.case_id || null,
          run.organization_id || null,
          run.organization_id ? null : run.user_id,
          run.id,
          documentJobs.intEnv('AGENT_RUN_MAX_ATTEMPTS', 3),
          key,
          JSON.stringify({ reason }),
        ]
      );
      return rows[0];
    } catch (error) {
      if (error.code !== '23505') throw error;
      const raced = await db.query(
        `SELECT * FROM document_processing_jobs
         WHERE agent_run_id = $1 AND status IN ('QUEUED', 'RUNNING', 'RETRYING')
         ORDER BY created_at DESC LIMIT 1`,
        [run.id]
      );
      if (raced.rows[0]) return raced.rows[0];
      throw error;
    }
  }

  async claimNext(workerId) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `WITH candidate AS (
           SELECT id
           FROM document_processing_jobs
           WHERE job_type = 'AGENT_RUN'
             AND status IN ('QUEUED', 'RETRYING')
             AND available_at <= CURRENT_TIMESTAMP
           ORDER BY priority DESC, available_at, created_at
           FOR UPDATE SKIP LOCKED
           LIMIT 1
         )
         UPDATE document_processing_jobs job
         SET status = 'RUNNING', attempt_count = attempt_count + 1,
             locked_at = CURRENT_TIMESTAMP, locked_by = $1,
             started_at = COALESCE(started_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
         FROM candidate
         WHERE job.id = candidate.id
         RETURNING job.*`,
        [String(workerId).slice(0, 150)]
      );
      await client.query('COMMIT');
      return rows[0] || null;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async heartbeat(jobId, workerId) {
    await this.db.query(
      `UPDATE document_processing_jobs
       SET locked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND job_type = 'AGENT_RUN' AND status = 'RUNNING' AND locked_by = $2`,
      [jobId, workerId]
    );
  }

  async complete(jobId, result = {}) {
    const { rows } = await this.db.query(
      `UPDATE document_processing_jobs
       SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP,
           locked_at = NULL, locked_by = NULL, result = $2::jsonb,
           error_code = NULL, error_message = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND job_type = 'AGENT_RUN' AND status = 'RUNNING'
       RETURNING *`,
      [jobId, JSON.stringify(result)]
    );
    return rows[0] || null;
  }

  async fail(job, error) {
    const terminal = job.attempt_count >= job.max_attempts;
    const status = terminal ? 'DEAD_LETTER' : 'RETRYING';
    const delayMs = terminal ? 0 : agentBackoffMs(job.attempt_count);
    const code = String(error.code || 'AGENT_RUN_FAILED').slice(0, 80);
    const message = documentJobs.safeErrorMessage(error.safeMessage || error.message);
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE document_processing_jobs
         SET status = $2::varchar, available_at = CURRENT_TIMESTAMP + ($3::bigint * INTERVAL '1 millisecond'),
             failed_at = CASE WHEN $2::varchar = 'DEAD_LETTER' THEN CURRENT_TIMESTAMP ELSE failed_at END,
             locked_at = NULL, locked_by = NULL, error_code = $4, error_message = $5,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'RUNNING'`,
        [job.id, status, delayMs, code, message]
      );
      await client.query(
        `UPDATE agent_runs
         SET status = $2::varchar, retry_count = retry_count + CASE WHEN $2::varchar = 'QUEUED' THEN 1 ELSE 0 END,
             failed_at = CASE WHEN $2::varchar = 'FAILED' THEN CURRENT_TIMESTAMP ELSE NULL END,
             error_code = $3, safe_error_message = $4, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status NOT IN ('CANCELLED', 'BUDGET_EXCEEDED', 'WAITING_APPROVAL', 'COMPLETED')`,
        [job.agent_run_id, terminal ? 'FAILED' : 'QUEUED', code, message]
      );
      await client.query('COMMIT');
      return { terminal, status };
    } catch (dbError) {
      await client.query('ROLLBACK');
      throw dbError;
    } finally {
      client.release();
    }
  }

  async recoverStale() {
    const staleMs = documentJobs.intEnv('AGENT_RUN_STALE_AFTER_MS', 300000);
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `UPDATE document_processing_jobs
         SET status = CASE WHEN attempt_count >= max_attempts THEN 'DEAD_LETTER' ELSE 'RETRYING' END,
             available_at = CURRENT_TIMESTAMP, locked_at = NULL, locked_by = NULL,
             failed_at = CASE WHEN attempt_count >= max_attempts THEN CURRENT_TIMESTAMP ELSE failed_at END,
             error_code = 'STALE_RUN', error_message = 'Agent worker lock expired; run recovered.',
             updated_at = CURRENT_TIMESTAMP
         WHERE job_type = 'AGENT_RUN' AND status = 'RUNNING'
           AND locked_at < CURRENT_TIMESTAMP - ($1::bigint * INTERVAL '1 millisecond')
         RETURNING *`,
        [staleMs]
      );
      for (const job of rows) {
        await client.query(
          `UPDATE agent_runs
           SET status = $2::varchar, retry_count = retry_count + CASE WHEN $2::varchar = 'QUEUED' THEN 1 ELSE 0 END,
               failed_at = CASE WHEN $2::varchar = 'FAILED' THEN CURRENT_TIMESTAMP ELSE NULL END,
               error_code = 'STALE_RUN', safe_error_message = 'Agent worker lock expired; run recovered.',
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND status = 'RUNNING'`,
          [job.agent_run_id, job.status === 'DEAD_LETTER' ? 'FAILED' : 'QUEUED']
        );
      }
      await client.query('COMMIT');
      return rows;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async cancel(runId, { db = this.db } = {}) {
    const { rows } = await db.query(
      `UPDATE document_processing_jobs
       SET status = 'CANCELLED', locked_at = NULL, locked_by = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE agent_run_id = $1 AND status IN ('QUEUED', 'RUNNING', 'RETRYING')
       RETURNING *`,
      [runId]
    );
    return rows;
  }
}

module.exports = { AgentQueueService, agentBackoffMs };
