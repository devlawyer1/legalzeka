const os = require('os');
const { pool } = require('../config/db');
const jobs = require('../services/documentJobService');
const { processJob, processingError } = require('../services/documentProcessingService');

const workerId = `${os.hostname()}:${process.pid}`.slice(0, 150);
const concurrency = jobs.intEnv('DOCUMENT_WORKER_CONCURRENCY', 2);
const pollMs = jobs.intEnv('DOCUMENT_JOB_POLL_INTERVAL_MS', 1000);
const timeoutMs = jobs.intEnv('DOCUMENT_JOB_TIMEOUT_MS', 120000);
let stopping = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runClaimedJob(job, claimedBy) {
  const heartbeatMs = Math.max(5000, Math.min(30000, Math.floor(timeoutMs / 3)));
  const heartbeat = setInterval(() => {
    jobs.heartbeat(job.id, claimedBy).catch((error) => console.error('[DocumentWorker] heartbeat:', error.message));
  }, heartbeatMs);
  heartbeat.unref();
  try {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(processingError('JOB_TIMEOUT', 'Document processing timed out.')), timeoutMs);
    });
    try {
      const result = await Promise.race([processJob(job, { lockedBy: claimedBy }), timeout]);
      await jobs.complete(job.id, result);
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    console.error(`[DocumentWorker] job ${job.id} failed:`, error.code || error.message);
    await jobs.fail(job, error);
  } finally {
    clearInterval(heartbeat);
  }
}

async function workerLoop(slot) {
  const claimedBy = `${workerId}:${slot}`.slice(0, 150);
  while (!stopping) {
    try {
      const job = await jobs.claimNext({ workerId: claimedBy });
      if (!job) {
        await sleep(pollMs);
        continue;
      }
      await runClaimedJob(job, claimedBy);
    } catch (error) {
      console.error('[DocumentWorker] loop error:', error.message);
      await sleep(pollMs);
    }
  }
}

async function main() {
  await jobs.recoverStale();
  console.log(`[DocumentWorker] started ${workerId} with concurrency=${concurrency}`);
  await Promise.all(Array.from({ length: concurrency }, (_, index) => workerLoop(index + 1)));
}

async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`[DocumentWorker] ${signal}; waiting for active jobs.`);
  setTimeout(() => pool.end().finally(() => process.exit(0)), timeoutMs + 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

main()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error('[DocumentWorker] fatal:', error);
    await pool.end();
    process.exitCode = 1;
  });
