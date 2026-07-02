const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  S3Client, CopyObjectCommand, DeleteObjectCommand, GetObjectCommand,
  HeadObjectCommand, PutObjectTaggingCommand,
} = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

function storageError(message, code = 'STORAGE_FAILURE', status = 503) {
  return Object.assign(new Error(message), { code, status });
}

async function fileDigest(filePath) {
  const hash = crypto.createHash('sha256');
  let size = 0;
  for await (const chunk of fs.createReadStream(filePath)) { size += chunk.length; hash.update(chunk); }
  return { sha256: hash.digest('hex'), size };
}

class S3StorageProvider {
  constructor({ client, bucket = process.env.S3_BUCKET, prefix = process.env.S3_PREFIX || 'objects', authorizeSignedUrl, uploadFactory } = {}) {
    this.bucket = bucket;
    this.prefix = String(prefix).replace(/^\/+|\/+$/g, '');
    this.authorizeSignedUrl = authorizeSignedUrl;
    this.uploadFactory = uploadFactory || (({ sourcePath, ...options }) => new Upload({
      ...options,
      params: { ...options.params, Body: fs.createReadStream(sourcePath) },
    }));
    this.tempDir = path.resolve(process.env.STORAGE_TEMP_DIR || path.join(os.tmpdir(), 'legalzeka-uploads'));
    fs.mkdirSync(this.tempDir, { recursive: true });
    this.client = client || (bucket ? new S3Client({
      region: process.env.S3_REGION || process.env.AWS_REGION,
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    }) : null);
  }

  assertConfigured() {
    if (!this.client || !this.bucket) throw storageError('S3 storage is not configured.', 'PROVIDER_UNCONFIGURED');
  }

  createStorageKey(extension = '') {
    const suffix = String(extension).toLowerCase().replace(/[^a-z0-9]/g, '');
    return `${this.prefix}/${crypto.randomUUID()}${suffix ? `.${suffix}` : ''}`;
  }

  normalizeKey(value) {
    const key = String(value || '').replace(/^\/+/, '');
    if (!key || key.includes('..') || key.includes('\\') || !key.startsWith(`${this.prefix}/`)) throw storageError('Invalid storage key.', 'INVALID_STORAGE_KEY', 400);
    return key;
  }

  async store({ sourcePath, storageKey, expectedSha256, metadata = {} }) {
    this.assertConfigured();
    const key = this.normalizeKey(storageKey);
    const resolvedSource = path.resolve(sourcePath);
    const relative = path.relative(this.tempDir, resolvedSource);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw storageError('Upload source is outside temporary storage.', 'INVALID_TEMP_PATH', 400);
    const digest = await fileDigest(resolvedSource);
    if (expectedSha256 && expectedSha256 !== digest.sha256) throw storageError('Source hash does not match expected digest.', 'STORAGE_HASH_MISMATCH', 409);
    const temporaryKey = `${this.prefix}/.pending/${crypto.randomUUID()}`;
    const encryption = process.env.S3_SSE_ALGORITHM || 'AES256';
    try {
      await this.uploadFactory({ client: this.client, sourcePath: resolvedSource, params: {
        Bucket: this.bucket, Key: temporaryKey,
        ServerSideEncryption: encryption, Metadata: { sha256: digest.sha256, ...metadata },
      }, queueSize: 4, partSize: 8 * 1024 * 1024, leavePartsOnError: false }).done();
      await this.client.send(new CopyObjectCommand({
        Bucket: this.bucket, Key: key, CopySource: `${this.bucket}/${temporaryKey}`,
        ServerSideEncryption: encryption, MetadataDirective: 'COPY',
      }));
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      if (head.Metadata?.sha256 !== digest.sha256 || Number(head.ContentLength) !== digest.size) {
        await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
        throw storageError('Stored object verification failed.', 'STORAGE_HASH_MISMATCH', 409);
      }
      await fs.promises.unlink(resolvedSource).catch(() => {});
      return { storageKey: key, sha256: digest.sha256, size: digest.size, metadata: head.Metadata || {} };
    } finally {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: temporaryKey })).catch(() => {});
    }
  }

  async openReadStream(storageKey) {
    this.assertConfigured();
    const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: this.normalizeKey(storageKey) }));
    return { stream: response.Body, size: Number(response.ContentLength || 0), sha256: response.Metadata?.sha256 || null };
  }

  async getMetadata(storageKey) {
    this.assertConfigured();
    try {
      const response = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: this.normalizeKey(storageKey) }));
      return { size: Number(response.ContentLength || 0), sha256: response.Metadata?.sha256 || null, metadata: response.Metadata || {}, modifiedAt: response.LastModified };
    } catch (error) {
      if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'NotFound') throw storageError('Stored document is unavailable.', 'STORAGE_NOT_FOUND', 404);
      throw error;
    }
  }

  async exists(storageKey) {
    try { await this.getMetadata(storageKey); return true; } catch (error) { if (error.code === 'STORAGE_NOT_FOUND') return false; throw error; }
  }

  async softDelete(storageKey, retentionUntil = null) {
    this.assertConfigured();
    await this.client.send(new PutObjectTaggingCommand({ Bucket: this.bucket, Key: this.normalizeKey(storageKey), Tagging: { TagSet: [
      { Key: 'legalzeka-delete-status', Value: 'soft-deleted' },
      { Key: 'legalzeka-retention-until', Value: retentionUntil ? new Date(retentionUntil).toISOString().slice(0, 10) : 'none' },
    ] } }));
    return true;
  }

  async delete(storageKey) {
    this.assertConfigured();
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: this.normalizeKey(storageKey) }));
    return true;
  }

  async signedDownloadUrl(storageKey, context, expiresIn = 300) {
    this.assertConfigured();
    const ttl = Math.min(Math.max(Number(expiresIn) || 300, 30), Number(process.env.S3_SIGNED_URL_MAX_SECONDS || 600));
    if (!this.authorizeSignedUrl || !(await this.authorizeSignedUrl({ storageKey, context }))) throw storageError('Storage object is not accessible.', 'ACCESS_DENIED', 403);
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: this.normalizeKey(storageKey) }), { expiresIn: ttl });
  }
}

module.exports = { S3StorageProvider, fileDigest, storageError };
