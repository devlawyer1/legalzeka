const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { getTestDatabaseUrl } = require('../helpers/testDatabase');

const databaseUrl = getTestDatabaseUrl();
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = databaseUrl;
process.env.JWT_SECRET = 'phase8-integration-only-secret';
process.env.CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 8).toString('base64');
process.env.CORS_ORIGINS = 'https://allowed.example.test';
process.env.MIGRATION_LOCK_TIMEOUT_MS = '250';

const { migrate, migrationDescriptor, preflight, status, acquireLock } = require('../../src/utils/migrate');
const { pool: appPool } = require('../../src/config/db');
const app = require('../../src/app');
const { AuthSessionService } = require('../../src/services/enterprise/AuthSessionService');
const { MfaService, totp } = require('../../src/services/enterprise/MfaService');
const { OidcService } = require('../../src/services/enterprise/OidcService');
const { SeatService } = require('../../src/services/enterprise/SeatService');
const { RedisProvider } = require('../../src/services/redis/RedisProvider');
const { S3StorageProvider } = require('../../src/services/storage/S3StorageProvider');
const LocalStorageProvider = require('../../src/services/storage/LocalStorageProvider');
const { StorageMigrationService } = require('../../src/services/storage/StorageMigrationService');
const { SMTPEmailProvider } = require('../../src/services/providers/SMTPEmailProvider');
const { GoogleCalendarProvider } = require('../../src/services/providers/GoogleCalendarProvider');
const { LlmProviderGuard } = require('../../src/services/providers/LlmProviderGuard');
const { NotificationWorker } = require('../../src/workers/notificationWorker');
const { SchedulerWorker } = require('../../src/workers/schedulerWorker');
const { BackupService, checksumFile } = require('../../src/services/operations/BackupService');
const { PrivacyService } = require('../../src/services/operations/PrivacyService');
const { OperationsService } = require('../../src/services/operations/OperationsService');
const AuditLogService = require('../../src/services/AuditLogService');
const { assertSafeOutboundUrl, assertSafeRedirect } = require('../../src/services/security/networkPolicy');
const { validateDocumentResourceBudget } = require('../../src/services/security/fileValidationService');
const { buildAccessContext } = require('../../src/services/accessContext');
const { EducationAccessService } = require('../../src/services/education/EducationAccessService');
const { PracticeManagementService } = require('../../src/services/practice/PracticeManagementService');
const { encrypt } = require('../../src/services/enterprise/secureValue');
const { RuleVersionService } = require('../../src/services/calculations/RuleVersionService');
const { csrfProtection } = require('../../src/middleware/csrf');

const adminPool = new Pool({ connectionString: databaseUrl });
const silent = { log() {} };

class FakeRedisClient {
  constructor() { this.data = new Map(); this.isReady = true; this.isOpen = true; this.counts = new Map(); }
  async get(key) { return this.data.get(key) ?? null; }
  async set(key, value, options = {}) { if (options.NX && this.data.has(key)) return null; this.data.set(key, value); return 'OK'; }
  async del(key) { return this.data.delete(key) ? 1 : 0; }
  async ping() { return 'PONG'; }
  async quit() { this.isOpen = false; }
  async eval(script, { keys, arguments: args }) {
    if (script.includes("redis.call('INCR'")) { const count = (this.counts.get(keys[0]) || 0) + 1; this.counts.set(keys[0], count); return [count, Number(args[0])]; }
    if (this.data.get(keys[0]) === args[0]) return this.del(keys[0]);
    return 0;
  }
}

async function reset() {
  await adminPool.query('DROP SCHEMA IF EXISTS public CASCADE'); await adminPool.query('CREATE SCHEMA public');
  await migrate({ dbPool: adminPool, logger: silent });
}

async function seedUser(email, roleName = 'Users') {
  const role = await adminPool.query('SELECT id FROM roles WHERE role_name=$1', [roleName]); const id = crypto.randomUUID();
  await adminPool.query("INSERT INTO users(id,role_id,first_name,last_name,email,password_hash,is_active) VALUES($1,$2,'Phase','Eight',$3,'unused',true)", [id, role.rows[0].id, email]);
  return id;
}

async function seedFirm(ownerId, name) {
  const id = crypto.randomUUID();
  await adminPool.query('INSERT INTO law_firms(id,name,owner_id,is_active) VALUES($1,$2,$3,true)', [id, name, ownerId]);
  await adminPool.query("INSERT INTO firm_users(firm_id,user_id,firm_role,is_active) VALUES($1,$2,'kurucu',true)", [id, ownerId]); return id;
}

