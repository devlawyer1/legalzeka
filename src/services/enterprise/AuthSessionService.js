const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { pool } = require('../../config/db');
const { hashOpaque, summarizeUserAgent } = require('./secureValue');

function authError(message, code = 'AUTH_REQUIRED', status = 401) {
  return Object.assign(new Error(message), { code, status });
}

function parseDurationSeconds(value, fallback) {
  const match = String(value || '').match(/^(\d+)(s|m|h|d)$/);
  if (!match) return fallback;
  return Number(match[1]) * ({ s: 1, m: 60, h: 3600, d: 86400 }[match[2]]);
}

class AuthSessionService {
  constructor({ db = pool, jwtSecret = process.env.JWT_SECRET } = {}) {
    this.db = db;
    this.jwtSecret = jwtSecret;
    this.accessTtl = parseDurationSeconds(process.env.JWT_EXPIRES_IN || '15m', 900);
    this.refreshTtl = parseDurationSeconds(process.env.JWT_REFRESH_EXPIRES_IN || '7d', 604800);
  }

  rawToken() { return crypto.randomBytes(48).toString('base64url'); }
  tokenHash(token) { return hashOpaque(token, `${this.jwtSecret}:refresh`); }

  accessToken(user, sessionId, { mfa = false } = {}) {
    return jwt.sign({ userId: user.id, email: user.email, role: user.role || user.role_name, sid: sessionId, mfa }, this.jwtSecret, {
      expiresIn: this.accessTtl, issuer: process.env.JWT_ISSUER || 'legalzeka', audience: process.env.JWT_AUDIENCE || 'legalzeka-api', jwtid: crypto.randomUUID(),
    });
  }

  async create(user, { ip, userAgent, mfa = false, db = this.db } = {}) {
    const refreshToken = this.rawToken();
    const expiresAt = new Date(Date.now() + this.refreshTtl * 1000);
    const { rows } = await db.query(
      `INSERT INTO auth_sessions (user_id,refresh_token_hash,user_agent_summary,ip_hash,mfa_verified_at,expires_at)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,family_id,expires_at`,
      [user.id, this.tokenHash(refreshToken), summarizeUserAgent(userAgent), ip ? hashOpaque(ip) : null, mfa ? new Date() : null, expiresAt]
    );
    return {
      session: rows[0], refreshToken,
      accessToken: this.accessToken(user, rows[0].id, { mfa }),
      expiresIn: this.accessTtl,
    };
  }

  async rotate(refreshToken, { ip, userAgent } = {}) {
    const tokenHash = this.tokenHash(refreshToken);
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `SELECT session_row.*,user_row.email,role_row.role_name
         FROM auth_sessions session_row
         JOIN users user_row ON user_row.id=session_row.user_id
         JOIN roles role_row ON role_row.id=user_row.role_id
         WHERE session_row.refresh_token_hash=$1 OR session_row.previous_token_hash=$1
         FOR UPDATE OF session_row`, [tokenHash]
      );
      const session = rows[0];
      if (!session) throw authError('Refresh token is invalid.');
      if (session.previous_token_hash === tokenHash) {
        await client.query("UPDATE auth_sessions SET status='COMPROMISED',revoked_at=now(),revoke_reason='REFRESH_REUSE' WHERE family_id=$1 AND status='ACTIVE'", [session.family_id]);
        await client.query(
          `INSERT INTO security_events(user_id,event_type,severity,ip_hash,user_agent_summary,metadata)
           VALUES ($1,'REFRESH_TOKEN_REUSE','HIGH',$2,$3,'{"familyRevoked":true}'::jsonb)`,
          [session.user_id, ip ? hashOpaque(ip) : null, summarizeUserAgent(userAgent)]
        );
        await client.query('COMMIT');
        throw authError('Refresh token reuse was detected.', 'SESSION_COMPROMISED');
      }
      if (session.status !== 'ACTIVE' || new Date(session.expires_at) <= new Date()) throw authError('Session is no longer active.');
      const nextToken = this.rawToken();
      await client.query(
        `UPDATE auth_sessions SET previous_token_hash=refresh_token_hash,refresh_token_hash=$2,last_seen_at=now(),
         user_agent_summary=COALESCE($3,user_agent_summary),ip_hash=COALESCE($4,ip_hash) WHERE id=$1`,
        [session.id, this.tokenHash(nextToken), summarizeUserAgent(userAgent), ip ? hashOpaque(ip) : null]
      );
      await client.query('COMMIT');
      const user = { id: session.user_id, email: session.email, role_name: session.role_name };
      return { refreshToken: nextToken, accessToken: this.accessToken(user, session.id, { mfa: Boolean(session.mfa_verified_at) }), expiresIn: this.accessTtl };
    } catch (error) {
      if (!['SESSION_COMPROMISED'].includes(error.code)) await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  }

  async assertActive(sessionId, userId) {
    const { rows } = await this.db.query(
      `SELECT id,mfa_verified_at FROM auth_sessions
       WHERE id=$1 AND user_id=$2 AND status='ACTIVE' AND expires_at>now()`, [sessionId, userId]
    );
    if (!rows[0]) throw authError('Session was revoked.');
    return rows[0];
  }

  async list(userId) {
    const { rows } = await this.db.query(
      `SELECT id,status,user_agent_summary,mfa_verified_at,last_seen_at,expires_at,created_at
       FROM auth_sessions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100`, [userId]
    );
    return rows;
  }

  async revoke(userId, sessionId, reason = 'USER_REVOKED') {
    const result = await this.db.query(
      `UPDATE auth_sessions SET status='REVOKED',revoked_at=now(),revoke_reason=$3
       WHERE id=$1 AND user_id=$2 AND status='ACTIVE'`, [sessionId, userId, reason]
    );
    if (!result.rowCount) throw authError('Session not found.', 'RESOURCE_NOT_FOUND', 404);
    return true;
  }

  async revokeAll(userId, reason = 'LOGOUT_ALL') {
    const result = await this.db.query(
      `UPDATE auth_sessions SET status='REVOKED',revoked_at=now(),revoke_reason=$2 WHERE user_id=$1 AND status='ACTIVE'`,
      [userId, reason]
    );
    return result.rowCount;
  }

  cookieOptions() {
    return { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/api/auth', maxAge: this.refreshTtl * 1000 };
  }

  clearCookieOptions() {
    const { maxAge, ...options } = this.cookieOptions();
    void maxAge;
    return options;
  }
}

module.exports = { AuthSessionService, authError, parseDurationSeconds };
