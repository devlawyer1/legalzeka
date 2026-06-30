const crypto = require('crypto');
const { pool } = require('../config/db');
const AuditLogService = require('./AuditLogService');

const ACTIVE_STATUSES = ['QUEUED', 'RUNNING', 'RETRYING'];

function intEnv(name, fallback) {
  const parsed = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function maxAttempts() {
  return intEnv('DOCUMENT_JOB_MAX_ATTEMPTS', 3);
}

function backoffSchedule() {
  const values = String(process.env.DOCUMENT_JOB_BACKOFF_MS || '30000,120000,600000')
    .split(',')
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isFinite(value) && value >= 0);
  return values.length ? values : [30000, 120000, 600000];
}

function getBackoffMs(attemptCount) {
  const schedule = backoffSchedule();
  return schedule[Math.min(Math.max(attemptCount - 1, 0), schedule.length - 1)];
}

function safeErrorMessage(message) {
  return String(message || 'Document processing failed.')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/(?:[A-Za-z]:)?[\\/][^ ]+/g, '[path]')
    .slice(0, 500);
}

function scopeForDocument(document) {
  if (document.scope_type === 'PERSONAL') {
    return { organizationId: null, ownerUserId: document.owner_user_id };
  }
  return { organizationId: document.law_firm_id || document.firm_id, ownerUserId: null };
}

async function enqueue({
  db = pool,
  document,
  jobType = 'PROCESS_DOCUMENT',
  idempotencyKey,
  parentJobId = null,
  payload = {},
  priority = 0,
}) {
  const scope = scopeForDocument(document);
  const key = idempotencyKey || `${jobType}:${document.id}:${document.processing_version || 1}`;
  const { rows } = await db.query(
    `INSERT INTO document_processing_jobs (
       parent_job_id, document_id, case_id, organization_id, owner_user_id,
       job_type, status, priority, max_attempts, idempotency_key, payload
     ) VALUES ($1, $2, $3, $4, $5, $6, 'QUEUED', $7, $8, $9, $10::jsonb)
     ON CONFLICT (idempotency_key)
     DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
     RETURNING *`,
    [
      parentJobId,
      document.id,
      document.case_id,
      scope.organizationId,
      scope.ownerUserId,
      jobType,
      priority,
      maxAttempts(),
      key,
      JSON.stringify({ processingVersion: document.processing_version || 1, ...(payload || {}) }),
    ]
  );
  if (rows[0].document_id !== document.id || rows[0].job_type !== jobType) {
    const error = new Error('Idempotency key belongs to a different document job.');
    error.code = 'IDEMPOTENCY_KEY_CONFLICT';
    throw error;
  }
  return rows[0];
}

async function recoverStale({ db = pool } = {}) {
  const staleMs = intEnv('DOCUMENT_JOB_STALE_AFTER_MS', 300000);
  const { rows } = await db.query(
    `UPDATE document_processing_jobs
     SET status = CASE WHEN attempt_count >= max_attempts THEN 'DEAD_LETTER' ELSE 'RETRYING' END,
         available_at = CURRENT_TIMESTAMP,
         failed_at = CASE WHEN attempt_count >= max_attempts THEN CURRENT_TIMESTAMP ELSE failed_at END,
         locked_at = NULL,
         locked_by = NULL,
         error_code = 'STALE_JOB',
         error_message = 'Worker lock expired; job recovered.',
         updated_at = CURRENT_TIMESTAMP
     WHERE status = 'RUNNING'
       AND job_type <> 'AGENT_RUN'
       AND locked_at < CURRENT_TIMESTAMP - ($1::bigint * INTERVAL '1 millisecond')
     RETURNING *`,
    [staleMs]
  );
  const processJobs = rows.filter((job) => job.job_type === 'PROCESS_DOCUMENT');
  const retryIds = processJobs.filter((job) => job.status === 'RETRYING').map((job) => job.document_id);
  const deadIds = processJobs.filter((job) => job.status === 'DEAD_LETTER').map((job) => job.document_id);
  if (retryIds.length || deadIds.length) {
    await db.query(
      `UPDATE case_documents
       SET processing_status = CASE WHEN id = ANY($2::uuid[]) THEN 'FAILED' ELSE 'QUEUED' END,
           processing_failed_at = CASE WHEN id = ANY($2::uuid[]) THEN CURRENT_TIMESTAMP ELSE NULL END,
           processing_error_code = 'STALE_JOB',
           processing_error_message = 'Worker lock expired; processing will be recovered.'
       WHERE id = ANY($1::uuid[]) OR id = ANY($2::uuid[])`,
      [retryIds, deadIds]
    );
  }
  for (const job of rows.filter((item) => item.job_type === 'EXTRACT_MATTER_DATA')) {
    const runId = job.payload?.extractionRunId;
    if (!runId) continue;
    await db.query(
      `UPDATE extraction_runs
       SET status = $2::varchar, failed_at = CASE WHEN $2::varchar = 'FAILED' THEN CURRENT_TIMESTAMP ELSE NULL END,
           error_code = 'STALE_JOB', safe_error_message = 'Worker lock expired; extraction will be recovered.'
       WHERE id = $1`,
      [runId, job.status === 'DEAD_LETTER' ? 'FAILED' : 'QUEUED']
    );
  }
  return rows;
}

async function claimNext({ db = pool, workerId }) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `WITH candidate AS (
         SELECT id
         FROM document_processing_jobs
         WHERE status IN ('QUEUED', 'RETRYING')
           AND job_type <> 'AGENT_RUN'
           AND available_at <= CURRENT_TIMESTAMP
         ORDER BY priority DESC, available_at ASC, created_at ASC
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       UPDATE document_processing_jobs job
       SET status = 'RUNNING',
           attempt_count = attempt_count + 1,
           locked_at = CURRENT_TIMESTAMP,
           locked_by = $1,
           started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
           updated_at = CURRENT_TIMESTAMP
       FROM candidate
       WHERE job.id = candidate.id
       RETURNING job.*`,
      [String(workerId || 'document-worker').slice(0, 150)]
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

