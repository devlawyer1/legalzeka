const LocalStorageProvider = require('./LocalStorageProvider');
const { S3StorageProvider } = require('./S3StorageProvider');

function createStorageProvider() {
  const provider = String(process.env.STORAGE_PROVIDER || 'local').toLowerCase();
  if (provider === 's3') return new S3StorageProvider();
  if (provider === 'local') {
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_LOCAL_STORAGE_IN_PRODUCTION !== 'true') {
      throw Object.assign(new Error('Production requires external object storage.'), { code: 'PROVIDER_UNCONFIGURED' });
    }
    return new LocalStorageProvider();
  }
  throw Object.assign(new Error(`Unsupported storage provider: ${provider}`), { code: 'PROVIDER_UNCONFIGURED' });
}

const storage = createStorageProvider();

module.exports = { LocalStorageProvider, S3StorageProvider, createStorageProvider, storage };
