const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const { getTestDatabaseUrl } = require('../helpers/testDatabase');

const databaseUrl = getTestDatabaseUrl();
const uploadDir = path.join(process.cwd(), 'test-document-pipeline-uploads');
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = databaseUrl;
process.env.JWT_SECRET = 'phase1b-integration-only-secret';
process.env.LOCAL_UPLOAD_DIR = uploadDir;
process.env.FILE_SCANNER_PROVIDER = 'noop';
process.env.DOCUMENT_JOB_BACKOFF_MS = '0,0,0';
process.env.DOCUMENT_MAX_FILE_SIZE_BYTES = '1024';
process.env.OCR_NATIVE_TEXT_MIN_CHARS = '5';

const { migrate } = require('../../src/utils/migrate');
const { pool: appPool } = require('../../src/config/db');
const { storage } = require('../../src/services/storage');
const jobs = require('../../src/services/documentJobService');
const { processJob } = require('../../src/services/documentProcessingService');
const app = require('../../src/app');

const fakeOcrProvider = {
  async recognize(input, { pageNumber }) {
    return { text: `OCR sayfa ${pageNumber} metni`, pageNumber, confidence: 0.42, language: 'tur', durationMs: 5 };
  },
};

const adminPool = new Pool({ connectionString: databaseUrl });
const silentLogger = { log() {} };

async function seedUser(roleId) {
  const id = crypto.randomUUID();
  await adminPool.query(
    `INSERT INTO users (id, role_id, first_name, last_name, email, password_hash, is_active)
     VALUES ($1, $2, 'Pipeline', 'User', $3, 'unused', true)`,
    [id, roleId, `${id}@example.test`]
  );
  return id;
}

async function seedFirm(ownerId, userId, name) {
  const id = crypto.randomUUID();
  await adminPool.query('INSERT INTO law_firms (id, name, owner_id, is_active) VALUES ($1, $2, $3, true)', [id, name, ownerId]);
  await adminPool.query(
    `INSERT INTO firm_users (firm_id, user_id, firm_role, is_active)
     VALUES ($1, $2, 'kurucu', true)`,
    [id, userId]
  );
  return id;
}

async function seedCase({ ownerUserId = null, firmId = null, topic }) {
  const id = crypto.randomUUID();
  if (ownerUserId) {
    await adminPool.query(
      `INSERT INTO cases (id, scope_type, owner_user_id, firm_id, law_firm_id, konu, is_active)
       VALUES ($1, 'PERSONAL', $2, NULL, NULL, $3, true)`,
      [id, ownerUserId, topic]
    );
  } else {
    await adminPool.query(
      `INSERT INTO cases (id, scope_type, owner_user_id, firm_id, law_firm_id, konu, is_active)
       VALUES ($1, 'ORGANIZATION', NULL, $2, $2, $3, true)`,
      [id, firmId, topic]
    );
  }
  return id;
}

function token(userId) {
  return jwt.sign({ userId, email: `${userId}@example.test`, role: 'Users' }, process.env.JWT_SECRET);
}

async function api(baseUrl, endpoint, { auth, method = 'GET', body } = {}) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers: auth ? { Authorization: `Bearer ${auth}` } : {},
    body,
  });
  const data = await response.json();
  return { response, data };
}

function uploadBody(bytes, filename, type) {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type }), filename);
  form.append('documentType', 'Delil Belgesi');
  return form;
}

