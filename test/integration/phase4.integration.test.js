const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const { getTestDatabaseUrl } = require('../helpers/testDatabase');
const databaseUrl = getTestDatabaseUrl();
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = databaseUrl;
process.env.JWT_SECRET = 'phase4-integration-only-secret';

const { migrate } = require('../../src/utils/migrate');
const { pool: appPool } = require('../../src/config/db');
const app = require('../../src/app');
const { CalculationEngine, RuleVersionService } = require('../../src/services/calculations');
const { DraftService } = require('../../src/services/drafting/DraftService');
const DeadlineService = require('../../src/services/deadlineService');

const adminPool = new Pool({ connectionString: databaseUrl });
const silentLogger = { log() {} };

async function resetDatabase() {
  await adminPool.query('DROP SCHEMA IF EXISTS public CASCADE');
  await adminPool.query('CREATE SCHEMA public');
  await migrate({ dbPool: adminPool, logger: silentLogger });
}

async function seedUser(email, roleName = 'Users') {
  const id = crypto.randomUUID();
  const role = await adminPool.query('SELECT id FROM roles WHERE role_name = $1', [roleName]);
  await adminPool.query("INSERT INTO users (id, role_id, first_name, last_name, email, password_hash, is_active) VALUES ($1,$2,'Phase','Four',$3,'unused',true)", [id, role.rows[0].id, email]);
  return id;
}
async function seedFirm(userId, name) {
  const id = crypto.randomUUID();
  await adminPool.query('INSERT INTO law_firms (id,name,owner_id,is_active) VALUES ($1,$2,$3,true)', [id, name, userId]);
  await adminPool.query("INSERT INTO firm_users (firm_id,user_id,firm_role,is_active) VALUES ($1,$2,'kurucu',true)", [id, userId]);
  return id;
}
async function seedCase({ ownerId = null, firmId = null, title }) {
  const id = crypto.randomUUID();
  if (firmId) await adminPool.query("INSERT INTO cases (id,firm_id,law_firm_id,scope_type,konu,is_active) VALUES ($1,$2,$2,'ORGANIZATION',$3,true)", [id, firmId, title]);
  else await adminPool.query("INSERT INTO cases (id,scope_type,owner_user_id,konu,is_active) VALUES ($1,'PERSONAL',$2,$3,true)", [id, ownerId, title]);
  return id;
}
function context(userId, firms = [], admin = false) {
  return { userId, isSystemAdmin: admin, memberships: firms.map((lawFirmId) => ({ lawFirmId, canRead: true, canWrite: true, canAdmin: true })) };
}
function token(userId) { return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '15m' }); }
async function api(baseUrl, endpoint, { auth, method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${endpoint}`, { method, headers: { ...(auth ? { Authorization: `Bearer ${auth}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const data = response.status === 204 ? null : await response.json(); return { response, data };
}

test('Phase 4 versioned legal calculation engine', async (t) => {
  let server;
  t.after(async () => { await new Promise((resolve) => server?.close(resolve) || resolve()); await appPool.end(); await adminPool.end(); });
  await resetDatabase();
  const creator = await seedUser('phase4-creator@example.test');
  const reviewer = await seedUser('phase4-reviewer@example.test');
  const outsider = await seedUser('phase4-outsider@example.test');
  const admin = await seedUser('phase4-admin@example.test', 'Admin');
  const firmA = await seedFirm(creator, 'Phase 4 Firm A');
  const firmB = await seedFirm(outsider, 'Phase 4 Firm B');
  const personalCase = await seedCase({ ownerId: creator, title: 'Personal calculation matter' });
  const firmCase = await seedCase({ firmId: firmA, title: 'Firm calculation matter' });
  const foreignCase = await seedCase({ firmId: firmB, title: 'Foreign matter' });
  const ruleService = new RuleVersionService({ db: appPool });
  const engine = new CalculationEngine({ db: appPool });
  const creatorContext = context(creator, [firmA]);
  const outsiderContext = context(outsider, [firmB]);

  await adminPool.query("UPDATE holiday_calendars SET status = 'ACTIVE' WHERE code = 'TR_GENERAL'");
  const calendarId = (await adminPool.query("SELECT id FROM holiday_calendars WHERE code = 'TR_GENERAL'")).rows[0].id;
  await adminPool.query("INSERT INTO holiday_calendar_days (calendar_id,holiday_date,name,holiday_type,is_full_day,source_reference) VALUES ($1,'2026-07-01','Test holiday','PUBLIC_HOLIDAY',true,'Official test fixture')", [calendarId]);

  await ruleService.createRuleSet({ ruleCode: 'TEST_DEADLINE', name: 'Verified test deadline', calculationType: 'DEADLINE' }, creator);
  const oldVersion = await ruleService.createVersion('TEST_DEADLINE', { versionNumber: 1, effectiveFrom: '2025-01-01', effectiveTo: '2025-12-31', inputSchema: { required: ['triggerDate'], properties: { triggerDate: { type: 'string', format: 'date' } } }, ruleDefinition: { calendarCode: 'TR_GENERAL', steps: [{ code: 'START', operation: 'EXCLUDE_START_DAY' }, { code: 'TERM', operation: 'ADD_DAYS', value: 2 }, { code: 'HOLIDAY', operation: 'APPLY_HOLIDAY_CALENDAR' }] }, outputSchema: {}, legalReference: 'Test Act article 1', officialSourceReference: 'https://official.example.test/test-act' }, creator);
  await ruleService.review('TEST_DEADLINE', oldVersion.id, reviewer); await ruleService.activate('TEST_DEADLINE', oldVersion.id);
  const currentVersion = await ruleService.createVersion('TEST_DEADLINE', { versionNumber: 2, effectiveFrom: '2026-01-01', inputSchema: { required: ['triggerDate'], properties: { triggerDate: { type: 'string', format: 'date' } } }, ruleDefinition: { calendarCode: 'TR_GENERAL', deadlineTime: '23:59', steps: [{ code: 'START', operation: 'EXCLUDE_START_DAY' }, { code: 'TERM', operation: 'ADD_DAYS', value: 3 }, { code: 'HOLIDAY', operation: 'APPLY_HOLIDAY_CALENDAR' }] }, outputSchema: {}, legalReference: 'Test Act article 2', officialSourceReference: 'https://official.example.test/test-act-2' }, creator);
  await ruleService.review('TEST_DEADLINE', currentVersion.id, reviewer); await ruleService.activate('TEST_DEADLINE', currentVersion.id);

  await ruleService.createRuleSet({ ruleCode: 'TEST_INTEREST', name: 'Verified test interest', calculationType: 'INTEREST' }, creator);
  const interestVersion = await ruleService.createVersion('TEST_INTEREST', { versionNumber: 1, effectiveFrom: '2026-01-01', inputSchema: {}, ruleDefinition: { rateCode: 'TEST_RATE', interestMode: 'SIMPLE', dayCountConvention: 'ACTUAL_365', roundingMode: 'ROUND_HALF_UP', steps: [{ code: 'RATE', operation: 'APPLY_RATE_PERIOD' }] }, outputSchema: {}, legalReference: 'Test Interest Act article 1', officialSourceReference: 'https://official.example.test/interest' }, creator);
  await ruleService.review('TEST_INTEREST', interestVersion.id, reviewer); await ruleService.activate('TEST_INTEREST', interestVersion.id);
  await adminPool.query("INSERT INTO legal_rate_periods (rate_code,name,effective_from,effective_to,numeric_value,unit,source_reference,status) VALUES ('TEST_RATE','Rate A','2026-01-01','2026-01-15',10,'PERCENT_YEARLY','Official rate A','ACTIVE'),('TEST_RATE','Rate B','2026-01-16',null,20,'PERCENT_YEARLY','Official rate B','ACTIVE')");

  await t.test('effective date resolves the historical rule version', async () => {
    const selected = await ruleService.resolveActive({ ruleCode: 'TEST_DEADLINE', effectiveAt: '2025-06-01' }); assert.equal(selected.id, oldVersion.id);
  });
  await t.test('effective date resolves the current rule version', async () => {
    const selected = await ruleService.resolveActive({ ruleCode: 'TEST_DEADLINE', effectiveAt: '2026-06-01' }); assert.equal(selected.id, currentVersion.id);
  });
  await t.test('out-of-range active version is not selected', async () => {
    assert.equal(await ruleService.resolveActive({ ruleCode: 'TEST_DEADLINE', effectiveAt: '2024-06-01' }), null);
  });
  await t.test('DRAFT rule is not selected for production calculation', async () => {
    await ruleService.createRuleSet({ ruleCode: 'DRAFT_ONLY', name: 'Draft only', calculationType: 'DEADLINE' }, creator);
    await ruleService.createVersion('DRAFT_ONLY', { versionNumber: 1, effectiveFrom: '2026-01-01', ruleDefinition: { steps: [{ operation: 'ADD_DAYS', value: 1 }] } }, creator);
    assert.equal(await ruleService.resolveActive({ ruleCode: 'DRAFT_ONLY', effectiveAt: '2026-01-01' }), null);
  });
  await t.test('overlapping ACTIVE rule versions are blocked', async () => {
    const overlap = await ruleService.createVersion('TEST_DEADLINE', { versionNumber: 3, effectiveFrom: '2026-06-01', ruleDefinition: { steps: [{ operation: 'ADD_DAYS', value: 1 }] }, legalReference: 'Test Act overlap', officialSourceReference: 'https://official.example.test/overlap' }, creator);
    await ruleService.review('TEST_DEADLINE', overlap.id, reviewer);
    await assert.rejects(ruleService.activate('TEST_DEADLINE', overlap.id), (error) => error.code === 'ACTIVE_RULE_OVERLAP');
  });
  await t.test('creator cannot review their own rule', async () => {
    const draft = await ruleService.createVersion('DRAFT_ONLY', { versionNumber: 2, effectiveFrom: '2027-01-01', ruleDefinition: { steps: [{ operation: 'ADD_DAYS', value: 1 }] }, legalReference: 'Ref', officialSourceReference: 'Official' }, creator);
    await assert.rejects(ruleService.review('DRAFT_ONLY', draft.id, creator), (error) => error.code === 'REVIEWER_MUST_DIFFER');
  });

  let deadlineRun;
  await t.test('deadline calculates with explainable holiday adjustment', async () => {
    deadlineRun = await engine.calculate('deadline', { caseId: personalCase, ruleCode: 'TEST_DEADLINE', effectiveAt: '2026-06-01', triggerDate: '2026-06-28', calendarCode: 'TR_GENERAL', timezone: 'Europe/Istanbul' }, creatorContext, { idempotencyKey: 'deadline-one' });
    assert.equal(deadlineRun.status, 'CALCULATED'); assert.equal(deadlineRun.result_data.finalDate, '2026-07-02'); assert.equal(deadlineRun.steps.length, 3); assert.equal(deadlineRun.rule_version_id, currentVersion.id);
  });
  await t.test('same idempotency key returns the same run', async () => {
    const duplicate = await engine.calculate('deadline', { caseId: personalCase, ruleCode: 'TEST_DEADLINE', effectiveAt: '2026-06-01', triggerDate: '2026-06-28', calendarCode: 'TR_GENERAL' }, creatorContext, { idempotencyKey: 'deadline-one' }); assert.equal(duplicate.id, deadlineRun.id);
  });
  await t.test('unconfirmed calculation cannot create deadline', async () => {
    await assert.rejects(engine.runService.createDeadline(deadlineRun.id, creatorContext), (error) => error.code === 'CALCULATION_NOT_CONFIRMED');
  });
  await t.test('unconfirmed calculation creates no deadline row', async () => {
    const count = await adminPool.query('SELECT count(*)::int AS count FROM deadline_alerts WHERE calculation_run_id = $1', [deadlineRun.id]); assert.equal(count.rows[0].count, 0);
  });
  await t.test('confirmed calculation creates one idempotent deadline', async () => {
    deadlineRun = await engine.runService.confirm(deadlineRun.id, creatorContext); const first = await engine.runService.createDeadline(deadlineRun.id, creatorContext); const second = await engine.runService.createDeadline(deadlineRun.id, creatorContext); assert.equal(first.id, second.id); assert.equal(first.rule_version_id, currentVersion.id); assert.equal(first.owner_user_id, creator);
  });
  await t.test('confirmed calculation creates one idempotent task', async () => {
    const first = await engine.runService.createTask(deadlineRun.id, creatorContext); const second = await engine.runService.createTask(deadlineRun.id, creatorContext); assert.equal(first.id, second.id); assert.equal(first.rule_version_id, currentVersion.id);
  });
  await t.test('personal calculation is visible only to owner', async () => {
    await assert.rejects(engine.runService.get(deadlineRun.id, outsiderContext), (error) => error.code === 'CALCULATION_NOT_FOUND');
  });
  await t.test('organization calculation stays inside tenant', async () => {
    const run = await engine.calculate('deadline', { caseId: firmCase, ruleCode: 'TEST_DEADLINE', triggerDate: '2026-06-01', calendarCode: 'TR_GENERAL' }, creatorContext); assert.equal(run.organization_id, firmA); await assert.rejects(engine.runService.get(run.id, outsiderContext), (error) => error.code === 'CALCULATION_NOT_FOUND');
  });
  await t.test('foreign Matter cannot be attached to calculation', async () => {
    await assert.rejects(engine.calculate('deadline', { caseId: foreignCase, ruleCode: 'TEST_DEADLINE', triggerDate: '2026-06-01' }, creatorContext), (error) => error.code === 'MATTER_NOT_FOUND');
  });
  await t.test('interest uses two active rate periods and Decimal output', async () => {
    const run = await engine.calculate('interest', { caseId: personalCase, ruleCode: 'TEST_INTEREST', principal: '1000.10', currency: 'TRY', startDate: '2026-01-01', endDate: '2026-02-01' }, creatorContext); assert.equal(run.status, 'CALCULATED'); assert.equal(run.result_data.periods.length, 2); assert.match(run.result_data.totalInterest, /^\d+\.\d{2}$/);
  });
  await t.test('recalculation preserves old run and creates a child run', async () => {
    const child = await engine.recalculate(deadlineRun.id, creatorContext, 'recalc-one'); assert.notEqual(child.id, deadlineRun.id); assert.equal(child.parent_run_id, deadlineRun.id); assert.equal((await engine.runService.get(deadlineRun.id, creatorContext)).status, 'CONFIRMED');
  });
  await t.test('Draft link stores immutable draft version without editing text', async () => {
    const draft = await new DraftService({ db: appPool }).create({ caseId: personalCase, title: 'Calculation draft', draftType: 'PETITION' }, creatorContext); const before = await adminPool.query('SELECT plain_text FROM legal_draft_versions WHERE id = $1', [draft.current_version_id]); await engine.runService.linkDraft(deadlineRun.id, draft.id, creatorContext); const link = await adminPool.query("SELECT draft_version_id FROM calculation_links WHERE calculation_run_id = $1 AND relation_type = 'DRAFT_NOTE'", [deadlineRun.id]); const after = await adminPool.query('SELECT plain_text FROM legal_draft_versions WHERE id = $1', [draft.current_version_id]); assert.equal(link.rows[0].draft_version_id, draft.current_version_id); assert.equal(after.rows[0].plain_text, before.rows[0].plain_text);
  });
  await t.test('legacy notification adapter creates no unconfirmed legal deadline', async () => {
    assert.deepEqual(await DeadlineService.processNotification({ title: 'Gerekçeli Karar Tebliği', date: '2026-01-01' }, firmA, firmCase), []);
  });
  await t.test('VOID is a soft-delete behavior', async () => {
    const run = await engine.calculate('deadline', { ruleCode: 'TEST_DEADLINE', triggerDate: '2026-06-01', calendarCode: 'TR_GENERAL' }, creatorContext); const voided = await engine.runService.void(run.id, creatorContext); assert.equal(voided.status, 'VOID'); const row = await adminPool.query('SELECT status,deleted_at FROM calculation_runs WHERE id = $1', [run.id]); assert.equal(row.rows[0].status, 'VOID'); assert.ok(row.rows[0].deleted_at);
  });

  server = app.listen(0); await new Promise((resolve) => server.once('listening', resolve)); const baseUrl = `http://127.0.0.1:${server.address().port}`;
  await t.test('HTTP calculation writes content-free audit events', async () => {
    const result = await api(baseUrl, '/api/v1/calculations/deadline', { auth: token(creator), method: 'POST', headers: { 'Idempotency-Key': 'http-deadline' }, body: { caseId: personalCase, ruleCode: 'TEST_DEADLINE', triggerDate: '2026-06-01', calendarCode: 'TR_GENERAL' } }); assert.equal(result.response.status, 201); const logs = await adminPool.query('SELECT action,metadata::text AS metadata FROM audit_logs WHERE entity_id = $1', [result.data.data.id]); assert.ok(logs.rows.some((row) => row.action === 'CALCULATION_CREATED')); assert.ok(logs.rows.some((row) => row.action === 'CALCULATION_COMPLETED')); assert.ok(logs.rows.every((row) => !/principal|triggerDate|input_data/i.test(row.metadata)));
  });
  await t.test('rule administration API requires Admin role', async () => {
    const denied = await api(baseUrl, '/api/v1/calculation-rules', { auth: token(creator), method: 'POST', body: { ruleCode: 'API_RULE', name: 'API Rule', calculationType: 'CUSTOM' } }); assert.equal(denied.response.status, 403);
    const allowed = await api(baseUrl, '/api/v1/calculation-rules', { auth: token(admin), method: 'POST', body: { ruleCode: 'API_RULE', name: 'API Rule', calculationType: 'CUSTOM' } }); assert.equal(allowed.response.status, 201); assert.equal(allowed.data.data.status, 'DRAFT');
  });
  await t.test('migration 007 is recorded and idempotent', async () => {
    const row = await adminPool.query("SELECT checksum FROM schema_migrations WHERE version = '20260629_007_phase4_legal_calculations'"); assert.equal(row.rows[0].checksum.length, 64); assert.equal((await migrate({ dbPool: adminPool, logger: silentLogger })).applied, 0);
  });
});
