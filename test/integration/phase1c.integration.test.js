const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const { getTestDatabaseUrl } = require('../helpers/testDatabase');

const databaseUrl = getTestDatabaseUrl();
const uploadDir = path.join(process.cwd(), 'test-phase1c-uploads');
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = databaseUrl;
process.env.JWT_SECRET = 'phase1c-integration-only-secret';
process.env.LOCAL_UPLOAD_DIR = uploadDir;
process.env.FILE_SCANNER_PROVIDER = 'noop';
process.env.DOCUMENT_JOB_BACKOFF_MS = '0,0,0';
process.env.DOCUMENT_MAX_FILE_SIZE_BYTES = '4096';
process.env.OCR_NATIVE_TEXT_MIN_CHARS = '5';
process.env.EXTRACTION_MAX_MODEL_CALLS = '2';

const { migrate } = require('../../src/utils/migrate');
const { pool: appPool } = require('../../src/config/db');
const jobs = require('../../src/services/documentJobService');
const { processJob } = require('../../src/services/documentProcessingService');
const { MatterExtractor } = require('../../src/services/extraction/matterExtractor');
const app = require('../../src/app');

const adminPool = new Pool({ connectionString: databaseUrl });
const silentLogger = { log() {} };

const fakeOcrProvider = {
  async recognize(input, { pageNumber }) {
    return {
      text: `OCR sayfa ${pageNumber} dusuk guvenli metin`,
      pageNumber,
      confidence: 0.31,
      language: 'tur',
      durationMs: 7,
    };
  },
};

function extractionOutput(quote, name = 'Ali Veli') {
  return {
    parties: [{ name, role: 'DAVACI', partyType: 'PERSON', sourcePage: 1, sourceQuote: quote, confidence: 0.94 }],
    dates: [{ value: '2026-06-12', dateType: 'EVENT_DATE', sourcePage: 1, sourceQuote: quote, confidence: 0.88 }],
    events: [{ title: 'Sozlesme imzalandi', description: 'Taraflar sozlesme imzaladi.', eventDate: '2026-06-12', datePrecision: 'EXACT', sourcePage: 1, sourceQuote: quote, confidence: 0.86 }],
    caseMetadata: {
      caseNumber: { value: '2026/123', sourcePage: 1, sourceQuote: quote, confidence: 0.82 },
      court: { value: 'Ankara 1. Asliye Hukuk Mahkemesi', sourcePage: 1, sourceQuote: quote, confidence: 0.8 },
      legalDomain: { value: 'Borclar Hukuku', sourcePage: 1, sourceQuote: quote, confidence: 0.78 },
    },
  };
}

function fakeExtractor(output) {
  return new MatterExtractor({
    llmClient: {
      generate: async () => ({
        text: JSON.stringify(output), provider: 'fake', model: 'fake-structured-v1',
        inputTokens: 220, outputTokens: 90, estimatedCost: 0.0025,
      }),
    },
  });
}

async function seedUser(roleId) {
  const id = crypto.randomUUID();
  await adminPool.query(
    `INSERT INTO users (id, role_id, first_name, last_name, email, password_hash, is_active)
     VALUES ($1, $2, 'Phase', 'OneC', $3, 'unused', true)`,
    [id, roleId, `${id}@example.test`]
  );
  return id;
}

async function seedFirm(ownerId, userId, name) {
  const id = crypto.randomUUID();
  await adminPool.query('INSERT INTO law_firms (id, name, owner_id, is_active) VALUES ($1, $2, $3, true)', [id, name, ownerId]);
  await adminPool.query(
    `INSERT INTO firm_users (firm_id, user_id, firm_role, is_active) VALUES ($1, $2, 'kurucu', true)`,
    [id, userId]
  );
  return id;
}

async function seedCase({ ownerUserId = null, firmId = null, topic }) {
  const id = crypto.randomUUID();
  await adminPool.query(
    ownerUserId
      ? `INSERT INTO cases (id, scope_type, owner_user_id, firm_id, law_firm_id, konu, is_active)
         VALUES ($1, 'PERSONAL', $2, NULL, NULL, $3, true)`
      : `INSERT INTO cases (id, scope_type, owner_user_id, firm_id, law_firm_id, konu, is_active)
         VALUES ($1, 'ORGANIZATION', NULL, $2, $2, $3, true)`,
    [id, ownerUserId || firmId, topic]
  );
  return id;
}

function token(userId) {
  return jwt.sign({ userId, email: `${userId}@example.test`, role: 'Users' }, process.env.JWT_SECRET);
}

