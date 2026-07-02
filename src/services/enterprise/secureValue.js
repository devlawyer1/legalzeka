const crypto = require('node:crypto');

function enterpriseError(message, code = 'SECURITY_CONFIGURATION_INVALID', status = 503) {
  return Object.assign(new Error(message), { code, status });
}

function encryptionKey() {
  const encoded = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!encoded) throw enterpriseError('Credential encryption is not configured.', 'PROVIDER_UNCONFIGURED');
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) throw enterpriseError('Credential encryption key must be 32 bytes.');
  return key;
}

function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
}

function decrypt(value) {
  const [version, iv, tag, ciphertext] = String(value || '').split('.');
  if (version !== 'v1' || !iv || !tag || !ciphertext) throw enterpriseError('Encrypted credential format is invalid.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
}

function hashOpaque(value, pepper = process.env.SECURITY_HASH_PEPPER || process.env.JWT_SECRET || '') {
  return crypto.createHmac('sha256', String(pepper)).update(String(value)).digest('hex');
}

function summarizeUserAgent(value) {
  return String(value || '').replace(/[\r\n\t]/g, ' ').slice(0, 300) || null;
}

module.exports = { decrypt, encrypt, enterpriseError, hashOpaque, summarizeUserAgent };
