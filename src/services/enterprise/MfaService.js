const crypto = require('node:crypto');
const { pool } = require('../../config/db');
const { decrypt, encrypt, hashOpaque } = require('./secureValue');
const { authError } = require('./AuthSessionService');

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer) {
  let bits = '';
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');
  let output = '';
  for (let index = 0; index < bits.length; index += 5) output += BASE32[Number.parseInt(bits.slice(index, index + 5).padEnd(5, '0'), 2)];
  return output;
}

function base32Decode(value) {
  const bits = String(value).replace(/=+$/g, '').toUpperCase().split('').map((char) => {
    const index = BASE32.indexOf(char);
    if (index < 0) throw authError('MFA secret is invalid.', 'MFA_CONFIGURATION_INVALID', 500);
    return index.toString(2).padStart(5, '0');
  }).join('');
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

function totp(secret, at = Date.now(), stepSeconds = 30) {
  const counter = Math.floor(at / 1000 / stepSeconds);
  const message = Buffer.alloc(8); message.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac('sha1', base32Decode(secret)).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left)); const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

class MfaService {
  constructor({ db = pool } = {}) { this.db = db; }

  verifyTotp(secret, code, now = Date.now()) {
    return [-1, 0, 1].some((drift) => safeEqual(totp(secret, now + drift * 30000), code));
  }

  async beginEnrollment(userId, email) {
    const secret = base32Encode(crypto.randomBytes(20));
    const recoveryCodes = Array.from({ length: 10 }, () => crypto.randomBytes(6).toString('hex').toUpperCase());
    const hashes = recoveryCodes.map((code) => hashOpaque(code, `${process.env.JWT_SECRET}:recovery`));
    await this.db.query(
      `INSERT INTO user_mfa_methods(user_id,encrypted_secret,recovery_code_hashes,status)
       VALUES($1,$2,$3,'PENDING') ON CONFLICT(user_id,method_type) DO UPDATE
       SET encrypted_secret=EXCLUDED.encrypted_secret,recovery_code_hashes=EXCLUDED.recovery_code_hashes,status='PENDING',verified_at=NULL,updated_at=now()`,
      [userId, encrypt(secret), hashes]
    );
    const label = encodeURIComponent(`Legal Zeka:${email}`);
    return { secret, recoveryCodes, otpauthUri: `otpauth://totp/${label}?secret=${secret}&issuer=Legal%20Zeka&algorithm=SHA1&digits=6&period=30` };
  }

  async enable(userId, code) {
    const row = await this.method(userId, false);
    if (!row || row.status !== 'PENDING' || !this.verifyTotp(decrypt(row.encrypted_secret), code)) throw authError('MFA code is invalid.', 'MFA_INVALID');
    await this.db.query("UPDATE user_mfa_methods SET status='ACTIVE',verified_at=now(),updated_at=now() WHERE id=$1", [row.id]);
    return true;
  }

  async method(userId, activeOnly = true) {
    const { rows } = await this.db.query(`SELECT * FROM user_mfa_methods WHERE user_id=$1 ${activeOnly ? "AND status='ACTIVE'" : ''} LIMIT 1`, [userId]);
    return rows[0] || null;
  }

  async verify(userId, credential) {
    const method = await this.method(userId);
    if (!method) return false;
    if (/^\d{6}$/.test(String(credential)) && this.verifyTotp(decrypt(method.encrypted_secret), credential)) {
      await this.db.query('UPDATE user_mfa_methods SET last_used_at=now() WHERE id=$1', [method.id]);
      return true;
    }
    const digest = hashOpaque(String(credential).toUpperCase(), `${process.env.JWT_SECRET}:recovery`);
    if (!method.recovery_code_hashes.includes(digest)) return false;
    await this.db.query(
      `UPDATE user_mfa_methods SET recovery_code_hashes=array_remove(recovery_code_hashes,$2),last_used_at=now(),updated_at=now() WHERE id=$1`,
      [method.id, digest]
    );
    return true;
  }

  async disable(userId, { passwordVerified, code }) {
    if (!passwordVerified || !(await this.verify(userId, code))) throw authError('Reauthentication and MFA are required.', 'MFA_REAUTH_REQUIRED', 403);
    await this.db.query("UPDATE user_mfa_methods SET status='DISABLED',encrypted_secret='',recovery_code_hashes='{}',updated_at=now() WHERE user_id=$1", [userId]);
    return true;
  }
}

module.exports = { MfaService, base32Decode, base32Encode, totp };
