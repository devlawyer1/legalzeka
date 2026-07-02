require('dotenv').config();
const { pool } = require('../config/db');
const LocalStorageProvider = require('../services/storage/LocalStorageProvider');
const { S3StorageProvider } = require('../services/storage/S3StorageProvider');
const { StorageMigrationService } = require('../services/storage/StorageMigrationService');

async function main() {
  const sourceKey = process.argv[2];
  if (!sourceKey) throw new Error('Usage: node migrateLocalStorageToS3.js <storage-key> [--apply] [--delete-source]');
  const service = new StorageMigrationService({ db: pool, source: new LocalStorageProvider(), destination: new S3StorageProvider() });
  const result = await service.migrate(sourceKey, { dryRun: !process.argv.includes('--apply'), deleteSource: process.argv.includes('--delete-source') });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => { console.error(error.code || error.message); process.exitCode = 1; }).finally(() => pool.end());
