const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const { getTestDatabaseUrl } = require('../helpers/testDatabase');

const databaseUrl = getTestDatabaseUrl();
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = databaseUrl;
process.env.JWT_SECRET = 'phase1a-integration-only-secret';
process.env.JWT_EXPIRES_IN = '15m';
process.env.LOCAL_UPLOAD_DIR = path.join(process.cwd(), 'uploads');

const { migrate } = require('../../src/utils/migrate');
const { pool: appPool } = require('../../src/config/db');
const app = require('../../src/app');

const adminPool = new Pool({ connectionString: databaseUrl });
const silentLogger = { log() {} };

async function resetDatabase() {
  await adminPool.query('DROP SCHEMA IF EXISTS public CASCADE');
  await adminPool.query('CREATE SCHEMA public');
}

async function seedUser(client, roleId) {
  const id = crypto.randomUUID();
  await client.query(
    `INSERT INTO users (id, role_id, first_name, last_name, email, password_hash, is_active)
     VALUES ($1, $2, 'Test', 'User', $3, 'unused-in-integration-tests', true)`,
    [id, roleId, `${id}@example.test`]
  );
  return id;
}

async function seedFirm(client, ownerId, name) {
  const id = crypto.randomUUID();
  await client.query(
    `INSERT INTO law_firms (id, name, owner_id, is_active)
     VALUES ($1, $2, $3, true)`,
    [id, name, ownerId]
  );
  return id;
}

async function addMembership(client, firmId, userId, role = 'avukat', active = true) {
  await client.query(
    `INSERT INTO firm_users (firm_id, user_id, firm_role, is_active)
     VALUES ($1, $2, $3, $4)`,
    [firmId, userId, role, active]
  );
}

function authToken(userId, role = 'Users') {
  return jwt.sign({ userId, email: `${userId}@example.test`, role }, process.env.JWT_SECRET, {
    expiresIn: '15m',
  });
}

async function api(baseUrl, endpoint, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json()
    : Buffer.from(await response.arrayBuffer());
  return { response, data };
}

