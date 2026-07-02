const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');
const { pool } = require('../../config/db');

class StorageMigrationService {
  constructor({ db = pool, source, destination } = {}) { this.db = db; this.source = source; this.destination = destination; }

  async migrate(sourceKey, { dryRun = true, deleteSource = false } = {}) {
    const existing = await this.db.query(
      `SELECT * FROM storage_migration_records WHERE source_provider='LOCAL' AND source_key=$1 AND destination_provider='S3'`, [sourceKey]
    );
    if (existing.rows[0]?.status === 'COMPLETED') return { ...existing.rows[0], duplicate: true };
    const metadata = await this.source.getMetadata(sourceKey);
    const { stream } = await this.source.openReadStream(sourceKey);
    const hash = crypto.createHash('sha256'); let size = 0;
    const temporary = path.join(this.destination.tempDir, `${crypto.randomUUID()}.migration`);
    const output = fs.createWriteStream(temporary, { flags: 'wx' });
    stream.on('data', (chunk) => { hash.update(chunk); size += chunk.length; });
    await pipeline(stream, output);
    const digest = hash.digest('hex');
    if (size !== metadata.size) { await fs.promises.unlink(temporary).catch(() => {}); throw Object.assign(new Error('Local source changed during migration.'), { code: 'STORAGE_HASH_MISMATCH' }); }
    if (dryRun) { await fs.promises.unlink(temporary).catch(() => {}); return { dryRun: true, sourceKey, size, sha256: digest }; }
    const destinationKey = this.destination.createStorageKey(path.extname(sourceKey));
    try {
      const stored = await this.destination.store({ sourcePath: temporary, storageKey: destinationKey, expectedSha256: digest, metadata: { migrated: 'true' } });
      await this.db.query(
        `INSERT INTO storage_migration_records(source_provider,source_key,destination_provider,destination_key,content_sha256,status,completed_at)
         VALUES('LOCAL',$1,'S3',$2,$3,'COMPLETED',now()) ON CONFLICT(source_provider,source_key,destination_provider)
         DO UPDATE SET destination_key=EXCLUDED.destination_key,content_sha256=EXCLUDED.content_sha256,status='COMPLETED',completed_at=now()`,
        [sourceKey, stored.storageKey, digest]
      );
      if (deleteSource) {
        const current = await this.source.openReadStream(sourceKey); const currentHash = crypto.createHash('sha256');
        for await (const chunk of current.stream) currentHash.update(chunk);
        if (currentHash.digest('hex') !== digest) throw Object.assign(new Error('Source hash changed; source was retained.'), { code: 'STORAGE_HASH_MISMATCH' });
        await this.source.delete(sourceKey);
      }
      return { sourceKey, destinationKey: stored.storageKey, sha256: digest, size };
    } catch (error) {
      await fs.promises.unlink(temporary).catch(() => {});
      await this.db.query(
        `INSERT INTO storage_migration_records(source_provider,source_key,destination_provider,content_sha256,status,safe_error_message)
         VALUES('LOCAL',$1,'S3',$2,'FAILED',$3) ON CONFLICT(source_provider,source_key,destination_provider)
         DO UPDATE SET status='FAILED',safe_error_message=EXCLUDED.safe_error_message`,
        [sourceKey, digest, String(error.code || 'STORAGE_FAILURE')]
      ).catch(() => {});
      throw error;
    }
  }
}

module.exports = { StorageMigrationService };
