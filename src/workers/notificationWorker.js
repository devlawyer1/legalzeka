const { pool } = require('../config/db');
const { SMTPEmailProvider } = require('../services/providers');

class NotificationWorker {
  constructor({ db = pool, provider = new SMTPEmailProvider(), maxAttempts = Number(process.env.NOTIFICATION_MAX_ATTEMPTS || 5) } = {}) {
    this.db = db; this.provider = provider; this.maxAttempts = maxAttempts;
  }

  async claim() {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `SELECT * FROM outbound_email_queue
         WHERE status IN ('QUEUED','RETRY') AND next_attempt_at<=now()
         ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1`
      );
      if (!rows[0]) { await client.query('COMMIT'); return null; }
      const updated = await client.query("UPDATE outbound_email_queue SET status='RUNNING',attempts=attempts+1 WHERE id=$1 RETURNING *", [rows[0].id]);
      await client.query('COMMIT'); return updated.rows[0];
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }

  async runOnce() {
    const job = await this.claim();
    if (!job) return null;
    try {
      const result = await this.provider.send({ to: job.to_email, subject: job.subject, body: job.body, idempotencyKey: job.idempotency_key || `notification:${job.notification_id || job.id}` });
      await this.db.query("UPDATE outbound_email_queue SET status='SENT',provider_message_id=$2,last_error=NULL WHERE id=$1", [job.id, result.providerMessageId]);
      if (job.notification_id) await this.db.query("UPDATE practice_notifications SET status='SENT',sent_at=now(),delivered_at=now(),attempt_count=$2,provider_error=NULL WHERE id=$1", [job.notification_id, job.attempts]);
      return { id: job.id, status: 'SENT' };
    } catch (error) {
      const dead = job.attempts >= this.maxAttempts;
      const delaySeconds = Math.min(30 * (2 ** Math.max(job.attempts - 1, 0)), 3600);
      await this.db.query(
        `UPDATE outbound_email_queue SET status=$2::varchar,last_error=$3,next_attempt_at=now()+($4::int*interval '1 second') WHERE id=$1`,
        [job.id, dead ? 'DEAD_LETTER' : 'RETRY', String(error.code || error.message).slice(0, 500), delaySeconds]
      );
      if (job.notification_id) await this.db.query(
        `UPDATE practice_notifications SET status=$2::varchar,attempt_count=$3,provider_error=$4,
         next_attempt_at=now()+($5::int*interval '1 second'),dead_lettered_at=CASE WHEN $2::text='DEAD_LETTER' THEN now() ELSE dead_lettered_at END WHERE id=$1`,
        [job.notification_id, dead ? 'DEAD_LETTER' : 'RETRY', job.attempts, String(error.code || error.message).slice(0, 500), delaySeconds]
      );
      return { id: job.id, status: dead ? 'DEAD_LETTER' : 'RETRY', code: error.code || 'PROVIDER_UNAVAILABLE' };
    }
  }
}

async function main() {
  const worker = new NotificationWorker(); let stopping = false;
  const stop = () => { stopping = true; };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  while (!stopping) {
    const result = await worker.runOnce().catch((error) => { console.error(JSON.stringify({ level: 'error', event: 'notification_worker_failed', code: error.code, message: error.message })); return null; });
    if (!result) await new Promise((resolve) => setTimeout(resolve, Number(process.env.NOTIFICATION_POLL_INTERVAL_MS || 1000)));
  }
  await pool.end();
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = { NotificationWorker };