test('Phase 1A migration, tenant isolation and document security', async (t) => {
  let server;
  const createdFiles = [];

  t.after(async () => {
    await new Promise((resolve) => {
      if (!server) return resolve();
      server.close(resolve);
    });
    for (const file of createdFiles) fs.rmSync(file, { force: true });
    await appPool.end();
    await adminPool.end();
  });

  await t.test('migration runs on an empty database', async () => {
    await resetDatabase();
    const result = await migrate({ dbPool: adminPool, logger: silentLogger });
    assert.ok(result.applied >= 1);

    const { rows } = await adminPool.query(
      `SELECT version, checksum
       FROM schema_migrations
       WHERE version = '20260627_001_phase1a_matter_scope'`
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].checksum.length, 64);
    const phase1b = await adminPool.query(
      `SELECT checksum FROM schema_migrations
       WHERE version = '20260627_002_phase1b_document_pipeline'`
    );
    assert.equal(phase1b.rows.length, 1);
    assert.equal(phase1b.rows[0].checksum.length, 64);
  });

  await t.test('legacy organization cases are preserved and migration is not re-applied', async () => {
    await resetDatabase();
    const baseline = fs.readFileSync(path.join(process.cwd(), 'src', 'config', 'database.sql'), 'utf8');
    await adminPool.query(baseline);
    const roleResult = await adminPool.query("SELECT id FROM roles WHERE role_name = 'Users'");
    const ownerId = await seedUser(adminPool, roleResult.rows[0].id);
    const firmId = await seedFirm(adminPool, ownerId, 'Legacy Firm');
    const caseId = crypto.randomUUID();
    await adminPool.query(
      `INSERT INTO cases (id, firm_id, esas_no, konu)
       VALUES ($1, $2, 'LEGACY/1', 'Legacy case')`,
      [caseId, firmId]
    );
    const documentId = crypto.randomUUID();
    await adminPool.query(
      `INSERT INTO case_documents (
         id, case_id, firm_id, document_name, file_url, uploaded_by, extracted_text, analysis_status
       ) VALUES ($1, $2, $3, 'legacy.pdf', '/uploads/legacy-safe.pdf', $4, 'legacy text', 'completed')`,
      [documentId, caseId, firmId, ownerId]
    );

    await migrate({ dbPool: adminPool, logger: silentLogger });
    const { rows } = await adminPool.query(
      `SELECT id, firm_id, law_firm_id, scope_type, owner_user_id
       FROM cases WHERE id = $1`,
      [caseId]
    );
    assert.equal(rows[0].id, caseId);
    assert.equal(rows[0].scope_type, 'ORGANIZATION');
    assert.equal(rows[0].firm_id, firmId);
    assert.equal(rows[0].law_firm_id, firmId);
    assert.equal(rows[0].owner_user_id, null);
    const document = await adminPool.query(
      `SELECT original_filename, safe_filename, storage_key, storage_provider,
              processing_status, text_extracted, processing_attempts, deleted_at
       FROM case_documents WHERE id = $1`,
      [documentId]
    );
    assert.deepEqual(document.rows[0], {
      original_filename: 'legacy.pdf',
      safe_filename: 'legacy-safe.pdf',
      storage_key: '/uploads/legacy-safe.pdf',
      storage_provider: 'LOCAL',
      processing_status: 'COMPLETED',
      text_extracted: true,
      processing_attempts: 0,
      deleted_at: null,
    });

    const secondRun = await migrate({ dbPool: adminPool, logger: silentLogger });
    assert.equal(secondRun.applied, 0);
    const count = await adminPool.query(
      `SELECT COUNT(*)::int AS count FROM schema_migrations
       WHERE version = '20260627_001_phase1a_matter_scope'`
    );
    assert.equal(count.rows[0].count, 1);

    await assert.rejects(
      adminPool.query("UPDATE case_documents SET processing_status = 'INVALID' WHERE id = $1", [documentId]),
      (error) => error.code === '23514'
    );
    await assert.rejects(
      adminPool.query('UPDATE case_documents SET file_size_bytes = 0 WHERE id = $1', [documentId]),
      (error) => error.code === '23514'
    );

    const jobId = crypto.randomUUID();
    await adminPool.query(
      `INSERT INTO document_processing_jobs (
         id, document_id, case_id, organization_id, job_type, idempotency_key
       ) VALUES ($1, $2, $3, $4, 'PROCESS_DOCUMENT', 'legacy-process-v1')`,
      [jobId, documentId, caseId, firmId]
    );
    await assert.rejects(
      adminPool.query(
        `INSERT INTO document_processing_jobs (
           document_id, case_id, organization_id, job_type, idempotency_key
         ) VALUES ($1, $2, $3, 'DELETE_DOCUMENT', 'legacy-process-v1')`,
        [documentId, caseId, firmId]
      ),
      (error) => error.code === '23505'
    );

    await assert.rejects(
      adminPool.query(
        `INSERT INTO cases (id, scope_type, owner_user_id, firm_id, law_firm_id, konu)
         VALUES ($1, 'PERSONAL', NULL, NULL, NULL, 'Invalid personal')`,
        [crypto.randomUUID()]
      ),
      (error) => error.code === '23514'
    );
    await assert.rejects(
      adminPool.query(
        `INSERT INTO cases (id, scope_type, owner_user_id, firm_id, law_firm_id, konu)
         VALUES ($1, 'ORGANIZATION', NULL, NULL, NULL, 'Invalid organization')`,
        [crypto.randomUUID()]
      ),
      (error) => error.code === '23514'
    );
  });

  await t.test('HTTP access is isolated by personal owner and active organization membership', async () => {
    await resetDatabase();
    await migrate({ dbPool: adminPool, logger: silentLogger });

    const roleResult = await adminPool.query("SELECT id FROM roles WHERE role_name = 'Users'");
    const roleId = roleResult.rows[0].id;
    const userA = await seedUser(adminPool, roleId);
    const userB = await seedUser(adminPool, roleId);
    const userC = await seedUser(adminPool, roleId);
    const userD = await seedUser(adminPool, roleId);
    const userE = await seedUser(adminPool, roleId);
    const firmA = await seedFirm(adminPool, userA, 'Firm A');
    const firmB = await seedFirm(adminPool, userE, 'Firm B');
    await addMembership(adminPool, firmA, userA, 'kurucu');
    await addMembership(adminPool, firmA, userB, 'avukat');
    await addMembership(adminPool, firmA, userD, 'avukat', false);
    await addMembership(adminPool, firmB, userE, 'kurucu');

    const tokens = {
      a: authToken(userA),
      b: authToken(userB),
      c: authToken(userC),
      d: authToken(userD),
      e: authToken(userE),
    };

    server = await new Promise((resolve) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    const baseUrl = `http://127.0.0.1:${server.address().port}/api`;

    const personalCreate = await api(baseUrl, '/cases', {
      token: tokens.a,
      method: 'POST',
      body: {
        scopeType: 'PERSONAL',
        ownerUserId: userB,
        esasNo: 'P-1',
        konu: 'Personal A',
      },
    });
    assert.equal(personalCreate.response.status, 201);
    assert.equal(personalCreate.data.data.scopeType, 'PERSONAL');
    assert.equal(personalCreate.data.data.ownerUserId, userA);
    assert.equal(personalCreate.data.data.lawFirmId, null);
    const personalCaseA = personalCreate.data.data.id;

    const personalSecond = await api(baseUrl, '/cases', {
      token: tokens.a,
      method: 'POST',
      body: { scopeType: 'PERSONAL', konu: 'Personal A second' },
    });
    assert.equal(personalSecond.response.status, 201);
    const personalCaseA2 = personalSecond.data.data.id;

    assert.equal((await api(baseUrl, `/cases/${personalCaseA}`, { token: tokens.a })).response.status, 200);
    assert.equal((await api(baseUrl, `/cases/${personalCaseA}`, { token: tokens.b })).response.status, 404);
    assert.equal(
      (await api(baseUrl, `/cases/${personalCaseA}`, {
        token: tokens.b,
        method: 'PUT',
        body: { konu: 'Unauthorized update' },
      })).response.status,
      404
    );
    const personalUpdate = await api(baseUrl, `/cases/${personalCaseA}`, {
      token: tokens.a,
      method: 'PUT',
      body: { konu: 'Personal A updated' },
    });
    assert.equal(personalUpdate.response.status, 200);
    assert.equal(personalUpdate.data.data.konu, 'Personal A updated');

    const organizationCreate = await api(baseUrl, '/cases', {
      token: tokens.a,
      method: 'POST',
      body: { scopeType: 'ORGANIZATION', lawFirmId: firmA, esasNo: 'ORG-A-1', konu: 'Firm A case' },
    });
    assert.equal(organizationCreate.response.status, 201);
    const organizationCaseA = organizationCreate.data.data.id;
    assert.equal((await api(baseUrl, `/cases/${organizationCaseA}`, { token: tokens.b })).response.status, 200);
    assert.equal((await api(baseUrl, `/cases/${organizationCaseA}`, { token: tokens.e })).response.status, 404);
    assert.equal((await api(baseUrl, `/cases/${organizationCaseA}`, { token: tokens.d })).response.status, 404);

    const noMembershipCreate = await api(baseUrl, '/cases', {
      token: tokens.c,
      method: 'POST',
      body: { scopeType: 'ORGANIZATION', lawFirmId: firmA, konu: 'Forbidden' },
    });
    assert.equal(noMembershipCreate.response.status, 403);

    const legacyCreate = await api(baseUrl, '/cases', {
      token: tokens.e,
      method: 'POST',
      body: { firmId: firmB, esasNo: 'ORG-B-1', konu: 'Legacy client payload' },
    });
    assert.equal(legacyCreate.response.status, 201);
    assert.equal(legacyCreate.data.data.scopeType, 'ORGANIZATION');
    const organizationCaseB = legacyCreate.data.data.id;

    await adminPool.query(
      `INSERT INTO uyap_notifications (id, firm_id, title, content)
       VALUES ($1, $2, 'Other tenant notification', 'ORG-A-1 must not leak')`,
      [crypto.randomUUID(), firmB]
    );
    const organizationWorkspace = await api(baseUrl, `/cases/${organizationCaseA}/workspace`, {
      token: tokens.a,
    });
    assert.equal(organizationWorkspace.response.status, 200);
    assert.ok(
      !organizationWorkspace.data.data.timeline.some((event) => event.title === 'Other tenant notification')
    );

    const listA = await api(baseUrl, '/cases', { token: tokens.a });
    assert.equal(listA.response.status, 200);
    const listAIds = listA.data.data.map((item) => item.id);
    assert.ok(listAIds.includes(personalCaseA));
    assert.ok(listAIds.includes(organizationCaseA));
    assert.ok(!listAIds.includes(organizationCaseB));

    const listB = await api(baseUrl, '/cases', { token: tokens.b });
    const listBIds = listB.data.data.map((item) => item.id);
    assert.ok(listBIds.includes(organizationCaseA));
    assert.ok(!listBIds.includes(personalCaseA));

    const listE = await api(baseUrl, '/cases', { token: tokens.e });
    const listEIds = listE.data.data.map((item) => item.id);
    assert.ok(listEIds.includes(organizationCaseB));
    assert.ok(!listEIds.includes(organizationCaseA));

    fs.mkdirSync(process.env.LOCAL_UPLOAD_DIR, { recursive: true });
    const storedName = `phase1a-${crypto.randomUUID()}.txt`;
    const storedPath = path.join(process.env.LOCAL_UPLOAD_DIR, storedName);
    const secretText = 'tenant-isolated-document';
    fs.writeFileSync(storedPath, secretText, 'utf8');
    createdFiles.push(storedPath);

    const personalDocumentId = crypto.randomUUID();
    await adminPool.query(
      `INSERT INTO case_documents (id, case_id, firm_id, document_name, file_url, uploaded_by)
       VALUES ($1, $2, NULL, 'personal.txt', $3, $4)`,
      [personalDocumentId, personalCaseA, `/uploads/${storedName}`, userA]
    );
    const organizationDocumentId = crypto.randomUUID();
    await adminPool.query(
      `INSERT INTO case_documents (id, case_id, firm_id, document_name, file_url, uploaded_by)
       VALUES ($1, $2, $3, 'organization.txt', $4, $5)`,
      [organizationDocumentId, organizationCaseA, firmA, `/uploads/${storedName}`, userA]
    );

    const noAuthDownload = await api(
      baseUrl,
      `/cases/${personalCaseA}/documents/${personalDocumentId}/download`
    );
    assert.equal(noAuthDownload.response.status, 401);
    assert.equal(
      (await api(baseUrl, `/cases/${personalCaseA}/documents/not-a-valid-id/download`, { token: tokens.a })).response.status,
      404
    );

    const ownerDownload = await api(
      baseUrl,
      `/cases/${personalCaseA}/documents/${personalDocumentId}/download`,
      { token: tokens.a }
    );
    assert.equal(ownerDownload.response.status, 200);
    assert.equal(ownerDownload.data.toString('utf8'), secretText);

    assert.equal(
      (await api(baseUrl, `/cases/${personalCaseA}/documents/${personalDocumentId}/download`, { token: tokens.b })).response.status,
      404
    );
    assert.equal(
      (await api(baseUrl, `/cases/${organizationCaseA}/documents/${organizationDocumentId}/download`, { token: tokens.e })).response.status,
      404
    );
    assert.equal(
      (await api(baseUrl, `/cases/${personalCaseA2}/documents/${personalDocumentId}/download`, { token: tokens.a })).response.status,
      404
    );

    const traversalDocumentId = crypto.randomUUID();
    await adminPool.query(
      `INSERT INTO case_documents (id, case_id, firm_id, document_name, file_url, uploaded_by)
       VALUES ($1, $2, NULL, 'malicious.txt', '../../server.js', $3)`,
      [traversalDocumentId, personalCaseA, userA]
    );
    const traversal = await api(
      baseUrl,
      `/cases/${personalCaseA}/documents/${traversalDocumentId}/download`,
      { token: tokens.a }
    );
    assert.equal(traversal.response.status, 404);
    assert.ok(!JSON.stringify(traversal.data).includes('Emsal Atlası'));

    const publicUpload = await fetch(`http://127.0.0.1:${server.address().port}/uploads/${storedName}`);
    assert.equal(publicUpload.status, 404);
    assert.ok(!(await publicUpload.text()).includes(secretText));

    const documentList = await api(baseUrl, `/cases/${personalCaseA}/documents`, { token: tokens.a });
    assert.equal(documentList.response.status, 200);
    assert.ok(documentList.data.data.some((item) => item.id === personalDocumentId));

    const workspace = await api(baseUrl, `/cases/${personalCaseA}/workspace`, { token: tokens.a });
    assert.equal(workspace.response.status, 200);
    assert.equal(workspace.data.data.case.scopeType, 'PERSONAL');

    const personalDelete = await api(baseUrl, `/cases/${personalCaseA2}`, {
      token: tokens.a,
      method: 'DELETE',
    });
    assert.equal(personalDelete.response.status, 200);
    assert.equal((await api(baseUrl, `/cases/${personalCaseA2}`, { token: tokens.a })).response.status, 404);

    const auditResult = await adminPool.query(
      `SELECT action, success FROM audit_logs
       WHERE user_id = $1 AND action IN (
         'CASE_CREATED', 'CASE_VIEWED', 'CASE_UPDATED', 'CASE_DELETED',
         'DOCUMENT_LISTED', 'DOCUMENT_DOWNLOADED'
       )`,
      [userA]
    );
    const actions = new Set(auditResult.rows.map((row) => row.action));
    assert.ok(actions.has('CASE_CREATED'));
    assert.ok(actions.has('CASE_VIEWED'));
    assert.ok(actions.has('CASE_UPDATED'));
    assert.ok(actions.has('CASE_DELETED'));
    assert.ok(actions.has('DOCUMENT_LISTED'));
    assert.ok(actions.has('DOCUMENT_DOWNLOADED'));
  });

});
