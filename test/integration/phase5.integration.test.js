const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const { getTestDatabaseUrl } = require('../helpers/testDatabase');

const databaseUrl = getTestDatabaseUrl();
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = databaseUrl;
process.env.JWT_SECRET = 'phase5-integration-only-secret';

const { migrate } = require('../../src/utils/migrate');
const { pool: appPool } = require('../../src/config/db');
const app = require('../../src/app');
const { buildAccessContext } = require('../../src/services/accessContext');
const { PracticeManagementService } = require('../../src/services/practice/PracticeManagementService');
const { CalculationRunService } = require('../../src/services/calculations/CalculationRunService');

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
  await adminPool.query(
    `INSERT INTO users (id, role_id, first_name, last_name, email, password_hash, is_active)
     VALUES ($1,$2,'Phase','Five',$3,'unused',true)`,
    [id, role.rows[0].id, email]
  );
  return id;
}

async function seedFirm(ownerId, name) {
  const id = crypto.randomUUID();
  await adminPool.query('INSERT INTO law_firms (id,name,owner_id,is_active) VALUES ($1,$2,$3,true)', [id, name, ownerId]);
  await adminPool.query("INSERT INTO firm_users (firm_id,user_id,firm_role,is_active) VALUES ($1,$2,'kurucu',true)", [id, ownerId]);
  return id;
}

async function addMember(firmId, userId, role) {
  await adminPool.query(
    'INSERT INTO firm_users (firm_id,user_id,firm_role,is_active) VALUES ($1,$2,$3,true) ON CONFLICT (firm_id,user_id) DO UPDATE SET firm_role = EXCLUDED.firm_role, is_active = true',
    [firmId, userId, role]
  );
}

async function seedCase({ firmId, title, plaintiff = 'Client A', defendant = 'Opponent B' }) {
  const id = crypto.randomUUID();
  await adminPool.query(
    `INSERT INTO cases (id, firm_id, law_firm_id, scope_type, konu, esas_no, mahkeme, taraf_davaci, taraf_davali, is_active)
     VALUES ($1,$2,$2,'ORGANIZATION',$3,'2026/5','Ankara Test Mahkemesi',$4,$5,true)`,
    [id, firmId, title, plaintiff, defendant]
  );
  return id;
}

async function ctx(userId) {
  return buildAccessContext(userId, { db: appPool });
}

function token(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '15m' });
}

async function api(baseUrl, endpoint, { auth, method = 'GET', body } = {}) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers: {
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : await response.text();
  return { response, data };
}

