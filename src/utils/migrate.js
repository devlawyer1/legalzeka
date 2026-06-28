const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { pool } = require('../config/db');

const MIGRATION_LOCK_KEY = 76439271;
const BASELINE_VERSION = '00000000_000_baseline';
const configDir = path.join(__dirname, '..', 'config');
const baselinePath = path.join(configDir, 'database.sql');
const migrationsDir = path.join(configDir, 'migrations');

function checksum(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(255) PRIMARY KEY,
      name VARCHAR(255),
      checksum VARCHAR(64),
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await client.query('ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS name VARCHAR(255)');
  await client.query('ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum VARCHAR(64)');
  await client.query('ALTER TABLE schema_migrations ALTER COLUMN applied_at SET DEFAULT CURRENT_TIMESTAMP');
  await client.query('UPDATE schema_migrations SET name = version WHERE name IS NULL');
}

async function applyBaselineIfNeeded(client, logger = console) {
  const { rows } = await client.query("SELECT to_regclass('public.cases') AS cases_table");
  if (rows[0]?.cases_table) return false;

  const sql = fs.readFileSync(baselinePath, 'utf8');
  const fileChecksum = checksum(sql);

  await client.query('BEGIN');
  try {
    await client.query(sql);
    await ensureMigrationTable(client);
    await client.query(
      `INSERT INTO schema_migrations (version, name, checksum)
       VALUES ($1, $2, $3)
       ON CONFLICT (version) DO UPDATE
       SET name = EXCLUDED.name,
           checksum = COALESCE(schema_migrations.checksum, EXCLUDED.checksum)`,
      [BASELINE_VERSION, 'database.sql baseline', fileChecksum]
    );
    await client.query('COMMIT');
    logger.log('Applied baseline schema: database.sql');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

function migrationFiles() {
  if (!fs.existsSync(migrationsDir)) return [];
  return fs.readdirSync(migrationsDir)
    .filter((file) => /^\d{8}_\d{3}_[a-z0-9_]+\.sql$/i.test(file))
    .sort();
}

async function applyMigration(client, file, logger = console) {
  const version = path.basename(file, '.sql');
  const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
  const fileChecksum = checksum(sql);
  const { rows } = await client.query(
    'SELECT checksum FROM schema_migrations WHERE version = $1',
    [version]
  );

  if (rows.length > 0) {
    if (rows[0].checksum && rows[0].checksum !== fileChecksum) {
      throw new Error(`Applied migration checksum mismatch: ${version}`);
    }
    return false;
  }

  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query(
      `INSERT INTO schema_migrations (version, name, checksum)
       VALUES ($1, $2, $3)`,
      [version, file, fileChecksum]
    );
    await client.query('COMMIT');
    logger.log(`Applied migration: ${file}`);
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function migrate({ dbPool = pool, closePool = false, logger = console } = {}) {
  const client = await dbPool.connect();
  let lockAcquired = false;

  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    lockAcquired = true;
    await ensureMigrationTable(client);
    await applyBaselineIfNeeded(client, logger);
    await ensureMigrationTable(client);

    let applied = 0;
    for (const file of migrationFiles()) {
      if (await applyMigration(client, file, logger)) applied += 1;
    }

    logger.log(`Migration complete. Newly applied: ${applied}`);
    return { applied };
  } finally {
    if (lockAcquired) {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
    }
    client.release();
    if (closePool) await dbPool.end();
  }
}

if (require.main === module) {
  migrate({ closePool: true }).catch((error) => {
    console.error('Migration failed:', error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  BASELINE_VERSION,
  MIGRATION_LOCK_KEY,
  applyBaselineIfNeeded,
  checksum,
  ensureMigrationTable,
  migrate,
};