function bearer(userId, role = 'Users') { return jwt.sign({ userId, role }, process.env.JWT_SECRET, { expiresIn: '15m' }); }
async function api(base, endpoint, options = {}) {
  const response = await fetch(`${base}${endpoint}`, { method: options.method || 'GET', headers: { ...(options.auth ? { Authorization: `Bearer ${options.auth}` } : {}), ...(options.origin ? { Origin: options.origin } : {}), ...(options.headers || {}), ...(options.body ? { 'Content-Type': 'application/json' } : {}) }, body: options.body ? JSON.stringify(options.body) : undefined });
  return { response, data: await response.json().catch(() => null) };
}

test('Phase 8 enterprise security and operations', async (t) => {
  let server; const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'legalzeka-phase8-'));
  t.after(async () => { await new Promise((resolve) => server?.close(resolve) || resolve()); await fs.promises.rm(tempRoot, { recursive: true, force: true }); await appPool.end(); await adminPool.end(); });
  await reset();
  const admin = await seedUser('phase8-admin@example.test', 'Admin'); const owner = await seedUser('phase8-owner@example.test'); const member = await seedUser('phase8-member@example.test'); const outsider = await seedUser('phase8-outsider@example.test');
  const firm = await seedFirm(owner, 'Phase 8 Firm'); const foreignFirm = await seedFirm(outsider, 'Foreign Firm');
  const institution = crypto.randomUUID(); const foreignInstitution = crypto.randomUUID();
  await adminPool.query("INSERT INTO institutions(id,name,slug,institution_type,seat_limit) VALUES($1,'Phase 8 University','phase8-university','UNIVERSITY',2),($2,'Foreign Institution','foreign-institution','ENTERPRISE',5)", [institution, foreignInstitution]);
  await adminPool.query("INSERT INTO institution_memberships(institution_id,user_id,role,status,joined_at) VALUES($1,$2,'ADMIN','ACTIVE',now()),($3,$4,'ADMIN','ACTIVE',now())", [institution, owner, foreignInstitution, outsider]);
  const fakeRedisClient = new FakeRedisClient(); const redis = new RedisProvider({ client: fakeRedisClient, prefix: 'phase8' });

  await t.test('1 migration 011 is checksummed, verified and idempotent', async () => {
    const row = await adminPool.query("SELECT checksum,verified_at FROM schema_migrations WHERE version='20260630_011_phase8_enterprise_operations'");
    assert.equal(row.rows[0].checksum.length, 64); assert.ok(row.rows[0].verified_at); assert.equal((await migrate({ dbPool: adminPool, logger: silent })).applied, 0);
  });

  const sessionService = new AuthSessionService({ db: appPool }); let firstSession; let rotated;
  await t.test('2 refresh token rotation changes both tokens', async () => {
    firstSession = await sessionService.create({ id: owner, email: 'phase8-owner@example.test', role: 'Users' });
    rotated = await sessionService.rotate(firstSession.refreshToken);
    assert.notEqual(rotated.refreshToken, firstSession.refreshToken); assert.notEqual(rotated.accessToken, firstSession.accessToken);
  });
  await t.test('3 refresh token reuse compromises the token family', async () => {
    await assert.rejects(sessionService.rotate(firstSession.refreshToken), (error) => error.code === 'SESSION_COMPROMISED');
    const row = await adminPool.query('SELECT status FROM auth_sessions WHERE id=$1', [firstSession.session.id]); assert.equal(row.rows[0].status, 'COMPROMISED');
  });
  await t.test('4 CSRF blocks cookie-authenticated writes without matching token', async () => {
    const req = { method: 'POST', headers: { cookie: 'lz_refresh=abc; lz_csrf=expected' }, get(name) { return this.headers[name.toLowerCase()]; }, requestId: 'csrf-test' };
    let status; let body; csrfProtection(req, { status(code) { status = code; return this; }, json(value) { body = value; } }, () => assert.fail('must not pass'));
    assert.equal(status, 403); assert.equal(body.code, 'CSRF_INVALID');
  });
  await t.test('5 CORS rejects origins outside the explicit allowlist', async () => {
    server = app.listen(0); await new Promise((resolve) => server.once('listening', resolve)); const base = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${base}/health/live`, { headers: { Origin: 'https://denied.example.test' } }); assert.equal(response.status, 403);
  });

  const mfa = new MfaService({ db: appPool }); let enrollment;
  await t.test('6 TOTP enrollment and verification works', async () => {
    enrollment = await mfa.beginEnrollment(member, 'phase8-member@example.test'); assert.equal(await mfa.enable(member, totp(enrollment.secret)), true); assert.equal(await mfa.verify(member, totp(enrollment.secret)), true);
  });
  await t.test('7 recovery code can be used only once', async () => {
    assert.equal(await mfa.verify(member, enrollment.recoveryCodes[0]), true); assert.equal(await mfa.verify(member, enrollment.recoveryCodes[0]), false);
  });
  await t.test('8 revoked session immediately fails active-session validation', async () => {
    const created = await sessionService.create({ id: member, email: 'phase8-member@example.test', role: 'Users' }); await sessionService.revoke(member, created.session.id);
    await assert.rejects(sessionService.assertActive(created.session.id, member), (error) => error.code === 'AUTH_REQUIRED');
  });
  await t.test('9 distributed login limiter shares counters', async () => {
    const key = redis.key('rate', ['login','same']); assert.equal((await redis.rateLimit(key, { limit: 1, windowSeconds: 60 })).allowed, true); assert.equal((await redis.rateLimit(key, { limit: 1, windowSeconds: 60 })).allowed, false);
  });
  await t.test('10 structured logging omits secret fields', async () => {
    const { safeAttributes } = require('../../src/services/observability'); assert.deepEqual(safeAttributes({ method: 'POST', secret: 'never', prompt: 'never' }), { method: 'POST' });
  });

  const providerId = crypto.randomUUID();
  await adminPool.query(`INSERT INTO identity_provider_configs(id,institution_id,provider_type,name,issuer,client_id,encrypted_client_secret,domains,status,metadata)
    VALUES($1,$2,'OIDC','Test OIDC','https://id.example.test','client',$3,ARRAY['example.test'],'ACTIVE',$4::jsonb)`, [providerId, institution, encrypt('client-secret'), JSON.stringify({ redirectUris: ['https://app.example.test/callback'] })]);
  await t.test('11 OIDC authorization uses state nonce and PKCE', async () => {
    const service = new OidcService({ db: appPool, redis, fetchImpl: async () => ({ ok: true, json: async () => ({ issuer: 'https://id.example.test', authorization_endpoint: 'https://id.example.test/auth', token_endpoint: 'https://id.example.test/token', jwks_uri: 'https://id.example.test/jwks' }) }) });
    const started = await service.begin(providerId, 'https://app.example.test/callback'); assert.match(started.authorizationUrl, /code_challenge=/); assert.match(started.authorizationUrl, /nonce=/); assert.ok(started.state.length > 30);
  });
  await t.test('12 OIDC discovery with wrong issuer is rejected', async () => {
    const service = new OidcService({ db: appPool, redis, fetchImpl: async () => ({ ok: true, json: async () => ({ issuer: 'https://evil.test', authorization_endpoint: 'x', token_endpoint: 'y', jwks_uri: 'z' }) }) });
    await assert.rejects(service.begin(providerId, 'https://app.example.test/callback'), (error) => error.code === 'OIDC_METADATA_INVALID');
  });
  await t.test('13 OIDC never auto-links an account by matching email', async () => {
    const service = new OidcService({ db: appPool, redis });
    service.discovery = async () => ({ issuer: 'https://id.example.test', authorization_endpoint: 'https://id.example.test/auth', token_endpoint: 'https://id.example.test/token', jwks_uri: 'https://id.example.test/jwks' });
    service.fetch = async () => ({ ok: true, json: async () => ({ id_token: 'fake' }) });
    service.verifyIdToken = async (_, __, ___) => ({ sub: 'external-no-link', email: 'phase8-owner@example.test', nonce: pendingNonce });
    const started = await service.begin(providerId, 'https://app.example.test/callback');
    const pending = JSON.parse(fakeRedisClient.data.get(redis.key('oauth-state', [require('../../src/services/enterprise/secureValue').hashOpaque(started.state)]))); const pendingNonce = pending.nonce;
    await assert.rejects(service.callback({ providerId, state: started.state, code: 'code' }), (error) => error.code === 'OIDC_ACCOUNT_LINK_REQUIRED');
  });

  const seatService = new SeatService({ db: appPool });
  await t.test('14 institution seat limit cannot be exceeded', async () => {
    await seatService.assign(institution, { userId: member, seatType: 'STUDENT', status: 'ACTIVE' }, { userId: owner });
    await seatService.assign(institution, { userId: owner, seatType: 'ADMIN', status: 'ACTIVE' }, { userId: owner });
    await assert.rejects(seatService.assign(institution, { userId: admin, seatType: 'STAFF' }, { userId: owner }), (error) => error.code === 'SEAT_LIMIT_REACHED');
  });
  await t.test('15 seat revocation removes access without deleting data', async () => {
    const seat = await adminPool.query("SELECT id FROM subscription_seats WHERE institution_id=$1 AND user_id=$2", [institution, member]); const revoked = await seatService.revoke(institution, seat.rows[0].id, { userId: owner }); assert.equal(revoked.status, 'REVOKED');
  });
  await t.test('16 another institution administrator cannot manage the seat', async () => {
    const seat = await adminPool.query("SELECT id FROM subscription_seats WHERE institution_id=$1 AND user_id=$2", [institution, owner]); await assert.rejects(seatService.revoke(institution, seat.rows[0].id, { userId: outsider }), (error) => error.code === 'ACCESS_DENIED');
  });

  let fakeObject; const fakeS3 = { config: {}, async send(command) { const name = command.constructor.name; if (name === 'HeadObjectCommand') return { ContentLength: fakeObject.size, Metadata: { sha256: fakeObject.sha256 } }; if (name === 'GetObjectCommand') return { Body: Readable.from(fakeObject.body), ContentLength: fakeObject.size, Metadata: { sha256: fakeObject.sha256 } }; return {}; } };
  const s3Root = path.join(tempRoot, 's3tmp'); process.env.STORAGE_TEMP_DIR = s3Root; const s3 = new S3StorageProvider({ client: fakeS3, bucket: 'private-test', prefix: 'objects', authorizeSignedUrl: async () => false, uploadFactory: () => ({ done: async () => ({}) }) });
  await t.test('17 S3 private upload and stream download preserve hash', async () => {
    const source = path.join(s3.tempDir, 'source.upload'); await fs.promises.writeFile(source, 'private-storage-data'); const sha256 = crypto.createHash('sha256').update('private-storage-data').digest('hex'); fakeObject = { body: Buffer.from('private-storage-data'), size: 20, sha256 };
    const stored = await s3.store({ sourcePath: source, storageKey: s3.createStorageKey('txt'), expectedSha256: sha256 }); const opened = await s3.openReadStream(stored.storageKey); let body = ''; for await (const chunk of opened.stream) body += chunk; assert.equal(body, 'private-storage-data'); assert.equal(stored.sha256, sha256);
  });
  await t.test('18 signed URL requires tenant authorization', async () => { await assert.rejects(s3.signedDownloadUrl('objects/00000000-0000-4000-8000-000000000000.txt', { userId: outsider }), (error) => error.code === 'ACCESS_DENIED'); });
  await t.test('19 local-to-S3 migration is idempotent', async () => {
    const source = new LocalStorageProvider({ rootDir: path.join(tempRoot, 'local') }); const key = source.createStorageKey('txt'); await fs.promises.writeFile(path.join(source.tempDir, 'migrate.upload'), 'migrate-once'); await source.store({ sourcePath: path.join(source.tempDir, 'migrate.upload'), storageKey: key });
    const destination = { tempDir: path.join(tempRoot, 'dest'), createStorageKey: () => 'objects/destination', async store({ sourcePath, expectedSha256 }) { await fs.promises.mkdir(this.tempDir, { recursive: true }); return { storageKey: 'objects/destination', sha256: expectedSha256, size: (await fs.promises.stat(sourcePath)).size }; } }; await fs.promises.mkdir(destination.tempDir, { recursive: true });
    const service = new StorageMigrationService({ db: appPool, source, destination }); const first = await service.migrate(key, { dryRun: false }); const second = await service.migrate(key, { dryRun: false }); assert.equal(first.destinationKey, 'objects/destination'); assert.equal(second.duplicate, true);
  });
  await t.test('20 source remains when migration hash verification fails', async () => {
    const source = new LocalStorageProvider({ rootDir: path.join(tempRoot, 'local-fail') }); const key = source.createStorageKey('txt'); const temp = path.join(source.tempDir, 'fail.upload'); await fs.promises.writeFile(temp, 'retain-me'); await source.store({ sourcePath: temp, storageKey: key });
    const destination = { tempDir: path.join(tempRoot, 'dest-fail'), createStorageKey: () => 'objects/fail', async store() { throw Object.assign(new Error('bad'), { code: 'STORAGE_HASH_MISMATCH' }); } }; await fs.promises.mkdir(destination.tempDir, { recursive: true });
    await assert.rejects(new StorageMigrationService({ db: appPool, source, destination }).migrate(key, { dryRun: false, deleteSource: true })); assert.equal(await source.exists(key), true);
  });
  await t.test('21 Redis cache keys separate tenants', () => { assert.notEqual(redis.key('search', [firm,'user','case']), redis.key('search', [foreignFirm,'user','case'])); });
  await t.test('22 scheduler lock blocks duplicate workers', async () => { const key = redis.key('scheduler-lock',['test']); const first = await redis.acquireLock(key, 5000); assert.ok(first); assert.equal(await redis.acquireLock(key, 5000), null); await redis.releaseLock(key, first); });
  await t.test('23 critical Redis outage fails closed', async () => { const down = new RedisProvider({ client: { isReady: false, isOpen: true, async connect() { throw new Error('down'); } } }); await assert.rejects(down.rateLimit('key', { limit: 1, windowSeconds: 60, critical: true }), (error) => error.code === 'PROVIDER_UNAVAILABLE'); });

  await t.test('24 SMTP timeout is moved to retry queue', async () => {
    const notification = crypto.randomUUID(); await adminPool.query("INSERT INTO practice_notifications(id,recipient_user_id,event_type,title,idempotency_key,status) VALUES($1,$2,'TEST','Timeout','phase8-timeout','QUEUED')", [notification, owner]); await adminPool.query("INSERT INTO outbound_email_queue(notification_id,to_email,subject,body,status,idempotency_key) VALUES($1,'owner@example.test','Timeout','Body','QUEUED','phase8-timeout')", [notification]);
    const provider = new SMTPEmailProvider({ transporter: { sendMail: () => new Promise(() => {}), verify: async () => true }, redis, config: { SMTP_FROM: 'no-reply@example.test', SMTP_TIMEOUT_MS: '5' } }); const result = await new NotificationWorker({ db: appPool, provider }).runOnce(); assert.equal(result.status, 'RETRY');
  });
  await t.test('25 missing provider credentials never use a fake fallback', async () => { const provider = new SMTPEmailProvider({ config: {} }); assert.equal(provider.status(), 'UNCONFIGURED'); await assert.rejects(provider.send({ idempotencyKey: 'x' }), (error) => error.code === 'PROVIDER_UNCONFIGURED'); });
  await t.test('26 calendar refresh preserves encrypted refresh token', async () => {
    const http = { async post() { return { data: { access_token: 'new-access', expires_in: 3600 } }; } }; const provider = new GoogleCalendarProvider({ http, redis, clientId: 'id', clientSecret: 'secret' }); const updated = JSON.parse(require('../../src/services/enterprise/secureValue').decrypt(await provider.refresh(encrypt(JSON.stringify({ refresh_token: 'refresh', access_token: 'old' }))))); assert.equal(updated.refresh_token, 'refresh'); assert.equal(updated.access_token, 'new-access');
  });
  await t.test('27 calendar event creation is idempotent', async () => {
    let calls = 0; const provider = new GoogleCalendarProvider({ http: { async request() { calls += 1; return { data: { id: 'event-1' } }; } }, redis, clientId: 'id', clientSecret: 'secret' }); const options = { encryptedTokens: encrypt(JSON.stringify({ access_token: 'token' })), idempotencyKey: 'event-key', approvedByUser: true }; await provider.createEvent('primary', { summary: 'Test' }, options); const duplicate = await provider.createEvent('primary', { summary: 'Test' }, options); assert.equal(calls, 1); assert.equal(duplicate.duplicate, true);
  });
  await t.test('28 calendar mutation requires explicit user approval', async () => { const provider = new GoogleCalendarProvider({ http: {}, redis, clientId: 'id', clientSecret: 'secret' }); await assert.rejects(provider.createEvent('primary', {}, { encryptedTokens: encrypt('{}'), idempotencyKey: 'approval' }), (error) => error.code === 'APPROVAL_REQUIRED'); });
  await t.test('29 LLM circuit breaker opens after configured failures', async () => { const guard = new LlmProviderGuard({ provider: {}, config: { LLM_PROVIDER_ENABLED: 'true', LLM_CIRCUIT_FAILURES: '1', LLM_CIRCUIT_COOLDOWN_MS: '10000', LLM_MAX_ATTEMPTS: '1' } }); await assert.rejects(guard.execute({ model: 'test', operation: async () => { throw new Error('fail'); }, timeoutMs: 20 })); await assert.rejects(guard.execute({ model: 'test', operation: async () => 'never' }), (error) => error.code === 'PROVIDER_UNAVAILABLE'); });

  const backupPath = path.join(tempRoot, 'backup.dump'); await fs.promises.writeFile(backupPath, 'encrypted-backup-artifact');
  await t.test('30 backup checksum is SHA-256', async () => { assert.equal((await checksumFile(backupPath)).length, 64); });
  let completedBackup;
  await t.test('31 restore verification marks backup verified only after checks pass', async () => {
    const storage = { createStorageKey: () => 'backups/one', async store({ expectedSha256 }) { return { storageKey: 'backups/one', sha256: expectedSha256 }; } }; const service = new BackupService({ db: appPool, dumpRunner: async () => ({ path: backupPath, encrypted: true }), storageProvider: storage, restoreVerifier: async () => ({ schemaValid: true, checksumValid: true, tenantDataValid: true }) }); completedBackup = await service.create({ environment: 'test' }); assert.equal(completedBackup.status, 'COMPLETED'); assert.equal((await service.verify(completedBackup.id)).status, 'VERIFIED');
  });
  await t.test('32 unverified backup cannot claim VERIFIED status', async () => { await assert.rejects(adminPool.query("INSERT INTO backup_runs(environment,backup_type,status) VALUES('test','FULL','VERIFIED')"), /backup_verified_ck/); });
  await t.test('33 changed applied migration checksum is detected', async () => { const descriptor = migrationDescriptor('20260630_011_phase8_enterprise_operations.sql'); await adminPool.query("UPDATE schema_migrations SET checksum='0000000000000000000000000000000000000000000000000000000000000000' WHERE version=$1", [descriptor.version]); assert.equal((await status({ dbPool: adminPool })).mismatches.length, 1); await adminPool.query('UPDATE schema_migrations SET checksum=$2 WHERE version=$1', [descriptor.version, descriptor.checksum]); });
  await t.test('34 migration preflight lists a pending migration', async () => { const row = (await adminPool.query("DELETE FROM schema_migrations WHERE version='20260630_011_phase8_enterprise_operations' RETURNING *")).rows[0]; const report = await preflight({ dbPool: adminPool }); assert.ok(report.pending.some((item) => item.version === row.version)); await adminPool.query(`INSERT INTO schema_migrations(version,name,checksum,applied_at,execution_ms,backup_required,breaking,verified_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [row.version,row.name,row.checksum,row.applied_at,row.execution_ms,row.backup_required,row.breaking,row.verified_at]); });
  await t.test('35 migration advisory lock blocks a duplicate migrator', async () => { const first = await adminPool.connect(); const second = await adminPool.connect(); try { await acquireLock(first); await assert.rejects(acquireLock(second), (error) => error.code === 'MIGRATION_LOCK_TIMEOUT'); } finally { await first.query('SELECT pg_advisory_unlock($1)', [76439271]); first.release(); second.release(); } });

  const personalCase = crypto.randomUUID(); const foreignCase = crypto.randomUUID();
  await adminPool.query("INSERT INTO cases(id,scope_type,owner_user_id,konu,esas_no,mahkeme,is_active) VALUES($1,'PERSONAL',$2,'Owner private','2026/8','Test',true)", [personalCase, owner]);
  await adminPool.query("INSERT INTO cases(id,firm_id,law_firm_id,scope_type,konu,esas_no,mahkeme,is_active) VALUES($1,$2,$2,'ORGANIZATION','Foreign tenant','2026/9','Test',true)", [foreignCase, foreignFirm]);
  const privacy = new PrivacyService({ db: appPool }); let privacyRequest;
  await t.test('36 privacy export contains only the requesting user scope', async () => { privacyRequest = await privacy.createRequest(owner, { requestType: 'DATA_EXPORT' }, { identityVerified: true }); const output = JSON.stringify(await privacy.exportData(privacyRequest.id, owner)); assert.match(output, /Owner private/); assert.doesNotMatch(output, /Foreign tenant/); });
  await t.test('37 active legal hold blocks deletion', async () => { await adminPool.query("INSERT INTO legal_holds(resource_type,resource_id,reason,status,created_by) VALUES('USER',$1,'Litigation','ACTIVE',$2)", [owner, admin]); await assert.rejects(privacy.assertDeletionAllowed({ userId: owner, resourceType: 'USER', resourceId: owner }), (error) => error.code === 'LEGAL_HOLD_ACTIVE'); });
  await t.test('38 expired privacy export is no longer available', async () => { const job = await adminPool.query("INSERT INTO data_export_jobs(requested_by,export_type,status,expires_at) VALUES($1,'PRIVACY','COMPLETED',now()-interval '1 minute') RETURNING id", [owner]); await privacy.expireExports(); assert.equal((await adminPool.query('SELECT status FROM data_export_jobs WHERE id=$1', [job.rows[0].id])).rows[0].status, 'EXPIRED'); });
  let auditId;
  await t.test('39 audit rows cannot be updated by normal application SQL', async () => { await AuditLogService.record({ strict: true, action: 'PHASE8_TEST', entityType: 'TEST', entityId: owner, metadata: { documentContent: 'secret', safeCode: 'OK' } }); auditId = (await adminPool.query("SELECT id FROM audit_logs WHERE action='PHASE8_TEST'")).rows[0].id; await assert.rejects(adminPool.query("UPDATE audit_logs SET action='TAMPERED' WHERE id=$1", [auditId]), /append-only/); });
  await t.test('40 audit export excludes sensitive document content', async () => { const output = await new OperationsService({ db: appPool }).auditExport({ format: 'JSON' }); assert.doesNotMatch(output.body, /documentContent|secret/); assert.match(output.body, /PHASE8_TEST/); });

  await t.test('41 SSRF targets on loopback are rejected', async () => { await assert.rejects(assertSafeOutboundUrl('http://127.0.0.1/admin', { allowHttp: true }), (error) => error.code === 'SSRF_PRIVATE_ADDRESS'); });
  await t.test('42 storage path traversal is rejected', () => { assert.throws(() => new LocalStorageProvider({ rootDir: path.join(tempRoot, 'traversal') }).resolvePath('../secret'), (error) => error.code === 'INVALID_STORAGE_KEY'); });
  await t.test('43 open redirect outside allowlist is rejected', () => { assert.throws(() => assertSafeRedirect('https://evil.test/callback', ['https://app.example.test']), (error) => error.code === 'OPEN_REDIRECT_BLOCKED'); });
  await t.test('44 PDF resource page limit is enforced', () => { process.env.PDF_MAX_PAGES = '1'; assert.throws(() => validateDocumentResourceBudget(Buffer.from('%PDF-1.4 /Type /Page /Type /Page'), 'application/pdf'), (error) => error.code === 'PDF_PAGE_LIMIT'); delete process.env.PDF_MAX_PAGES; });
  await t.test('45 another tenant cannot read an education workspace by ID', async () => { const workspace = await adminPool.query("INSERT INTO learning_workspaces(workspace_type,organization_id,title,created_by) VALUES('ACADEMIC',$1,'Private academic',$2) RETURNING id", [firm, owner]); const outsiderContext = await buildAccessContext(outsider, { db: appPool }); await assert.rejects(new EducationAccessService({ db: appPool }).getWorkspace(workspace.rows[0].id, outsiderContext), (error) => error.code === 'LEARNING_WORKSPACE_NOT_FOUND'); });
  await t.test('46 portal refuses an unshared document', async () => { const service = new PracticeManagementService({ db: appPool }); service.getPortalCase = async () => ({ access: { client_id: crypto.randomUUID() }, sharedItems: [] }); await assert.rejects(service.getPortalDocument(personalCase, crypto.randomUUID(), {}), (error) => error.code === 'PORTAL_DOCUMENT_NOT_SHARED'); });
  await t.test('47 student subscription is denied by a professional endpoint', async () => { await adminPool.query("INSERT INTO user_subscriptions(user_id,plan_id,start_date,end_date,is_active) SELECT $1,id,current_date,current_date+30,true FROM subscription_plans WHERE plan_name='Student'", [member]); const base = `http://127.0.0.1:${server.address().port}`; const result = await api(base, '/api/v1/invoices', { auth: bearer(member) }); assert.equal(result.response.status, 403); });
  await t.test('48 liveness and readiness endpoints expose no connection strings', async () => { const base = `http://127.0.0.1:${server.address().port}`; const live = await api(base, '/health/live'); const ready = await api(base, '/health/ready'); assert.equal(live.response.status, 200); assert.equal(ready.response.status, 200); assert.doesNotMatch(JSON.stringify(ready.data), /postgresql:\/\//); });
  await t.test('49 production error shape includes request ID and no stack', async () => { const base = `http://127.0.0.1:${server.address().port}`; const result = await api(base, '/api/not-a-real-route'); assert.equal(result.response.status, 404); assert.ok(result.data.requestId); assert.equal(result.data.stack, undefined); });
  await t.test('50 notification reaches dead-letter after bounded retries', async () => { const notification = crypto.randomUUID(); await adminPool.query("INSERT INTO practice_notifications(id,recipient_user_id,event_type,title,idempotency_key,status) VALUES($1,$2,'TEST','Dead','phase8-dead','QUEUED')", [notification, owner]); await adminPool.query("INSERT INTO outbound_email_queue(notification_id,to_email,subject,body,status,attempts,idempotency_key) VALUES($1,'owner@example.test','Dead','Body','QUEUED',1,'phase8-dead')", [notification]); const result = await new NotificationWorker({ db: appPool, provider: new SMTPEmailProvider({ config: {} }), maxAttempts: 2 }).runOnce(); assert.equal(result.status, 'DEAD_LETTER'); });
  await t.test('51 scheduler expires export jobs once under a distributed lock', async () => { const job = await adminPool.query("INSERT INTO data_export_jobs(requested_by,export_type,status,expires_at) VALUES($1,'TEST','COMPLETED',now()-interval '1 minute') RETURNING id", [owner]); const scheduler = new SchedulerWorker({ db: appPool, redis, agentSchedules: { runDue: async () => [], triggerOperationalEvents: async () => [] } }); await scheduler.runOnce(); assert.equal((await adminPool.query('SELECT status FROM data_export_jobs WHERE id=$1', [job.rows[0].id])).rows[0].status, 'EXPIRED'); });
  await t.test('52 legal rule cannot activate without reviewer source and fixture', async () => { const rule = await adminPool.query("INSERT INTO legal_rule_sets(rule_code,name,calculation_type) VALUES('PHASE8_GUARD','Guard','CUSTOM') RETURNING id"); const version = await adminPool.query("INSERT INTO legal_rule_versions(rule_set_id,version_number,effective_from,rule_definition,created_by,checksum) VALUES($1,1,current_date,'{}',$2,$3) RETURNING id", [rule.rows[0].id, owner, crypto.createHash('sha256').update('{}').digest('hex')]); await assert.rejects(adminPool.query("UPDATE legal_rule_versions SET status='ACTIVE' WHERE id=$1", [version.rows[0].id]), /requires source/); });
  await t.test('53 production, CI, documentation and browser E2E artifacts are present', () => { const required = ['docker-compose.staging.yml','docker-compose.production.yml','.github/workflows/ci.yml','test/e2e/phase8.browser.test.js','docs/production-architecture.md','docs/backup-restore.md','docs/kvkk-data-lifecycle.md']; for (const file of required) assert.equal(fs.existsSync(path.join(__dirname, '..', '..', file)), true, file); });
  await t.test('54 email verification token is single-use and marks the account verified', async () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    const requested = await api(base, '/api/auth/email-verification/request', { method: 'POST', body: { email: 'phase8-owner@example.test' } });
    assert.equal(requested.response.status, 202);
    const queued = await adminPool.query("SELECT queue.body FROM outbound_email_queue queue JOIN practice_notifications notification ON notification.id=queue.notification_id WHERE notification.event_type='EMAIL_VERIFICATION' AND notification.recipient_user_id=$1 ORDER BY queue.created_at DESC LIMIT 1", [owner]);
    const token = decodeURIComponent(queued.rows[0].body.match(/[?&]token=([^\s]+)/)[1]);
    const completed = await api(base, '/api/auth/email-verification/complete', { method: 'POST', body: { token } });
    assert.equal(completed.response.status, 200);
    assert.ok((await adminPool.query('SELECT email_verified_at FROM users WHERE id=$1', [owner])).rows[0].email_verified_at);
    const repeated = await api(base, '/api/auth/email-verification/complete', { method: 'POST', body: { token } });
    assert.equal(repeated.response.status, 400);
  });
  await t.test('55 password reset rotates credentials and revokes active sessions', async () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    const active = await sessionService.create({ id: owner, email: 'phase8-owner@example.test', role: 'Users' });
    const requested = await api(base, '/api/auth/password-reset/request', { method: 'POST', body: { email: 'phase8-owner@example.test' } });
    assert.equal(requested.response.status, 202);
    const queued = await adminPool.query("SELECT queue.body FROM outbound_email_queue queue JOIN practice_notifications notification ON notification.id=queue.notification_id WHERE notification.event_type='PASSWORD_RESET' AND notification.recipient_user_id=$1 ORDER BY queue.created_at DESC LIMIT 1", [owner]);
    const token = decodeURIComponent(queued.rows[0].body.match(/[?&]token=([^\s]+)/)[1]);
    const nextPassword = ['New', 'Strong8', 'Pass'].join('');
    const completed = await api(base, '/api/auth/password-reset/complete', { method: 'POST', body: { token, newPassword: nextPassword } });
    assert.equal(completed.response.status, 200);
    assert.equal(await sessionService.assertActive(active.session.id, owner).then(() => true, () => false), false);
    const password = (await adminPool.query('SELECT password_hash FROM users WHERE id=$1', [owner])).rows[0].password_hash;
    assert.equal(await require('bcryptjs').compare(nextPassword, password), true);
  });
  await t.test('56 production notification defaults never select the fake provider', () => {
    const previous = process.env.NODE_ENV; process.env.NODE_ENV = 'production';
    try {
      const { createDefaultEmailProvider, FakeEmailProvider } = require('../../src/services/practice/NotificationService');
      assert.equal(createDefaultEmailProvider() instanceof FakeEmailProvider, false);
      assert.equal(createDefaultEmailProvider().status(), 'UNCONFIGURED');
    } finally { process.env.NODE_ENV = previous; }
  });
});