test('Phase 5 practice management, CRM, finance and portal', async (t) => {
  let server;
  t.after(async () => {
    await new Promise((resolve) => server?.close(resolve) || resolve());
    await appPool.end();
    await adminPool.end();
  });

  await resetDatabase();
  const service = new PracticeManagementService({ db: appPool });
  const runService = new CalculationRunService({ db: appPool });

  const owner = await seedUser('phase5-owner@example.test');
  const lawyer = await seedUser('phase5-lawyer@example.test');
  const intern = await seedUser('phase5-intern@example.test');
  const assistant = await seedUser('phase5-assistant@example.test');
  const outsider = await seedUser('phase5-outsider@example.test');
  const portalUser = await seedUser('phase5-portal@example.test');
  const firmA = await seedFirm(owner, 'Phase 5 Firm A');
  const firmB = await seedFirm(outsider, 'Phase 5 Firm B');
  await addMember(firmA, lawyer, 'avukat');
  await addMember(firmA, intern, 'stajyer');
  await addMember(firmA, assistant, 'asistan');
  const caseA = await seedCase({ firmId: firmA, title: 'Phase 5 primary matter', plaintiff: 'Atlas Ltd' });
  const caseOther = await seedCase({ firmId: firmA, title: 'Phase 5 other matter', plaintiff: 'Other Client' });
  const caseB = await seedCase({ firmId: firmB, title: 'Phase 5 foreign matter', plaintiff: 'Foreign Client' });
  const ownerCtx = await ctx(owner);
  const lawyerCtx = await ctx(lawyer);
  const internCtx = await ctx(intern);
  const assistantCtx = await ctx(assistant);
  const outsiderCtx = await ctx(outsider);
  const portalCtx = await ctx(portalUser);

  await t.test('migration 008 is recorded and idempotent', async () => {
    const row = await adminPool.query("SELECT checksum FROM schema_migrations WHERE version = '20260629_008_phase5_practice_management'");
    assert.equal(row.rows[0].checksum.length, 64);
    assert.equal((await migrate({ dbPool: adminPool, logger: silentLogger })).applied, 0);
  });

  let lead;
  await t.test('lead creation is tenant scoped', async () => {
    lead = await service.createLead({ organizationId: firmA, fullName: 'Atlas Holding', email: 'atlas@example.test', phone: '5551000', legalDomain: 'Commercial' }, ownerCtx);
    await service.createLead({ organizationId: firmB, fullName: 'Foreign Lead' }, outsiderCtx);
    const firmALeads = await service.listLeads(ownerCtx, { organizationId: firmA });
    assert.ok(firmALeads.some((item) => item.id === lead.id));
    assert.ok(firmALeads.every((item) => (item.organization_id || item.firm_id) === firmA));
  });

  let clientA;
  await t.test('organization clients are isolated by tenant', async () => {
    clientA = await service.createClient({ organizationId: firmA, fullName: 'Atlas Holding', email: 'client@example.test' }, ownerCtx);
    await service.createClient({ organizationId: firmB, fullName: 'Foreign Client', email: 'foreign@example.test' }, outsiderCtx);
    await assert.rejects(service.getClient(clientA.id, outsiderCtx), (error) => error.code === 'CLIENT_NOT_FOUND');
  });

  await t.test('personal client is visible only to owner', async () => {
    const personal = await service.createClient({ personal: true, fullName: 'Owner Personal' }, ownerCtx);
    assert.ok((await service.listClients(ownerCtx)).some((item) => item.id === personal.id));
    assert.ok(!(await service.listClients(lawyerCtx)).some((item) => item.id === personal.id));
  });

  await t.test('conflict check never returns another tenant data', async () => {
    const check = await service.createConflictCheck({ organizationId: firmA, queryTerms: ['Foreign Client'] }, ownerCtx);
    assert.equal(check.status, 'PENDING');
    assert.equal(check.matches.length, 0);
  });

  let conflict;
  await t.test('potential conflict is not automatically CLEAR', async () => {
    conflict = await service.createConflictCheck({ organizationId: firmA, leadId: lead.id, queryTerms: ['Atlas Holding'] }, ownerCtx);
    assert.equal(conflict.status, 'POTENTIAL_CONFLICT');
    assert.ok(conflict.matches.length >= 1);
  });

  await t.test('conflict override is denied for unauthorized user', async () => {
    await assert.rejects(
      service.reviewConflictCheck(conflict.id, { status: 'OVERRIDDEN', reviewNote: 'business decision' }, internCtx),
      (error) => error.code === 'PERMISSION_DENIED'
    );
  });

  await t.test('authorized conflict review can mark CLEAR', async () => {
    conflict = await service.reviewConflictCheck(conflict.id, { status: 'CLEAR', reviewNote: 'manual review complete' }, lawyerCtx);
    assert.equal(conflict.status, 'CLEAR');
  });

  let converted;
  await t.test('lead conversion is transactionally idempotent', async () => {
    converted = await service.convertLead(lead.id, { conflictCheckId: conflict.id, clientId: clientA.id }, ownerCtx);
    const again = await service.convertLead(lead.id, { conflictCheckId: conflict.id, clientId: clientA.id }, ownerCtx);
    assert.equal(again.lead.converted_case_id, converted.case.id);
    const counts = await adminPool.query(
      'SELECT (SELECT count(*)::int FROM matter_clients WHERE case_id = $1) AS matter_clients, (SELECT count(*)::int FROM leads WHERE converted_case_id = $1) AS leads',
      [converted.case.id]
    );
    assert.equal(counts.rows[0].matter_clients, 1);
    assert.equal(counts.rows[0].leads, 1);
  });

  await t.test('lead conversion requires reviewed conflict result', async () => {
    const blockedLead = await service.createLead({ organizationId: firmA, fullName: 'Blocked Lead' }, ownerCtx);
    await assert.rejects(service.convertLead(blockedLead.id, {}, ownerCtx), (error) => error.code === 'CONFLICT_REVIEW_REQUIRED');
  });

  await t.test('matter team member can be assigned inside tenant', async () => {
    const member = await service.addTeamMember(caseA, { userId: lawyer, role: 'LAWYER', hourlyRateSnapshot: '100.00' }, ownerCtx);
    assert.equal(member.user_id, lawyer);
  });

  await t.test('task cannot be assigned to another tenant user', async () => {
    await assert.rejects(service.createTask(caseA, { title: 'Foreign assignment', assignedTo: outsider }, ownerCtx), (error) => error.code === 'ASSIGNEE_OUT_OF_TENANT');
  });

  await t.test('completed task receives completed_at', async () => {
    const task = await service.createTask(caseA, { title: 'Complete filing', status: 'COMPLETED' }, ownerCtx);
    assert.ok(task.completed_at);
  });

  await t.test('unconfirmed calculation cannot create deadline', async () => {
    const runId = crypto.randomUUID();
    await adminPool.query(
      `INSERT INTO calculation_runs (id,user_id,organization_id,case_id,calculation_type,status,result_data,effective_at)
       VALUES ($1,$2,$3,$4,'DEADLINE','CALCULATED',$5::jsonb,CURRENT_DATE)`,
      [runId, owner, firmA, caseA, JSON.stringify({ finalDate: '2026-07-01' })]
    );
    await assert.rejects(runService.createDeadline(runId, ownerCtx), (error) => error.code === 'CALCULATION_NOT_CONFIRMED');
  });

  await t.test('calculation deadline preserves rule version link', async () => {
    const ruleSetId = crypto.randomUUID();
    const ruleVersionId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    await adminPool.query("INSERT INTO legal_rule_sets (id,rule_code,name,calculation_type,status) VALUES ($1,'PHASE5_RULE','Phase5 Rule','DEADLINE','ACTIVE')", [ruleSetId]);
    await adminPool.query(
      `INSERT INTO legal_rule_versions (id,rule_set_id,version_number,effective_from,status,rule_definition,created_by,checksum)
       VALUES ($1,$2,1,CURRENT_DATE,'ACTIVE',$3::jsonb,$4,$5)`,
      [ruleVersionId, ruleSetId, JSON.stringify({ steps: [{ operation: 'ADD_DAYS', value: 1 }] }), owner, 'a'.repeat(64)]
    );
    await adminPool.query(
      `INSERT INTO calculation_runs (id,user_id,organization_id,case_id,calculation_type,rule_set_id,rule_version_id,status,result_data,rule_snapshot,effective_at)
       VALUES ($1,$2,$3,$4,'DEADLINE',$5,$6,'CONFIRMED',$7::jsonb,$8::jsonb,CURRENT_DATE)`,
      [runId, owner, firmA, caseA, ruleSetId, ruleVersionId, JSON.stringify({ finalDate: '2026-07-02' }), JSON.stringify({ rule: { versionNumber: 1 } })]
    );
    const deadline = await runService.createDeadline(runId, ownerCtx);
    assert.equal(deadline.rule_version_id, ruleVersionId);
    const canonical = await adminPool.query('SELECT rule_version_id FROM matter_deadlines WHERE id = $1', [deadline.id]);
    assert.equal(canonical.rows[0].rule_version_id, ruleVersionId);
  });

  await t.test('notification idempotency prevents duplicates', async () => {
    await service.notifications.notify({ organizationId: firmA, eventType: 'TASK_ASSIGNED', title: 'Task', idempotencyKey: 'phase5-notify', recipientUserId: lawyer });
    await service.notifications.notify({ organizationId: firmA, eventType: 'TASK_ASSIGNED', title: 'Task again', idempotencyKey: 'phase5-notify', recipientUserId: lawyer });
    const count = await adminPool.query("SELECT count(*)::int AS count FROM practice_notifications WHERE idempotency_key = 'phase5-notify'");
    assert.equal(count.rows[0].count, 1);
  });

  await t.test('one user cannot start two active timers', async () => {
    const activeTimer = await service.createTimeEntry({ caseId: caseA, startedAt: '2026-06-29T10:00:00Z', description: 'Timer one' }, lawyerCtx);
    await assert.rejects(service.createTimeEntry({ caseId: caseA, startedAt: '2026-06-29T10:05:00Z', description: 'Timer two' }, lawyerCtx));
    const stopped = await service.stopTimeEntry(activeTimer.id, { endedAt: '2026-06-29T10:30:00Z' }, lawyerCtx);
    assert.equal(stopped.duration_minutes, 30);
    const nextTimer = await service.createTimeEntry({ caseId: caseA, startedAt: '2026-06-29T10:31:00Z', endedAt: '2026-06-29T10:40:00Z', description: 'Timer after stop' }, lawyerCtx);
    assert.equal(nextTimer.duration_minutes, 9);
  });

  let approvedTimeEntry;
  await t.test('time entry keeps hourly rate snapshot', async () => {
    approvedTimeEntry = await service.createTimeEntry({ caseId: caseA, startedAt: '2026-06-29T11:00:00Z', endedAt: '2026-06-29T12:00:00Z', description: 'Drafting' }, lawyerCtx);
    assert.equal(String(approvedTimeEntry.hourly_rate_snapshot), '100.00');
    await service.addTeamMember(caseA, { userId: lawyer, role: 'LAWYER', hourlyRateSnapshot: '500.00' }, ownerCtx);
    const row = await adminPool.query('SELECT hourly_rate_snapshot FROM time_entries WHERE id = $1', [approvedTimeEntry.id]);
    assert.equal(String(row.rows[0].hourly_rate_snapshot), '100.00');
  });

  await t.test('invoiced time entry cannot be silently changed', async () => {
    approvedTimeEntry = await service.approveTimeEntry(approvedTimeEntry.id, ownerCtx);
    const invoice = await service.createInvoice({ organizationId: firmA, caseId: caseA, clientId: clientA.id, items: [{ sourceType: 'TIME_ENTRY', sourceId: approvedTimeEntry.id }] }, ownerCtx);
    await service.issueInvoice(invoice.id, ownerCtx);
    await assert.rejects(service.updateTimeEntry(approvedTimeEntry.id, { description: 'Changed' }, lawyerCtx), (error) => error.code === 'INVOICED_ENTRY_IMMUTABLE');
  });

  let approvedExpense;
  await t.test('expense from another matter cannot be added to invoice', async () => {
    approvedExpense = await service.createExpense({ caseId: caseOther, amount: '250.00', description: 'Other matter expense' }, ownerCtx);
    await service.approveExpense(approvedExpense.id, ownerCtx);
    await assert.rejects(
      service.createInvoice({ organizationId: firmA, caseId: caseA, clientId: clientA.id, items: [{ sourceType: 'EXPENSE', sourceId: approvedExpense.id }] }, ownerCtx),
      (error) => error.code === 'INVOICE_SCOPE_MISMATCH'
    );
  });

  let customInvoice;
  await t.test('invoice totals are calculated server side', async () => {
    customInvoice = await service.createInvoice({
      organizationId: firmA,
      clientId: clientA.id,
      caseId: caseA,
      invoiceNumber: 'PHASE5-001',
      items: [{ sourceType: 'CUSTOM', description: 'Fixed fee', unitPrice: '100.00', quantity: 1, taxRate: '20' }],
    }, ownerCtx);
    assert.equal(String(customInvoice.subtotal), '100.00');
    assert.equal(String(customInvoice.tax_total), '20.00');
    assert.equal(String(customInvoice.total), '120.00');
  });

  await t.test('invoice number is unique inside tenant', async () => {
    await assert.rejects(
      service.createInvoice({ organizationId: firmA, invoiceNumber: 'PHASE5-001', clientId: clientA.id, caseId: caseA, items: [{ sourceType: 'CUSTOM', description: 'Duplicate', unitPrice: '10.00' }] }, ownerCtx)
    );
  });

  await t.test('partial payment updates balance', async () => {
    await service.issueInvoice(customInvoice.id, ownerCtx);
    await service.recordPayment(customInvoice.id, { amount: '50.00', paymentMethod: 'bank' }, ownerCtx);
    const row = await adminPool.query('SELECT paid_total,balance,status FROM invoices WHERE id = $1', [customInvoice.id]);
    assert.equal(String(row.rows[0].paid_total), '50.00');
    assert.equal(String(row.rows[0].balance), '70.00');
    assert.equal(row.rows[0].status, 'PARTIALLY_PAID');
  });

  await t.test('paid invoice cannot be normally deleted', async () => {
    await service.recordPayment(customInvoice.id, { amount: '70.00', paymentMethod: 'bank' }, ownerCtx);
    await assert.rejects(service.deleteInvoice(customInvoice.id, ownerCtx), (error) => error.code === 'PAID_INVOICE_IMMUTABLE');
  });

  let portalInvite;
  await t.test('portal invite and shared item access are explicit', async () => {
    const portalCaseId = converted.case.id;
    portalInvite = await service.invitePortal({ clientId: clientA.id, caseId: portalCaseId }, ownerCtx);
    await service.acceptPortalInvitation(portalInvite.invitationToken, portalCtx);
    await assert.rejects(
      service.acceptPortalInvitation(portalInvite.invitationToken, outsiderCtx),
      (error) => error.code === 'PORTAL_INVITE_NOT_FOUND'
    );
    await service.createMatterUpdate(portalCaseId, { title: 'Internal', content: 'Hidden', visibility: 'INTERNAL' }, ownerCtx);
    await service.createMatterUpdate(portalCaseId, { title: 'Unshared visible', content: 'Still hidden', visibility: 'CLIENT_VISIBLE' }, ownerCtx);
    const visibleUpdate = await service.createMatterUpdate(portalCaseId, { title: 'Visible', content: 'Shown', visibility: 'CLIENT_VISIBLE' }, ownerCtx);
    await service.sharePortalItem({ caseId: portalCaseId, clientId: clientA.id, itemType: 'UPDATE', itemId: visibleUpdate.id, title: visibleUpdate.title }, ownerCtx);
    const portalCase = await service.getPortalCase(portalCaseId, portalCtx);
    assert.ok(portalCase.updates.some((item) => item.title === 'Visible'));
    assert.ok(!portalCase.updates.some((item) => item.title === 'Internal'));
    assert.ok(!portalCase.updates.some((item) => item.title === 'Unshared visible'));
  });

  await t.test('portal user cannot view another matter', async () => {
    await assert.rejects(service.getPortalCase(caseOther, portalCtx), (error) => error.code === 'PORTAL_CASE_NOT_FOUND');
  });

  await t.test('portal document download requires explicit sharing', async () => {
    const portalCaseId = converted.case.id;
    const docId = crypto.randomUUID();
    await adminPool.query(
      `INSERT INTO case_documents (id,case_id,firm_id,document_name,file_url,file_name,title,uploaded_by)
       VALUES ($1,$2,$3,'doc.pdf','/tmp/doc.pdf','doc.pdf','Doc',$4)`,
      [docId, portalCaseId, firmA, owner]
    );
    await assert.rejects(service.getPortalDocument(portalCaseId, docId, portalCtx), (error) => error.code === 'PORTAL_DOCUMENT_NOT_SHARED');
    await service.sharePortalItem({ caseId: portalCaseId, clientId: clientA.id, itemType: 'DOCUMENT', itemId: docId, title: 'Doc' }, ownerCtx);
    assert.equal((await service.getPortalDocument(portalCaseId, docId, portalCtx)).id, docId);
  });

  await t.test('revoked portal access closes immediately', async () => {
    await service.revokePortalAccess(portalInvite.access.id, ownerCtx);
    await assert.rejects(service.getPortalCase(converted.case.id, portalCtx), (error) => error.code === 'PORTAL_CASE_NOT_FOUND');
  });

  await t.test('email failure does not rollback portal invite', async () => {
    process.env.PRACTICE_FAKE_EMAIL_FAIL = 'true';
    const clientB = await service.createClient({ organizationId: firmA, fullName: 'Email Failure Client', email: 'fail@example.test' }, ownerCtx);
    await adminPool.query('INSERT INTO matter_clients (case_id, client_id, relationship_type, is_primary) VALUES ($1,$2,$3,false)', [caseOther, clientB.id, 'CLIENT']);
    const invite = await service.invitePortal({ clientId: clientB.id, caseId: caseOther }, ownerCtx);
    process.env.PRACTICE_FAKE_EMAIL_FAIL = 'false';
    const access = await adminPool.query('SELECT id FROM client_portal_access WHERE id = $1', [invite.access.id]);
    const queue = await adminPool.query('SELECT count(*)::int AS count FROM outbound_email_queue');
    assert.equal(access.rowCount, 1);
    assert.equal(queue.rows[0].count, 1);
  });

  await t.test('backend permission denies intern finance operation', async () => {
    await assert.rejects(
      service.createInvoice({ organizationId: firmA, clientId: clientA.id, caseId: caseA, items: [{ sourceType: 'CUSTOM', description: 'Denied', unitPrice: '1.00' }] }, internCtx),
      (error) => error.code === 'PERMISSION_DENIED'
    );
    await assert.rejects(
      service.invitePortal({ clientId: clientA.id, caseId: caseA }, assistantCtx),
      (error) => error.code === 'PERMISSION_DENIED'
    );
  });

  await t.test('legacy CRM endpoint still works after canonical migration', async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const result = await api(baseUrl, `/api/firms/${firmA}/crm/leads`, {
      auth: token(owner),
      method: 'POST',
      body: { name: 'Legacy Lead', subject: 'Legacy CRM', estimated_value: 10 },
    });
    assert.equal(result.response.status, 201);
    assert.equal(result.data.firm_id, firmA);
  });

  await t.test('dashboard summary returns practice metrics', async () => {
    const summary = await service.dashboard(ownerCtx, firmA);
    assert.ok(summary.active_matters >= 2);
    assert.ok(summary.open_invoices >= 0);
    assert.ok(summary.new_leads >= 0);
  });
});
