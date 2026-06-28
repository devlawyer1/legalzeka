const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const TYPE_BY_EXTENSION = {
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

function validationError(code, message, status = 415) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function detectMime(buffer, extension) {
  if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return 'image/png';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (extension === '.txt') {
    if (buffer.includes(0)) throw validationError('BINARY_TEXT_FILE', 'TXT dosyası geçerli metin içermiyor.');
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(buffer);
      return 'text/plain';
    } catch (error) {
      throw validationError('INVALID_UTF8', 'TXT dosyası geçerli UTF-8 metin içermiyor.');
    }
  }
  throw validationError('UNSUPPORTED_TYPE', 'Dosyanın gerçek türü desteklenmiyor.');
}

async function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  const stream = fs.createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest('hex');
}

async function validateTemporaryUpload(file) {
  if (!file?.path) throw validationError('FILE_MISSING', 'Yüklenecek dosya bulunamadı.', 400);
  const stat = await fs.promises.stat(file.path);
  const maxSize = Number(process.env.DOCUMENT_MAX_FILE_SIZE_BYTES || 50 * 1024 * 1024);
  if (stat.size <= 0) throw validationError('EMPTY_FILE', 'Boş dosya yüklenemez.', 400);
  if (stat.size > maxSize) throw validationError('FILE_TOO_LARGE', 'Dosya boyutu sınırı aşıldı.', 413);

  const extension = path.extname(file.originalname).toLowerCase();
  const handle = await fs.promises.open(file.path, 'r');
  const header = Buffer.alloc(Math.min(stat.size, 8192));
  try {
    await handle.read(header, 0, header.length, 0);
  } finally {
    await handle.close();
  }
  const detectedMimeType = detectMime(header, extension);
  const expectedMime = TYPE_BY_EXTENSION[extension];
  if (!expectedMime || expectedMime !== detectedMimeType || file.mimetype !== detectedMimeType) {
    throw validationError('MIME_MISMATCH', 'Dosya uzantısı, bildirilen tür ve gerçek içerik eşleşmiyor.');
  }

  return {
    originalFilename: file.originalname.slice(0, 255),
    extension: extension.slice(1),
    declaredMimeType: file.mimetype,
    detectedMimeType,
    fileSizeBytes: stat.size,
    sha256Hash: await sha256File(file.path),
  };
}

module.exports = { TYPE_BY_EXTENSION, detectMime, sha256File, validateTemporaryUpload, validationError };
