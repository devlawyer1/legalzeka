const { pool } = require('../../config/db');
const { getRedisProvider } = require('../redis/RedisProvider');
const { storage } = require('../storage');
const { SMTPEmailProvider } = require('../providers');

class HealthService {
  constructor({ db = pool, redis = getRedisProvider(), storageProvider = storage, emailProvider = new SMTPEmailProvider() } = {}) {
    this.db = db; this.redis = redis; this.storage = storageProvider; this.email = emailProvider;
  }

  live() { return { status: 'UP', service: process.env.OTEL_SERVICE_NAME || 'legalzeka-backend', release: process.env.RELEASE_VERSION || 'dev' }; }

  async dependencies() {
    const details = {};
    try { await this.db.query('SELECT 1'); details.database = { status: 'UP' }; } catch (_) { details.database = { status: 'DOWN' }; }
    details.redis = await this.redis.health();
    details.storage = { status: this.storage?.constructor?.name === 'S3StorageProvider' ? (process.env.S3_BUCKET ? 'CONFIGURED' : 'UNCONFIGURED') : (process.env.NODE_ENV === 'production' ? 'DEGRADED' : 'LOCAL') };
    details.email = { status: this.email.status() };
    details.antivirus = { status: process.env.FILE_SCANNER_PROVIDER && process.env.FILE_SCANNER_PROVIDER !== 'noop' ? 'CONFIGURED' : 'UNCONFIGURED' };
    return details;
  }

  async ready() {
    const dependencies = await this.dependencies();
    let migration = { status: 'DOWN' };
    try {
      const latest = await this.db.query('SELECT version,verified_at FROM schema_migrations ORDER BY version DESC LIMIT 1');
      migration = { status: latest.rows[0]?.version === '20260630_011_phase8_enterprise_operations' ? 'UP' : 'PENDING', version: latest.rows[0]?.version || null };
    } catch (_) {}
    const required = [dependencies.database.status, migration.status];
    if (process.env.NODE_ENV === 'production') required.push(dependencies.redis.status, dependencies.storage.status);
    return { status: required.every((value) => ['UP','CONFIGURED'].includes(value)) ? 'UP' : 'DOWN', migration, dependencies };
  }
}

module.exports = { HealthService };
