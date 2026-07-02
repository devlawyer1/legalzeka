const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { pool } = require('../config/db');

const MIGRATION_LOCK_KEY = 76439271;
const BASELINE_VERSION = '00000000_000_baseline';
const configDir = path.join(__dirname, '..', 'config');
const baselinePath = path.join(configDir, 'database.sql');
const migrationsDir = path.join(configDir, 'migrations');

function checksum(content) { return crypto.createHash('sha256').update(content, 'utf8').digest('hex'); }

function migrationFiles() {
  if (!fs.existsSync(migrationsDir)) return [];
  return fs.readdirSync(migrationsDir).filter((file) => /^\d{8}_\d{3}_[a-z0-9_]+\.sql$/i.test(file)).sort();
}

function migrationDescriptor(file) {
  const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
  return {
    file, version: path.basename(file, '.sql'), sql, checksum: checksum(sql),
    backupRequired: /^--\s*migration:backup-required=true/im.test(sql),
    breaking: /^--\s*migration:breaking=true/im.test(sql),
    transactional: !/^--\s*migration:transactional=false/im.test(sql),
  };
}

async function ensureMigrationTable(client) {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(255) PRIMARY KEY,name VARCHAR(255),checksum VARCHAR(64),applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await client.query('ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS name VARCHAR(255)');
  await client.query('ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum VARCHAR(64)');
  await client.query('ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS execution_ms BIGINT');
  await client.query('ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS backup_required BOOLEAN NOT NULL DEFAULT false');
  await client.query('ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS breaking BOOLEAN NOT NULL DEFAULT false');
  await client.query('ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ');
  await client.query('ALTER TABLE schema_migrations ALTER COLUMN applied_at SET DEFAULT CURRENT_TIMESTAMP');
  await client.query('UPDATE schema_migrations SET name=version WHERE name IS NULL');
}

