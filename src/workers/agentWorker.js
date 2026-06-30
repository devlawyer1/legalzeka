const os = require('node:os');
const { pool } = require('../config/db');
const AuditLogService = require('../services/AuditLogService');
const { AgentProposalService } = require('../services/agents/AgentProposalService');
const { AgentQueueService } = require('../services/agents/AgentQueueService');
const { AgentRunner } = require('../services/agents/AgentRunner');
const { AgentScheduleService } = require('../services/agents/AgentScheduleService');
const { intEnv } = require('../services/documentJobService');

const workerId = `${os.hostname()}:${process.pid}`.slice(0, 120);
const concurrency = intEnv('AGENT_WORKER_CONCURRENCY', 2);
const pollMs = intEnv('AGENT_JOB_POLL_INTERVAL_MS', 1000);
const heartbeatMs = intEnv('AGENT_JOB_HEARTBEAT_MS', 15000);
const maintenanceMs = intEnv('AGENT_MAINTENANCE_INTERVAL_MS', 30000);
const queue = new AgentQueueService({ db: pool });
const runner = new AgentRunner({ db: pool });
const schedules = new AgentScheduleService({ db: pool });
const proposals = new AgentProposalService({ db: pool });
let stopping = false;
let maintenanceTimer = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processJob(job, claimedBy) {
  const heartbeat = setInterval(() => {
    queue.heartbeat(job.id, claimedBy).catch((error) => console.error('[AgentWorker] heartbeat:', error.message));
  }, heartbeatMs);
  heartbeat.unref();
  try {
    const result = await runner.run(job.agent_run_id);
    await queue.complete(job.id, { status: result.status || 'COMPLETED' });
  } catch (error) {
    console.error(`[AgentWorker] run ${job.agent_run_id} failed:`, error.code || error.message);
    const failure = await queue.fail(job, error);
    if (failure.terminal) {
      const run = await pool.query('SELECT * FROM agent_runs WHERE id = $1', [job.agent_run_id]);
      if (run.rows[0]) {
        await AuditLogService.record({
          action: 'AGENT_RUN_FAILED', entityType: 'AGENT_RUN', entityId: run.rows[0].id,
          lawFirmId: run.rows[0].organization_id, caseId: run.rows[0].case_id,
          metadata: {
            workflowId: run.rows[0].workflow_id,
            workflowVersionId: run.rows[0].workflow_version_id,
            errorCode: String(error.code || 'AGENT_RUN_FAILED').slice(0, 80),
            retryCount: run.rows[0].retry_count,
          },
        });
      }
    }
  } finally {
    clearInterval(heartbeat);
  }
}

async function workerLoop(slot) {
  const claimedBy = `${workerId}:${slot}`.slice(0, 150);
  while (!stopping) {
    try {
      const job = await queue.claimNext(claimedBy);
      if (!job) {
        await sleep(pollMs);
        continue;
      }
      await processJob(job, claimedBy);
    } catch (error) {
      console.error('[AgentWorker] loop:', error.message);
      await sleep(pollMs);
    }
  }
}

async function maintenance() {
  try {
    await queue.recoverStale();
    await proposals.expirePending();
    await schedules.runDue();
    await schedules.triggerOperationalEvents();
  } catch (error) {
    console.error('[AgentWorker] maintenance:', error.message);
  }
}

async function main() {
  await maintenance();
  maintenanceTimer = setInterval(maintenance, maintenanceMs);
  maintenanceTimer.unref();
  console.log(`[AgentWorker] started ${workerId} with concurrency=${concurrency}`);
  await Promise.all(Array.from({ length: concurrency }, (_, index) => workerLoop(index + 1)));
}

async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  if (maintenanceTimer) clearInterval(maintenanceTimer);
  console.log(`[AgentWorker] ${signal}; waiting for active runs.`);
  setTimeout(() => pool.end().finally(() => process.exit(0)), 65000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

main()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error('[AgentWorker] fatal:', error);
    await pool.end();
    process.exitCode = 1;
  });