function minimalPdf(text = 'Phase 1B PDF') {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${text.length + 35} >>\nstream\nBT /F1 12 Tf 72 720 Td (${text}) Tj ET\nendstream`,
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, 'ascii'));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(body, 'ascii');
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { body += `${String(offset).padStart(10, '0')} 00000 n \n`; });
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, 'ascii');
}

async function runClaim(workerId) {
  const job = await jobs.claimNext({ workerId });
  assert.ok(job);
  try {
    const result = await processJob(job, { lockedBy: workerId, ocrProvider: fakeOcrProvider });
    await jobs.complete(job.id, result);
  } catch (error) {
    await jobs.fail(job, error);
  }
  return job;
}

test('Phase 1B secure upload, queue, worker and deletion pipeline', async (t) => {
  let server;
  t.after(async () => {
    await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
    await appPool.end();
    await adminPool.end();
    fs.rmSync(uploadDir, { recursive: true, force: true });
  });

  await adminPool.query('DROP SCHEMA IF EXISTS public CASCADE');
  await adminPool.query('CREATE SCHEMA public');
  await migrate({ dbPool: adminPool, logger: silentLogger });

  const role = await adminPool.query("SELECT id FROM roles WHERE role_name = 'Users'");
  const userA = await seedUser(role.rows[0].id);
  const userB = await seedUser(role.rows[0].id);
  const firmA = await seedFirm(userA, userA, 'Pipeline Firm A');
  const firmB = await seedFirm(userB, userB, 'Pipeline Firm B');
  const organizationCase = await seedCase({ firmId: firmA, topic: 'Organization pipeline' });
  const personalCase = await seedCase({ ownerUserId: userA, topic: 'Personal pipeline' });
  const foreignCase = await seedCase({ firmId: firmB, topic: 'Foreign pipeline' });

  server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  const authA = token(userA);
  const authB = token(userB);

  await t.test('valid TXT is accepted and metadata/job are committed together', async () => {
    const uploaded = await api(baseUrl, `/cases/${organizationCase}/documents`, {
      auth: authA,
      method: 'POST',
      body: uploadBody('Dava delili ve gecmis olaylar.', 'evidence.txt', 'text/plain'),
    });
    assert.equal(uploaded.response.status, 202);
    assert.equal(uploaded.data.document.processingStatus, 'QUEUED');
    assert.equal(uploaded.data.job.status, 'QUEUED');
    assert.equal(uploaded.data.document.detectedMimeType, 'text/plain');
    assert.equal(uploaded.data.document.sha256Hash.length, 64);
    assert.equal(await storage.exists(uploaded.data.data.storage_key), true);

    const counts = await adminPool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM case_documents WHERE id = $1) AS documents,
         (SELECT COUNT(*)::int FROM document_processing_jobs WHERE document_id = $1) AS jobs`,
      [uploaded.data.document.id]
    );
    assert.deepEqual(counts.rows[0], { documents: 1, jobs: 1 });

    const claimed = await Promise.all([
      jobs.claimNext({ workerId: 'race-worker-a' }),
      jobs.claimNext({ workerId: 'race-worker-b' }),
    ]);
    assert.equal(claimed.filter(Boolean).length, 1);
    const job = claimed.find(Boolean);
    const result = await processJob(job, { lockedBy: job.locked_by });
    await jobs.complete(job.id, result);

    const status = await api(baseUrl, `/cases/${organizationCase}/documents/${uploaded.data.document.id}/status`, { auth: authA });
    assert.equal(status.response.status, 200);
    assert.equal(status.data.data.status, 'COMPLETED');
    assert.equal(status.data.data.textExtracted, true);
    assert.equal(status.data.data.pageCount, 1);

    const duplicateJob = await jobs.enqueue({
      document: {
        ...uploaded.data.data,
        scope_type: 'ORGANIZATION',
        law_firm_id: firmA,
        owner_user_id: null,
      },
      idempotencyKey: `idempotency-check:${crypto.randomUUID()}`,
    });
    const duplicateClaim = await jobs.claimNext({ workerId: 'idempotency-worker' });
    assert.equal(duplicateClaim.id, duplicateJob.id);
    const duplicateResult = await processJob(duplicateClaim, { lockedBy: 'idempotency-worker' });
    assert.equal(duplicateResult.alreadyCompleted, true);
    await jobs.complete(duplicateClaim.id, duplicateResult);

  });

  await t.test('fake MIME, empty and double-extension files are rejected without metadata rows', async () => {
    const before = await adminPool.query('SELECT COUNT(*)::int AS count FROM case_documents');
    const fakePdf = await api(baseUrl, `/cases/${organizationCase}/documents`, {
      auth: authA,
      method: 'POST',
      body: uploadBody('not a pdf', 'fake.pdf', 'application/pdf'),
    });
    assert.equal(fakePdf.response.status, 415);

    const empty = await api(baseUrl, `/cases/${organizationCase}/documents`, {
      auth: authA,
      method: 'POST',
      body: uploadBody('', 'empty.txt', 'text/plain'),
    });
    assert.equal(empty.response.status, 400);

    const doubleExtension = await api(baseUrl, `/cases/${organizationCase}/documents`, {
      auth: authA,
      method: 'POST',
      body: uploadBody('text', 'order.pdf.txt', 'text/plain'),
    });
    assert.equal(doubleExtension.response.status, 415);

    const tooLarge = await api(baseUrl, `/cases/${organizationCase}/documents`, {
      auth: authA,
      method: 'POST',
      body: uploadBody('x'.repeat(2048), 'large.txt', 'text/plain'),
    });
    assert.equal(tooLarge.response.status, 413);
    const after = await adminPool.query('SELECT COUNT(*)::int AS count FROM case_documents');
    assert.equal(after.rows[0].count, before.rows[0].count);
  });

  await t.test('tenant checks happen before upload and personal matters are supported', async () => {
    const denied = await api(baseUrl, `/cases/${foreignCase}/documents`, {
      auth: authA,
      method: 'POST',
      body: uploadBody('foreign', 'foreign.txt', 'text/plain'),
    });
    assert.equal(denied.response.status, 404);

    const personal = await api(baseUrl, `/cases/${personalCase}/documents`, {
      auth: authA,
      method: 'POST',
      body: uploadBody('personal matter', 'personal.txt', 'text/plain'),
    });
    assert.equal(personal.response.status, 202);
    const scope = await adminPool.query(
      'SELECT organization_id, owner_user_id FROM document_processing_jobs WHERE id = $1',
      [personal.data.job.id]
    );
    assert.equal(scope.rows[0].organization_id, null);
    assert.equal(scope.rows[0].owner_user_id, userA);
    assert.equal((await api(baseUrl, `/cases/${personalCase}/documents`, { auth: authB })).response.status, 404);

    await adminPool.query(
      `UPDATE document_processing_jobs
       SET status = 'RUNNING', attempt_count = 1, locked_at = CURRENT_TIMESTAMP - INTERVAL '1 hour', locked_by = 'crashed-worker'
       WHERE id = $1`,
      [personal.data.job.id]
    );
    const recovered = await jobs.recoverStale();
    assert.equal(recovered.some((job) => job.id === personal.data.job.id && job.status === 'RETRYING'), true);
    await runClaim('recovery-worker');
  });

  await t.test('valid PDF completes and forged tenant scope is rejected by the worker', async () => {
    const uploaded = await api(baseUrl, `/cases/${organizationCase}/documents`, {
      auth: authA,
      method: 'POST',
      body: uploadBody(minimalPdf(), 'valid.pdf', 'application/pdf'),
    });
    assert.equal(uploaded.response.status, 202);
    await runClaim('pdf-success-worker');
    const status = await api(baseUrl, `/cases/${organizationCase}/documents/${uploaded.data.document.id}/status`, { auth: authA });
    assert.equal(status.data.data.processingStatus, 'COMPLETED');
    assert.equal(status.data.data.textExtracted, true);

    const forged = await jobs.enqueue({
      document: {
        ...uploaded.data.data,
        scope_type: 'ORGANIZATION',
        law_firm_id: firmB,
        owner_user_id: null,
      },
      idempotencyKey: `forged-scope:${crypto.randomUUID()}`,
    });
    const claimed = await jobs.claimNext({ workerId: 'scope-worker' });
    assert.equal(claimed.id, forged.id);
    await assert.rejects(processJob(claimed, { lockedBy: 'scope-worker' }), (error) => error.code === 'SCOPE_MISMATCH');
    await jobs.cancelActive(uploaded.data.document.id);
  });

  await t.test('storage and database failures do not leave orphan records or files', async () => {
    const beforeRows = await adminPool.query('SELECT COUNT(*)::int AS count FROM case_documents');
    const beforeFiles = fs.readdirSync(uploadDir).filter((name) => name !== '.tmp').sort();
    const dbFailure = await api(baseUrl, `/cases/${organizationCase}/documents`, {
      auth: authA,
      method: 'POST',
      body: (() => {
        const form = uploadBody('db rollback content', 'rollback.txt', 'text/plain');
        form.set('documentType', 'x'.repeat(1000));
        return form;
      })(),
    });
    assert.equal(dbFailure.response.status, 500);
    const afterDbRows = await adminPool.query('SELECT COUNT(*)::int AS count FROM case_documents');
    const afterDbFiles = fs.readdirSync(uploadDir).filter((name) => name !== '.tmp').sort();
    assert.equal(afterDbRows.rows[0].count, beforeRows.rows[0].count);
    assert.deepEqual(afterDbFiles, beforeFiles);

    const originalStore = storage.store.bind(storage);
    storage.store = async () => {
      const error = new Error('simulated storage failure');
      error.code = 'STORAGE_ERROR';
      throw error;
    };
    try {
      const storageFailure = await api(baseUrl, `/cases/${organizationCase}/documents`, {
        auth: authA,
        method: 'POST',
        body: uploadBody('storage rollback content', 'storage.txt', 'text/plain'),
      });
      assert.equal(storageFailure.response.status, 500);
    } finally {
      storage.store = originalStore;
    }
    const afterStorageRows = await adminPool.query('SELECT COUNT(*)::int AS count FROM case_documents');
    assert.equal(afterStorageRows.rows[0].count, beforeRows.rows[0].count);
  });

  await t.test('images are processed through OCR and retain OCR-required metadata', async () => {
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from('phase1b-image-placeholder'),
    ]);
    const uploaded = await api(baseUrl, `/cases/${organizationCase}/documents`, {
      auth: authA,
      method: 'POST',
      body: uploadBody(png, 'scan.png', 'image/png'),
    });
    assert.equal(uploaded.response.status, 202);
    await runClaim('image-worker');
    const status = await api(baseUrl, `/cases/${organizationCase}/documents/${uploaded.data.document.id}/status`, { auth: authA });
    assert.equal(status.data.data.ocrRequired, true);
    assert.equal(status.data.data.textExtracted, true);
  });

  await t.test('corrupt PDF reaches dead letter and can be manually retried', async () => {
    const uploaded = await api(baseUrl, `/cases/${organizationCase}/documents`, {
      auth: authA,
      method: 'POST',
      body: uploadBody('%PDF-1.4\ncorrupt', 'corrupt.pdf', 'application/pdf'),
    });
    assert.equal(uploaded.response.status, 202);
    for (let attempt = 0; attempt < 3; attempt += 1) await runClaim(`pdf-worker-${attempt}`);
    const failed = await jobs.latestForDocument(uploaded.data.document.id);
    assert.equal(failed.status, 'DEAD_LETTER');
    const row = await adminPool.query('SELECT processing_status FROM case_documents WHERE id = $1', [uploaded.data.document.id]);
    assert.equal(row.rows[0].processing_status, 'FAILED');

    const retry = await api(baseUrl, `/cases/${organizationCase}/documents/${uploaded.data.document.id}/retry`, {
      auth: authA,
      method: 'POST',
    });
    assert.equal(retry.response.status, 202);
    const retried = await adminPool.query('SELECT parent_job_id FROM document_processing_jobs WHERE id = $1', [retry.data.job.id]);
    assert.equal(retried.rows[0].parent_job_id, failed.id);
    await jobs.cancelActive(uploaded.data.document.id);
  });

  await t.test('soft delete hides metadata immediately and physical deletion is idempotent', async () => {
    const uploaded = await api(baseUrl, `/cases/${organizationCase}/documents`, {
      auth: authA,
      method: 'POST',
      body: uploadBody('delete me', 'delete.txt', 'text/plain'),
    });
    const storageKey = uploaded.data.data.storage_key;
    const deleted = await api(baseUrl, `/cases/${organizationCase}/documents/${uploaded.data.document.id}`, {
      auth: authA,
      method: 'DELETE',
    });
    assert.equal(deleted.response.status, 202);
    assert.equal((await api(baseUrl, `/cases/${organizationCase}/documents/${uploaded.data.document.id}`, { auth: authA })).response.status, 404);
    assert.equal((await api(baseUrl, `/cases/${organizationCase}/documents/${uploaded.data.document.id}/download`, { auth: authA })).response.status, 404);

    const deleteJob = await jobs.claimNext({ workerId: 'delete-worker' });
    assert.equal(deleteJob.job_type, 'DELETE_DOCUMENT');
    const first = await processJob(deleteJob, { lockedBy: 'delete-worker' });
    await jobs.complete(deleteJob.id, first);
    assert.equal(await storage.exists(storageKey), false);
    assert.deepEqual(await processJob({ ...deleteJob, status: 'RUNNING' }), { removed: false });
  });

  await t.test('required audit events are persisted without document contents', async () => {
    const audit = await adminPool.query('SELECT action, metadata::text AS metadata FROM audit_logs');
    const actions = new Set(audit.rows.map((row) => row.action));
    for (const action of [
      'DOCUMENT_UPLOADED', 'DOCUMENT_QUEUED', 'DOCUMENT_PROCESSING_STARTED',
      'DOCUMENT_PROCESSING_COMPLETED', 'DOCUMENT_PROCESSING_FAILED',
      'DOCUMENT_RETRY_REQUESTED', 'DOCUMENT_DELETED',
      'DOCUMENT_PHYSICAL_DELETE_COMPLETED', 'DOCUMENT_UPLOAD_REJECTED',
    ]) {
      assert.equal(actions.has(action), true, `missing audit action ${action}`);
    }
    assert.equal(audit.rows.some((row) => row.metadata.includes('db rollback content')), false);
  });
});
