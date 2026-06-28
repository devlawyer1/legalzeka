const NoopFileScanner = require('./NoopFileScanner');

function boolEnv(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function createFileScanner() {
  const provider = String(process.env.FILE_SCANNER_PROVIDER || 'noop').toLowerCase();
  const required = boolEnv('FILE_SCANNER_REQUIRED', false);
  if (provider !== 'noop') throw new Error(`Unsupported FILE_SCANNER_PROVIDER: ${provider}`);
  if (process.env.NODE_ENV === 'production' && required) {
    throw new Error('A production file scanner is required but only noop is configured.');
  }
  if (process.env.NODE_ENV === 'production') {
    console.warn('[FileScanner] noop scanner is active; configure malware scanning before handling untrusted files.');
  }
  return new NoopFileScanner();
}

const fileScanner = createFileScanner();
module.exports = { createFileScanner, fileScanner };
