const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const LocalStorageProvider = require('../../src/services/storage/LocalStorageProvider');

const rootDir = path.resolve(process.cwd(), 'test-safe-uploads');
const storage = new LocalStorageProvider({ rootDir });

test('legacy upload keys resolve only beneath the configured root', () => {
  assert.equal(storage.normalizeKey('/uploads/document.pdf'), 'document.pdf');
  assert.equal(storage.resolvePath('/uploads/document.pdf'), path.join(rootDir, 'document.pdf'));
});

test('path traversal and nested paths are rejected', () => {
  for (const key of ['../server.js', '/uploads/../server.js', '..\\server.js', '/etc/passwd', 'nested/file.pdf']) {
    assert.throws(() => storage.resolvePath(key), { code: 'INVALID_STORAGE_KEY' });
  }
});

test('generated storage keys contain only the safe basename', () => {
  assert.equal(storage.keyForFilename('abc123.pdf'), '/uploads/abc123.pdf');
  assert.throws(() => storage.keyForFilename('../abc123.pdf'), { code: 'INVALID_STORAGE_KEY' });
});

test('store is atomic and delete is idempotent', async (t) => {
  const isolatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'legalzeka-storage-'));
  t.after(() => fs.rmSync(isolatedRoot, { recursive: true, force: true }));
  const provider = new LocalStorageProvider({ rootDir: isolatedRoot });
  const source = path.join(provider.tempDir, 'incoming.upload');
  fs.writeFileSync(source, 'evidence');
  const key = provider.keyForFilename(provider.createStorageKey('txt'));

  const metadata = await provider.store({ sourcePath: source, storageKey: key });
  assert.equal(metadata.size, 8);
  assert.equal(await provider.exists(key), true);
  assert.equal(fs.existsSync(source), false);
  assert.equal(await provider.delete(key), true);
  assert.equal(await provider.delete(key), false);
});
