const crypto = require('node:crypto');
const fs = require('node:fs');
const { pool } = require('../../config/db');

async function checksumFile(filePath) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

class BackupService {
  constructor({ db = pool, dumpRunner, restoreVerifier, storageProvider } = {}) {
    this.db = db; this.dumpRunner = dumpRunner; this.restoreVerifier = restoreVerifier; this.storage = storageProvider;
  }

  async create({ environment, backupType = 'FULL' }) {
    if (!this.dumpRunner || !this.storage) throw Object.assign(new Error('Backup runner and storage must be configured.'), { code: 'PROVIDER_UNCONFIGURED' });
    const row = await this.db.query("INSERT INTO backup_runs(environment,backup_type,status) VALUES($1,$2,'STARTED') RETURNING *", [environment, backupType]);
    try {
      const artifact = await this.dumpRunner({ backupId: row.rows[0].id, environment });
      const checksum = await checksumFile(artifact.path);
      const stored = await this.storage.store({ sourcePath: artifact.path, storageKey: this.storage.createStorageKey('backup'), expectedSha256: checksum, metadata: { encrypted: String(Boolean(artifact.encrypted)) } });
      const completed = await this.db.query("UPDATE backup_runs SET status='COMPLETED',storage_reference=$2,checksum=$3,completed_at=now() WHERE id=$1 RETURNING *", [row.rows[0].id, stored.storageKey, checksum]);
      return completed.rows[0];
    } catch (error) {
      await this.db.query("UPDATE backup_runs SET status='FAILED',safe_error_message=$2,completed_at=now() WHERE id=$1", [row.rows[0].id, String(error.code || 'BACKUP_FAILED')]);
      throw error;
    }
  }

  async verify(backupId) {
    if (!this.restoreVerifier) throw Object.assign(new Error('Restore verifier is not configured.'), { code: 'PROVIDER_UNCONFIGURED' });
    const backup = await this.db.query("SELECT * FROM backup_runs WHERE id=$1 AND status='COMPLETED' AND verified_at IS NULL", [backupId]);
    if (!backup.rows[0]) throw Object.assign(new Error('Completed unverified backup not found.'), { code: 'RESOURCE_NOT_FOUND', status: 404 });
    const result = await this.restoreVerifier(backup.rows[0]);
    if (!result?.schemaValid || !result?.checksumValid || !result?.tenantDataValid) throw Object.assign(new Error('Restore verification failed.'), { code: 'BACKUP_VERIFY_FAILED' });
    const verified = await this.db.query("UPDATE backup_runs SET status='VERIFIED',verified_at=now() WHERE id=$1 RETURNING *", [backupId]);
    return verified.rows[0];
  }
}

module.exports = { BackupService, checksumFile };
