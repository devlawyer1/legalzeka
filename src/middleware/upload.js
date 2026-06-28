const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const { storage: documentStorage } = require('../services/storage');

const ALLOWED_DECLARED_MIMES = new Set(['application/pdf', 'text/plain', 'image/jpeg', 'image/png']);
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.txt', '.jpg', '.jpeg', '.png']);
const maxFileSize = Number(process.env.DOCUMENT_MAX_FILE_SIZE_BYTES || 50 * 1024 * 1024);

function uploadError(message, status = 415, code = 'UPLOAD_REJECTED') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function validateOriginalName(name) {
  const value = String(name || '');
  if (!value || value.includes('\0') || value.includes('\r') || value.includes('\n')) {
    throw uploadError('Geçersiz dosya adı.', 400, 'INVALID_FILENAME');
  }
  if (path.basename(value) !== value || value.includes('/') || value.includes('\\')) {
    throw uploadError('Geçersiz dosya adı.', 400, 'INVALID_FILENAME');
  }
  const extension = path.extname(value).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw uploadError('Yalnızca PDF, TXT, JPG ve PNG dosyaları desteklenir.');
  }
  const dotCount = (value.match(/\./g) || []).length;
  if (dotCount > 1) throw uploadError('Çift uzantılı dosyalar kabul edilmez.', 415, 'DOUBLE_EXTENSION');
}

const rawUpload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      cb(null, documentStorage.tempDir);
    },
    filename(req, file, cb) {
      cb(null, `${crypto.randomUUID()}.upload`);
    },
  }),
  fileFilter(req, file, cb) {
    try {
      validateOriginalName(file.originalname);
      if (!ALLOWED_DECLARED_MIMES.has(file.mimetype)) {
        return cb(uploadError('Bildirilen dosya türü desteklenmiyor.'));
      }
      cb(null, true);
    } catch (error) {
      cb(error);
    }
  },
  limits: { fileSize: maxFileSize, files: 1 },
});

function single(fieldName) {
  const middleware = rawUpload.single(fieldName);
  return (req, res, next) => {
    middleware(req, res, (error) => {
      if (!error) return next();
      if (error.code === 'LIMIT_FILE_SIZE') {
        error.status = 413;
        error.message = 'Dosya boyutu izin verilen sınırı aşıyor.';
      }
      next(error);
    });
  };
}

module.exports = { single, validateOriginalName };
