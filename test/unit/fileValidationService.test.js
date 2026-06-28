const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { detectMime, validateTemporaryUpload } = require('../../src/services/security/fileValidationService');
const { validateOriginalName } = require('../../src/middleware/upload');

test('magic-byte detection recognizes the Phase 1B file types', () => {
  assert.equal(detectMime(Buffer.from('%PDF-1.7\n'), '.pdf'), 'application/pdf');
  assert.equal(detectMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), '.png'), 'image/png');
  assert.equal(detectMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), '.jpg'), 'image/jpeg');
  assert.equal(detectMime(Buffer.from('UTF-8 metin'), '.txt'), 'text/plain');
});

test('temporary upload rejects spoofed MIME and empty content', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'legalzeka-validation-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const spoofed = path.join(tempDir, 'spoofed.upload');
  const empty = path.join(tempDir, 'empty.upload');
  fs.writeFileSync(spoofed, 'not a pdf');
  fs.writeFileSync(empty, '');

  await assert.rejects(
    validateTemporaryUpload({ path: spoofed, originalname: 'evidence.pdf', mimetype: 'application/pdf' }),
    (error) => error.code === 'UNSUPPORTED_TYPE'
  );
  await assert.rejects(
    validateTemporaryUpload({ path: empty, originalname: 'empty.txt', mimetype: 'text/plain' }),
    (error) => error.code === 'EMPTY_FILE'
  );
});

test('unsafe and double-extension filenames are rejected before storage', () => {
  assert.throws(() => validateOriginalName('../evidence.txt'), { code: 'INVALID_FILENAME' });
  assert.throws(() => validateOriginalName('petition.pdf.exe'), { code: 'UPLOAD_REJECTED' });
  assert.throws(() => validateOriginalName('petition.pdf.txt'), { code: 'DOUBLE_EXTENSION' });
});