async function api(baseUrl, endpoint, { auth, method = 'GET', body } = {}) {
  const isForm = body instanceof FormData;
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers: {
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      ...(!isForm && body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  return { response, data: await response.json() };
}

function uploadBody(bytes, filename, type) {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type }), filename);
  form.append('documentType', 'Delil Belgesi');
  return form;
}

function minimalPdf(text) {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, 'ascii'));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body, 'ascii');
  body += `xref\n0 6\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { body += `${String(offset).padStart(10, '0')} 00000 n \n`; });
  body += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'ascii');
}

async function claimAndComplete(workerId, options = {}) {
  const job = await jobs.claimNext({ workerId });
  assert.ok(job, `expected a job for ${workerId}`);
  const result = await processJob(job, { lockedBy: workerId, ocrProvider: fakeOcrProvider, ...options });
  await jobs.complete(job.id, result);
  return { job, result };
}

test('Phase 1C OCR, extraction suggestions and Matter Twin review flow', async (t) => {
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
  const firmA = await seedFirm(userA, userA, 'Phase 1C Firm A');
  const firmB = await seedFirm(userB, userB, 'Phase 1C Firm B');
  const caseA = await seedCase({ firmId: firmA, topic: 'Phase 1C organization' });
  const caseA2 = await seedCase({ firmId: firmA, topic: 'Second organization case' });
  const personalCase = await seedCase({ ownerUserId: userA, topic: 'Phase 1C personal' });
  const foreignCase = await seedCase({ firmId: firmB, topic: 'Foreign case' });
  assert.ok(foreignCase);

  server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  const authA = token(userA);
  const authB = token(userB);

  await t.test('migration creates Phase 1C schema and supports page-idempotent PDF processing', async () => {
    for (const table of ['document_pages', 'extraction_runs', 'extraction_suggestions', 'matter_parties', 'matter_events']) {
      const found = await adminPool.query('SELECT to_regclass($1) AS name', [`public.${table}`]);
      assert.equal(found.rows[0].name, table);
    }
    const sourceText = 'Davaci Ali Veli 12 Haziran 2026 tarihinde sozlesme imzaladi.';
    const uploaded = await api(baseUrl, `/cases/${caseA}/documents`, {
      auth: authA, method: 'POST', body: uploadBody(minimalPdf(sourceText), 'phase1c.pdf', 'application/pdf'),
    });
    assert.equal(uploaded.response.status, 202);
    const document = uploaded.data.data;
    const processed = await claimAndComplete('phase1c-pdf-worker');
    assert.equal(processed.job.job_type, 'PROCESS_DOCUMENT');

    const pages = await adminPool.query('SELECT * FROM document_pages WHERE document_id = $1', [document.id]);
    assert.equal(pages.rows.length, 1);
    assert.equal(pages.rows[0].text_source, 'NATIVE');
    assert.match(pages.rows[0].extracted_text, /Davaci Ali Veli/);
    const run = await adminPool.query('SELECT * FROM extraction_runs WHERE document_id = $1', [document.id]);
    assert.equal(run.rows.length, 1);
    assert.equal(run.rows[0].status, 'QUEUED');

    await jobs.enqueue({
      document: { ...document, scope_type: 'ORGANIZATION', law_firm_id: firmA, owner_user_id: null },
      idempotencyKey: `phase1c-reprocess:${crypto.randomUUID()}`,
    });
    const duplicate = await claimAndComplete('phase1c-idempotency-worker');
    assert.equal(duplicate.result.alreadyCompleted, true);
    const pageCount = await adminPool.query('SELECT COUNT(*)::int AS count FROM document_pages WHERE document_id = $1', [document.id]);
    const runCount = await adminPool.query('SELECT COUNT(*)::int AS count FROM extraction_runs WHERE document_id = $1', [document.id]);
    assert.equal(pageCount.rows[0].count, 1);
    assert.equal(runCount.rows[0].count, 1);

    const extraction = await claimAndComplete('phase1c-extraction-worker', {
      matterExtractor: fakeExtractor(extractionOutput('Davaci Ali Veli')),
    });
    assert.equal(extraction.job.job_type, 'EXTRACT_MATTER_DATA');
    assert.equal(extraction.result.suggestionCount, 6);
    const suggestions = await adminPool.query('SELECT * FROM extraction_suggestions WHERE document_id = $1', [document.id]);
    assert.equal(suggestions.rows.length, 6);
    const usage = await adminPool.query('SELECT * FROM extraction_runs WHERE document_id = $1', [document.id]);
    assert.equal(usage.rows[0].input_tokens, 220);
    assert.equal(usage.rows[0].output_tokens, 90);
    assert.equal(Number(usage.rows[0].estimated_cost), 0.0025);

    await adminPool.query("UPDATE extraction_runs SET status = 'QUEUED' WHERE id = $1", [usage.rows[0].id]);
    await jobs.enqueue({
      document: { ...document, scope_type: 'ORGANIZATION', law_firm_id: firmA, owner_user_id: null },
      jobType: 'EXTRACT_MATTER_DATA', priority: -10,
      idempotencyKey: `phase1c-extract-retry:${crypto.randomUUID()}`,
      payload: { extractionRunId: usage.rows[0].id, extractionVersion: 1 },
    });
    await claimAndComplete('phase1c-extraction-retry', { matterExtractor: fakeExtractor(extractionOutput('Davaci Ali Veli')) });
    const duplicateSuggestions = await adminPool.query('SELECT COUNT(*)::int AS count FROM extraction_suggestions WHERE document_id = $1', [document.id]);
    assert.equal(duplicateSuggestions.rows[0].count, 6);

  });

  const documentResult = await adminPool.query("SELECT id FROM case_documents WHERE case_id = $1 AND original_filename = 'phase1c.pdf'", [caseA]);
  const organizationDocumentId = documentResult.rows[0].id;

  await t.test('suggestions are tenant-scoped and accept/reject writes only verified Matter Twin data', async () => {
    const listed = await api(baseUrl, `/cases/${caseA}/documents/${organizationDocumentId}/suggestions`, { auth: authA });
    assert.equal(listed.response.status, 200);
    assert.equal(listed.data.data.length, 6);
    assert.equal((await api(baseUrl, `/cases/${caseA}/documents/${organizationDocumentId}/suggestions`, { auth: authB })).response.status, 404);

    const party = listed.data.data.find((item) => item.suggestion_type === 'PARTY');
    const event = listed.data.data.find((item) => item.suggestion_type === 'EVENT');
    const date = listed.data.data.find((item) => item.suggestion_type === 'DATE');
    const caseNumber = listed.data.data.find((item) => item.suggestion_type === 'CASE_NUMBER');
    const court = listed.data.data.find((item) => item.suggestion_type === 'COURT');
    const domain = listed.data.data.find((item) => item.suggestion_type === 'LEGAL_DOMAIN');

    const accepted = await api(baseUrl, `/cases/${caseA}/suggestions/${party.id}/accept`, { auth: authA, method: 'POST', body: {} });
    assert.equal(accepted.response.status, 200);
    const acceptedAgain = await api(baseUrl, `/cases/${caseA}/suggestions/${party.id}/accept`, { auth: authA, method: 'POST', body: {} });
    assert.equal(acceptedAgain.data.idempotent, true);
    const partyCount = await adminPool.query('SELECT COUNT(*)::int AS count FROM matter_parties WHERE source_suggestion_id = $1', [party.id]);
    assert.equal(partyCount.rows[0].count, 1);

    const rejected = await api(baseUrl, `/cases/${caseA}/suggestions/${event.id}/reject`, {
      auth: authA, method: 'POST', body: { reason: 'Dosya sorumlusu doğrulamadı.' },
    });
    assert.equal(rejected.response.status, 200);
    const rejectedAgain = await api(baseUrl, `/cases/${caseA}/suggestions/${event.id}/reject`, { auth: authA, method: 'POST', body: {} });
    assert.equal(rejectedAgain.data.idempotent, true);
    const rejectedEventCount = await adminPool.query('SELECT COUNT(*)::int AS count FROM matter_events WHERE source_suggestion_id = $1', [event.id]);
    assert.equal(rejectedEventCount.rows[0].count, 0);

    const wrongCase = await api(baseUrl, `/cases/${caseA2}/suggestions/${date.id}/accept`, { auth: authA, method: 'POST', body: {} });
    assert.equal(wrongCase.response.status, 404);

    const bulk = await api(baseUrl, `/cases/${caseA}/suggestions/bulk-review`, {
      auth: authA,
      method: 'POST',
      body: { accept: [date.id, caseNumber.id, court.id, domain.id], reject: [] },
    });
    assert.equal(bulk.response.status, 200);
    assert.equal(bulk.data.strategy, 'all_or_nothing');
    const twin = await adminPool.query(
      `SELECT (SELECT COUNT(*)::int FROM matter_events WHERE case_id = $1) AS events,
              esas_no, mahkeme, legal_domain FROM cases WHERE id = $1`,
      [caseA]
    );
    assert.equal(twin.rows[0].events, 1);
    assert.equal(twin.rows[0].esas_no, '2026/123');
    assert.equal(twin.rows[0].mahkeme, 'Ankara 1. Asliye Hukuk Mahkemesi');
    assert.equal(twin.rows[0].legal_domain, 'Borclar Hukuku');
  });

  await t.test('personal suggestions are owner-only and low-confidence OCR pages remain stored', async () => {
    const personalText = 'Davaci Ayse Kaya kisisel dosya metni.';
    const personalUpload = await api(baseUrl, `/cases/${personalCase}/documents`, {
      auth: authA, method: 'POST', body: uploadBody(personalText, 'personal.txt', 'text/plain'),
    });
    assert.equal(personalUpload.response.status, 202);
    await claimAndComplete('personal-process-worker');
    await claimAndComplete('personal-extraction-worker', {
      matterExtractor: fakeExtractor(extractionOutput('Davaci Ayse Kaya', 'Ayse Kaya')),
    });
    const ownerList = await api(baseUrl, `/cases/${personalCase}/documents/${personalUpload.data.document.id}/suggestions`, { auth: authA });
    assert.equal(ownerList.response.status, 200);
    assert.ok(ownerList.data.data.length > 0);
    assert.equal((await api(baseUrl, `/cases/${personalCase}/documents/${personalUpload.data.document.id}/suggestions`, { auth: authB })).response.status, 404);

    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('phase1c')]);
    const image = await api(baseUrl, `/cases/${caseA}/documents`, {
      auth: authA, method: 'POST', body: uploadBody(png, 'ocr.png', 'image/png'),
    });
    assert.equal(image.response.status, 202);
    await claimAndComplete('image-ocr-worker');
    const page = await adminPool.query('SELECT * FROM document_pages WHERE document_id = $1', [image.data.document.id]);
    assert.equal(page.rows.length, 1);
    assert.equal(page.rows[0].text_source, 'OCR');
    assert.equal(Number(page.rows[0].ocr_confidence), 0.31);
    assert.match(page.rows[0].extracted_text, /dusuk guvenli/);

    const deletion = await api(baseUrl, `/cases/${caseA}/documents/${image.data.document.id}`, { auth: authA, method: 'DELETE' });
    assert.equal(deletion.response.status, 202);
    const run = await adminPool.query('SELECT status FROM extraction_runs WHERE document_id = $1', [image.data.document.id]);
    assert.equal(run.rows[0].status, 'CANCELLED');
    const cancelledJob = await adminPool.query(
      `SELECT * FROM document_processing_jobs WHERE document_id = $1 AND job_type = 'EXTRACT_MATTER_DATA' ORDER BY created_at DESC LIMIT 1`,
      [image.data.document.id]
    );
    const skipped = await processJob(cancelledJob.rows[0], { matterExtractor: fakeExtractor(extractionOutput('OCR sayfa 1')) });
    assert.equal(skipped.reason, 'deleted');
  });

  await t.test('forged extraction scope fails and required audit events exist', async () => {
    const run = await adminPool.query('SELECT * FROM extraction_runs WHERE document_id = $1', [organizationDocumentId]);
    await adminPool.query("UPDATE extraction_runs SET status = 'QUEUED' WHERE id = $1", [run.rows[0].id]);
    const document = await adminPool.query('SELECT * FROM case_documents WHERE id = $1', [organizationDocumentId]);
    const forged = await jobs.enqueue({
      document: { ...document.rows[0], scope_type: 'ORGANIZATION', law_firm_id: firmB, owner_user_id: null },
      jobType: 'EXTRACT_MATTER_DATA', priority: 20,
      idempotencyKey: `forged-extraction:${crypto.randomUUID()}`,
      payload: { extractionRunId: run.rows[0].id, extractionVersion: 1 },
    });
    const claimed = await jobs.claimNext({ workerId: 'forged-extraction-worker' });
    assert.equal(claimed.id, forged.id);
    await assert.rejects(processJob(claimed, { matterExtractor: fakeExtractor(extractionOutput('Davaci Ali Veli')) }), (error) => error.code === 'SCOPE_MISMATCH');
    await jobs.cancelActive(organizationDocumentId);

    const audit = await adminPool.query('SELECT action, metadata::text AS metadata FROM audit_logs');
    const actions = new Set(audit.rows.map((row) => row.action));
    for (const action of ['OCR_STARTED', 'OCR_COMPLETED', 'EXTRACTION_STARTED', 'EXTRACTION_COMPLETED', 'SUGGESTION_ACCEPTED', 'SUGGESTION_REJECTED', 'SUGGESTIONS_BULK_REVIEWED']) {
      assert.equal(actions.has(action), true, `missing ${action}`);
    }
    assert.equal(audit.rows.some((row) => row.metadata.includes('Davaci Ali Veli')), false);
  });
});