async function heartbeat(jobId, workerId, { db = pool } = {}) {
  await db.query(
    `UPDATE document_processing_jobs
     SET locked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND status = 'RUNNING' AND locked_by = $2`,
    [jobId, workerId]
  );
}

async function complete(jobId, result = {}, { db = pool } = {}) {
  const { rows } = await db.query(
    `UPDATE document_processing_jobs
     SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP,
         locked_at = NULL, locked_by = NULL, result = $2::jsonb,
         error_code = NULL, error_message = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND status = 'RUNNING'
     RETURNING *`,
    [jobId, JSON.stringify(result || {})]
  );
  return rows[0] || null;
}

async function fail(job, error, { db = pool } = {}) {
  const terminal = job.attempt_count >= job.max_attempts;
  const status = terminal ? 'DEAD_LETTER' : 'RETRYING';
  const delayMs = terminal ? 0 : getBackoffMs(job.attempt_count);
  const code = String(error.code || 'UNKNOWN_ERROR').slice(0, 80);
  const message = safeErrorMessage(error.safeMessage || error.message);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE document_processing_jobs
       SET status = $2::varchar,
           available_at = CURRENT_TIMESTAMP + ($3::bigint * INTERVAL '1 millisecond'),
           failed_at = CASE WHEN $2::varchar = 'DEAD_LETTER' THEN CURRENT_TIMESTAMP ELSE failed_at END,
           locked_at = NULL, locked_by = NULL,
           error_code = $4, error_message = $5, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'RUNNING'
       RETURNING *`,
      [job.id, status, delayMs, code, message]
    );
    if (job.job_type === 'PROCESS_DOCUMENT') {
      await client.query(
        `UPDATE case_documents
         SET processing_status = $2::varchar, processing_attempts = $3,
             processing_failed_at = CASE WHEN $2::varchar = 'FAILED' THEN CURRENT_TIMESTAMP ELSE NULL END,
             processing_error_code = $4, processing_error_message = $5
         WHERE id = $1 AND deleted_at IS NULL`,
        [job.document_id, terminal ? 'FAILED' : 'QUEUED', job.attempt_count, code, message]
      );
    } else if (job.job_type === 'EXTRACT_MATTER_DATA' && job.payload?.extractionRunId) {
      await client.query(
        `UPDATE extraction_runs
         SET status = $2::varchar,
             failed_at = CASE WHEN $2::varchar = 'FAILED' THEN CURRENT_TIMESTAMP ELSE NULL END,
             error_code = $3, safe_error_message = $4,
             input_tokens = input_tokens + $5,
             output_tokens = output_tokens + $6,
             estimated_cost = estimated_cost + $7,
             duration_ms = CASE WHEN started_at IS NULL THEN duration_ms
               ELSE GREATEST(0, (EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - started_at)) * 1000)::int) END
         WHERE id = $1`,
        [job.payload.extractionRunId, terminal ? 'FAILED' : 'QUEUED', code, message,
          Number(error.usage?.inputTokens || 0), Number(error.usage?.outputTokens || 0), Number(error.usage?.estimatedCost || 0)]
      );
    }
    await client.query('COMMIT');
    await AuditLogService.record({
      action: job.job_type === 'EXTRACT_MATTER_DATA' ? 'EXTRACTION_FAILED' : 'DOCUMENT_PROCESSING_FAILED',
      entityType: 'CASE_DOCUMENT',
      entityId: job.document_id,
      caseId: job.case_id,
      documentId: job.document_id,
      lawFirmId: job.organization_id,
      metadata: {
        jobId: job.id, errorCode: code, attemptNumber: job.attempt_count, terminal,
        inputTokens: Number(error.usage?.inputTokens || 0),
        outputTokens: Number(error.usage?.outputTokens || 0),
        estimatedCost: Number(error.usage?.estimatedCost || 0),
      },
    });
    return rows[0] || null;
  } catch (dbError) {
    await client.query('ROLLBACK');
    throw dbError;
  } finally {
    client.release();
  }
}

async function cancelActive(documentId, { db = pool } = {}) {
  const { rows } = await db.query(
    `UPDATE document_processing_jobs
     SET status = 'CANCELLED', locked_at = NULL, locked_by = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE document_id = $1 AND status = ANY($2::text[])
     RETURNING *`,
    [documentId, ACTIVE_STATUSES]
  );
  return rows;
}

async function latestForDocument(documentId, { db = pool } = {}) {
  const { rows } = await db.query(
    `SELECT * FROM document_processing_jobs
     WHERE document_id = $1
     ORDER BY created_at DESC LIMIT 1`,
    [documentId]
  );
  return rows[0] || null;
}

async function retry(document, previousJob, { db = pool } = {}) {
  return enqueue({
    db,
    document,
    jobType: 'PROCESS_DOCUMENT',
    parentJobId: previousJob?.id || null,
    idempotencyKey: `PROCESS_DOCUMENT:${document.id}:retry:${crypto.randomUUID()}`,
    payload: { retryOf: previousJob?.id || null },
  });
}

module.exports = {
  ACTIVE_STATUSES,
  cancelActive,
  claimNext,
  complete,
  enqueue,
  fail,
  getBackoffMs,
  heartbeat,
  intEnv,
  latestForDocument,
  recoverStale,
  retry,
  safeErrorMessage,
};