async function applyBaselineIfNeeded(client, logger = console) {
  const { rows } = await client.query("SELECT to_regclass('public.cases') AS cases_table");
  if (rows[0]?.cases_table) return false;
  const sql = fs.readFileSync(baselinePath, 'utf8'); const fileChecksum = checksum(sql); const started = Date.now();
  await client.query('BEGIN');
  try {
    await client.query("SELECT set_config('statement_timeout',$1,true)", [String(Number(process.env.MIGRATION_STATEMENT_TIMEOUT_MS || 120000))]);
    await client.query(sql); await ensureMigrationTable(client);
    await client.query(
      `INSERT INTO schema_migrations(version,name,checksum,execution_ms,verified_at)
       VALUES($1,$2,$3,$4,now()) ON CONFLICT(version) DO UPDATE SET name=EXCLUDED.name,checksum=COALESCE(schema_migrations.checksum,EXCLUDED.checksum)`,
      [BASELINE_VERSION, 'database.sql baseline', fileChecksum, Date.now() - started]
    );
    await client.query('COMMIT'); logger.log('Applied baseline schema: database.sql'); return true;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}

async function appliedMap(client) {
  const exists = await client.query("SELECT to_regclass('public.schema_migrations') AS table_name");
  if (!exists.rows[0].table_name) return new Map();
  const { rows } = await client.query('SELECT * FROM schema_migrations ORDER BY version');
  return new Map(rows.map((row) => [row.version, row]));
}

async function status({ dbPool = pool } = {}) {
  const client = await dbPool.connect();
  try {
    const applied = await appliedMap(client); const descriptors = migrationFiles().map(migrationDescriptor);
    const migrations = descriptors.map((item) => ({ ...item, sql: undefined, state: !applied.has(item.version) ? 'PENDING' : applied.get(item.version).checksum && applied.get(item.version).checksum !== item.checksum ? 'CHECKSUM_MISMATCH' : 'APPLIED' }));
    return { migrations, pending: migrations.filter((item) => item.state === 'PENDING'), mismatches: migrations.filter((item) => item.state === 'CHECKSUM_MISMATCH') };
  } finally { client.release(); }
}

async function preflight({ dbPool = pool, requireBackupReference = process.env.NODE_ENV === 'production' } = {}) {
  const client = await dbPool.connect();
  try {
    const server = await client.query('SHOW server_version_num');
    const report = await status({ dbPool });
    const major = Math.floor(Number(server.rows[0].server_version_num) / 10000);
    const errors = [];
    if (major < 14) errors.push('PostgreSQL 14 or newer is required.');
    if (report.mismatches.length) errors.push('Applied migration checksum mismatch detected.');
    if (requireBackupReference && report.pending.some((item) => item.backupRequired) && !process.env.MIGRATION_BACKUP_REFERENCE) errors.push('A verified backup reference is required.');
    if (process.env.NODE_ENV === 'production' && report.pending.some((item) => item.breaking) && process.env.ALLOW_BREAKING_MIGRATION !== 'true') errors.push('Breaking migration requires explicit approval.');
    return { ok: errors.length === 0, postgresMajor: major, pending: report.pending.map(({ version, backupRequired, breaking, transactional }) => ({ version, backupRequired, breaking, transactional })), errors };
  } finally { client.release(); }
}

async function acquireLock(client) {
  const deadline = Date.now() + Number(process.env.MIGRATION_LOCK_TIMEOUT_MS || 30000);
  while (Date.now() < deadline) {
    const result = await client.query('SELECT pg_try_advisory_lock($1) AS locked', [MIGRATION_LOCK_KEY]);
    if (result.rows[0].locked) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw Object.assign(new Error('Migration lock timed out.'), { code: 'MIGRATION_LOCK_TIMEOUT' });
}

async function applyMigration(client, fileOrDescriptor, logger = console) {
  const item = typeof fileOrDescriptor === 'string' ? migrationDescriptor(fileOrDescriptor) : fileOrDescriptor;
  const { rows } = await client.query('SELECT checksum FROM schema_migrations WHERE version=$1', [item.version]);
  if (rows.length) {
    if (rows[0].checksum && rows[0].checksum !== item.checksum) throw new Error(`Applied migration checksum mismatch: ${item.version}`);
    return false;
  }
  if (!item.transactional) throw new Error(`Non-transactional migration requires an explicit runbook: ${item.version}`);
  const started = Date.now(); await client.query('BEGIN');
  try {
    await client.query("SELECT set_config('statement_timeout',$1,true)", [String(Number(process.env.MIGRATION_STATEMENT_TIMEOUT_MS || 120000))]);
    await client.query(item.sql);
    await client.query(
      `INSERT INTO schema_migrations(version,name,checksum,execution_ms,backup_required,breaking)
       VALUES($1,$2,$3,$4,$5,$6)`,
      [item.version, item.file, item.checksum, Date.now() - started, item.backupRequired, item.breaking]
    );
    await client.query('COMMIT'); logger.log(`Applied migration: ${item.file}`); return true;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}

async function verify({ dbPool = pool } = {}) {
  const client = await dbPool.connect();
  try {
    const report = await status({ dbPool });
    if (report.pending.length || report.mismatches.length) return { ok: false, pending: report.pending.map((item) => item.version), mismatches: report.mismatches.map((item) => item.version) };
    const latest = migrationFiles().at(-1); const expected = latest ? path.basename(latest, '.sql') : BASELINE_VERSION;
    const schema = await client.query("SELECT to_regclass('public.users') AS users,to_regclass('public.audit_logs') AS audit_logs,to_regclass('public.auth_sessions') AS auth_sessions");
    const ok = Object.values(schema.rows[0]).every(Boolean);
    if (ok) await client.query('UPDATE schema_migrations SET verified_at=now() WHERE version=$1', [expected]);
    return { ok, version: expected, checks: schema.rows[0] };
  } finally { client.release(); }
}

async function migrate({ dbPool = pool, closePool = false, logger = console, dryRun = false } = {}) {
  const check = await preflight({ dbPool });
  if (!check.ok) throw Object.assign(new Error(check.errors.join(' ')), { code: 'MIGRATION_PREFLIGHT_FAILED' });
  if (dryRun) return { applied: 0, dryRun: true, pending: check.pending };
  const client = await dbPool.connect(); let lockAcquired = false;
  try {
    await acquireLock(client); lockAcquired = true; await ensureMigrationTable(client);
    await applyBaselineIfNeeded(client, logger); await ensureMigrationTable(client);
    let applied = 0;
    for (const file of migrationFiles()) if (await applyMigration(client, file, logger)) applied += 1;
    const verification = await verify({ dbPool });
    if (!verification.ok) throw Object.assign(new Error('Post-migration verification failed.'), { code: 'MIGRATION_VERIFY_FAILED' });
    logger.log(`Migration complete. Newly applied: ${applied}`); return { applied, verification };
  } finally {
    if (lockAcquired) await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
    client.release(); if (closePool) await dbPool.end();
  }
}

async function cli() {
  const command = process.argv[2] || 'up';
  const actions = {
    status: () => status(), preflight: () => preflight(), verify: () => verify(),
    'dry-run': () => migrate({ dryRun: true }), up: () => migrate(),
  };
  if (!actions[command]) throw new Error(`Unknown migration command: ${command}`);
  const result = await actions[command](); console.log(JSON.stringify(result, null, 2)); await pool.end();
  if (result.ok === false) process.exitCode = 1;
}

if (require.main === module) cli().catch((error) => { console.error(`Migration failed: ${error.message}`); process.exitCode = 1; });

module.exports = { BASELINE_VERSION, MIGRATION_LOCK_KEY, acquireLock, applyBaselineIfNeeded, applyMigration, checksum, ensureMigrationTable, migrate, migrationDescriptor, migrationFiles, preflight, status, verify };
