const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX || 20),
  idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 30000),
  connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS || 5000),
  statement_timeout: Number(process.env.DB_STATEMENT_TIMEOUT_MS || 30000),
  application_name: process.env.OTEL_SERVICE_NAME || 'legalzeka-backend',
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' } : undefined,
});

async function testConnection() {
  try { const client = await pool.connect(); await client.query('SELECT 1'); client.release(); return true; }
  catch (error) { console.error(JSON.stringify({ level: 'error', event: 'database_connection_failed', code: 'DATABASE_UNAVAILABLE' })); return false; }
}

module.exports = { pool, testConnection };
