const { pool } = require('../../config/db');
const AuditLogService = require('../AuditLogService');
const jobs = require('../documentJobService');
const { MatterExtractor, extractionError } = require('./matterExtractor');

function extractionConfig() {
  const provider = String(process.env.LLM_PROVIDER || 'ollama').toLowerCase();
  const models = {
    openai: process.env.OPENAI_MODEL || 'gpt-4o',
    claude: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
    gemini: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    bedrock: process.env.BEDROCK_MODEL || 'anthropic.claude-3-haiku-20240307-v1:0',
    ollama: process.env.OLLAMA_MODEL || 'emsal_atlasi',
  };
  return { provider, model: models[provider] || models.ollama, version: Number(process.env.EXTRACTION_VERSION || 1) };
}

async function queueExtraction({ db = pool, document }) {
  const config = extractionConfig();
  const organizationId = document.scope_type === 'ORGANIZATION' ? document.case_law_firm_id || document.law_firm_id : null;
  const ownerUserId = document.scope_type === 'PERSONAL' ? document.case_owner_user_id || document.owner_user_id : null;
  const { rows } = await db.query(
    `INSERT INTO extraction_runs (
       document_id, case_id, organization_id, owner_user_id, status,
       extraction_version, provider, model
     ) VALUES ($1, $2, $3, $4, 'QUEUED', $5, $6, $7)
     ON CONFLICT (document_id, extraction_version)
     DO UPDATE SET document_id = EXCLUDED.document_id
     RETURNING *`,
    [document.id, document.case_id, organizationId, ownerUserId, config.version, config.provider, config.model]
  );
  const run = rows[0];
  const job = await jobs.enqueue({
    db,
    document: {
      ...document,
      law_firm_id: organizationId,
      owner_user_id: ownerUserId,
    },
    jobType: 'EXTRACT_MATTER_DATA',
    priority: -10,
    idempotencyKey: `EXTRACT_MATTER_DATA:${document.id}:${config.version}`,
    payload: { extractionRunId: run.id, extractionVersion: config.version },
  });
  return { run, job };
}

async function loadExtraction(job, db = pool) {
  const runId = job.payload?.extractionRunId;
  const { rows } = await db.query(
    `SELECT er.*, cd.deleted_at, c.scope_type,
            c.owner_user_id AS case_owner_user_id, c.law_firm_id AS case_law_firm_id
     FROM extraction_runs er
     JOIN case_documents cd ON cd.id = er.document_id AND cd.case_id = er.case_id
     JOIN cases c ON c.id = er.case_id
     WHERE er.id = $1 AND er.document_id = $2 AND er.case_id = $3`,
    [runId, job.document_id, job.case_id]
  );
  const run = rows[0];
  if (!run) throw extractionError('EXTRACTION_RUN_NOT_FOUND', 'Extraction run was not found.');
  const scopeMatches = run.scope_type === 'PERSONAL'
    ? !job.organization_id && job.owner_user_id === run.case_owner_user_id && run.owner_user_id === run.case_owner_user_id
    : !job.owner_user_id && job.organization_id === run.case_law_firm_id && run.organization_id === run.case_law_firm_id;
  if (!scopeMatches) throw extractionError('SCOPE_MISMATCH', 'Extraction job scope validation failed.');
  return run;
}

async function processExtractionJob(job, { db = pool, matterExtractor = new MatterExtractor(), lockedBy = null } = {}) {
  const run = await loadExtraction(job, db);
  if (run.status === 'COMPLETED') return { alreadyCompleted: true, extractionRunId: run.id };
  if (run.deleted_at) {
    await db.query("UPDATE extraction_runs SET status = 'CANCELLED' WHERE id = $1", [run.id]);
    return { skipped: true, reason: 'deleted', extractionRunId: run.id };
  }
  const pageResult = await db.query(
    `SELECT * FROM document_pages WHERE document_id = $1 AND case_id = $2 ORDER BY page_number`,
    [run.document_id, run.case_id]
  );
  if (!pageResult.rows.some((page) => page.extracted_text.trim())) {
    throw extractionError('NO_DOCUMENT_TEXT', 'No document text is available for extraction.');
  }

  const startedAt = Date.now();
  await db.query(
    `UPDATE extraction_runs SET status = 'RUNNING', started_at = CURRENT_TIMESTAMP,
     failed_at = NULL, error_code = NULL, safe_error_message = NULL WHERE id = $1`,
    [run.id]
  );
  await AuditLogService.record({
    action: 'EXTRACTION_STARTED', entityType: 'EXTRACTION_RUN', entityId: run.id,
    caseId: run.case_id, documentId: run.document_id, lawFirmId: run.organization_id,
    metadata: { jobId: job.id, provider: run.provider, model: run.model, attemptNumber: job.attempt_count },
  });

  const result = await matterExtractor.extract(pageResult.rows);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const lease = await client.query(
      `SELECT 1 FROM document_processing_jobs
       WHERE id = $1 AND status = 'RUNNING' AND ($2::text IS NULL OR locked_by = $2)`,
      [job.id, lockedBy]
    );
    if (!lease.rows.length) {
      await client.query('ROLLBACK');
      return { skipped: true, reason: 'lease-lost', extractionRunId: run.id };
    }
    for (const suggestion of result.suggestions) {
      await client.query(
        `INSERT INTO extraction_suggestions (
           extraction_run_id, document_id, case_id, suggestion_type, normalized_value,
           display_value, source_page, source_quote, confidence, suggestion_fingerprint
         ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10)
         ON CONFLICT (extraction_run_id, suggestion_fingerprint) DO NOTHING`,
        [run.id, run.document_id, run.case_id, suggestion.type, JSON.stringify(suggestion.normalizedValue),
          suggestion.displayValue, suggestion.sourcePage, suggestion.sourceQuote, suggestion.confidence, suggestion.fingerprint]
      );
    }
    await client.query(
      `UPDATE extraction_runs
       SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP, failed_at = NULL,
           provider = $2, model = $3, input_tokens = $4, output_tokens = $5,
           estimated_cost = $6, duration_ms = $7, error_code = NULL, safe_error_message = NULL
       WHERE id = $1`,
      [run.id, result.usage.provider || run.provider, result.usage.model || run.model,
        result.usage.inputTokens, result.usage.outputTokens, result.usage.estimatedCost, Date.now() - startedAt]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await AuditLogService.record({
    action: 'EXTRACTION_COMPLETED', entityType: 'EXTRACTION_RUN', entityId: run.id,
    caseId: run.case_id, documentId: run.document_id, lawFirmId: run.organization_id,
    metadata: {
      jobId: job.id, provider: result.usage.provider, model: result.usage.model,
      inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens,
      estimatedCost: result.usage.estimatedCost, durationMs: Date.now() - startedAt,
      suggestionCount: result.suggestions.length,
    },
  });
  return { extractionRunId: run.id, suggestionCount: result.suggestions.length, ...result.usage };
}

module.exports = { extractionConfig, loadExtraction, processExtractionJob, queueExtraction };
