const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class LocalStorageProvider {
  constructor({ rootDir } = {}) {
    this.rootDir = path.resolve(
      rootDir || process.env.LOCAL_UPLOAD_DIR || path.join(__dirname, '..', '..', '..', 'uploads')
    );
    this.tempDir = path.join(this.rootDir, '.tmp');
    fs.mkdirSync(this.rootDir, { recursive: true });
    fs.mkdirSync(this.tempDir, { recursive: true });
  }

  createStorageKey(extension = '') {
    const normalized = String(extension || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return `${crypto.randomUUID()}${normalized ? `.${normalized}` : ''}`;
  }

  keyForFilename(filename) {
    return `/uploads/${this.normalizeKey(filename)}`;
  }

  normalizeKey(storageKey) {
    if (typeof storageKey !== 'string' || storageKey.includes('\0')) throw this.invalidKeyError();
    const normalizedSlashes = storageKey.replace(/\\/g, '/');
    const relative = normalizedSlashes.replace(/^\/+/, '').replace(/^uploads\//, '');
    if (!relative || relative.includes('/') || relative === '.' || relative === '..') {
      throw this.invalidKeyError();
    }
    if (path.basename(relative) !== relative) throw this.invalidKeyError();
    return relative;
  }

  resolvePath(storageKey) {
    const filename = this.normalizeKey(storageKey);
    const resolved = path.resolve(this.rootDir, filename);
    const relative = path.relative(this.rootDir, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw this.invalidKeyError();
    return resolved;
  }

  assertTemporaryPath(sourcePath) {
    const resolved = path.resolve(sourcePath);
    const relative = path.relative(this.tempDir, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      const error = new Error('Invalid temporary storage path.');
      error.code = 'INVALID_TEMP_PATH';
      throw error;
    }
    return resolved;
  }

  async store({ sourcePath, storageKey }) {
    const source = this.assertTemporaryPath(sourcePath);
    const destination = this.resolvePath(storageKey);
    try {
      await fs.promises.access(destination, fs.constants.F_OK);
      const exists = new Error('Storage key already exists.');
      exists.code = 'STORAGE_KEY_EXISTS';
      throw exists;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await fs.promises.rename(source, destination);
    return this.getMetadata(storageKey);
  }

  async openReadStream(storageKey) {
    const filePath = this.resolvePath(storageKey);
    const metadata = await this.getMetadata(storageKey);
    return { stream: fs.createReadStream(filePath), size: metadata.size };
  }

  async exists(storageKey) {
    try {
      const stat = await fs.promises.stat(this.resolvePath(storageKey));
      return stat.isFile();
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'STORAGE_NOT_FOUND') return false;
      throw error;
    }
  }

  async delete(storageKey) {
    try {
      await fs.promises.unlink(this.resolvePath(storageKey));
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') return false;
      throw error;
    }
  }

  async deleteTemporary(sourcePath) {
    try {
      await fs.promises.unlink(this.assertTemporaryPath(sourcePath));
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') return false;
      throw error;
    }
  }

  async getMetadata(storageKey) {
    try {
      const stat = await fs.promises.stat(this.resolvePath(storageKey));
      if (!stat.isFile()) throw new Error('not-a-file');
      return { size: stat.size, modifiedAt: stat.mtime };
    } catch (error) {
      if (error.code === 'INVALID_STORAGE_KEY') throw error;
      const notFound = new Error('Stored document is unavailable.');
      notFound.code = 'STORAGE_NOT_FOUND';
      throw notFound;
    }
  }

  invalidKeyError() {
    const error = new Error('Invalid storage key.');
    error.code = 'INVALID_STORAGE_KEY';
    return error;
  }
}

module.exports = LocalStorageProvider;
