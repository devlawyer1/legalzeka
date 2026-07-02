require('dotenv').config();
const app = require('./src/app');
const { pool, testConnection } = require('./src/config/db');
const { log } = require('./src/services/observability');

const PORT = Number(process.env.PORT || 3000);

async function startServer() {
  if (!await testConnection()) throw Object.assign(new Error('Database is unavailable.'), { code: 'DATABASE_UNAVAILABLE' });
  const server = app.listen(PORT, '0.0.0.0', () => log('info', 'server_started', { port: PORT }));
  server.keepAliveTimeout = Number(process.env.HTTP_KEEP_ALIVE_TIMEOUT_MS || 65000);
  server.headersTimeout = Number(process.env.HTTP_HEADERS_TIMEOUT_MS || 66000);
  let stopping = false;
  async function shutdown(signal) {
    if (stopping) return; stopping = true; log('info', 'server_stopping', { signal });
    const forced = setTimeout(() => process.exit(1), Number(process.env.GRACEFUL_SHUTDOWN_TIMEOUT_MS || 30000)); forced.unref();
    server.close(async () => { await pool.end(); clearTimeout(forced); log('info', 'server_stopped', { signal }); });
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  return server;
}

if (require.main === module) startServer().catch((error) => { log('error', 'server_start_failed', { code: error.code, reason: error.message }); process.exitCode = 1; });
module.exports = { startServer };
