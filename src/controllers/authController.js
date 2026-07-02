const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Role = require('../models/Role');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const UserSubscription = require('../models/UserSubscription');
const { pool } = require('../config/db');
const { AuthSessionService, MfaService } = require('../services/enterprise');
const { issueCsrfCookie, parseCookies } = require('../middleware/csrf');
const { hashOpaque, summarizeUserAgent } = require('../services/enterprise/secureValue');

const sessions = new AuthSessionService({ db: pool });
const mfa = new MfaService({ db: pool });
const ACCOUNT_TOKEN_PEPPER = () => `${process.env.JWT_SECRET}:account-action`;

function requestMeta(req) { return { ip: req.ip || req.socket?.remoteAddress, userAgent: req.get('user-agent') }; }

function setSessionCookies(res, result) {
  res.cookie('lz_refresh', result.refreshToken, sessions.cookieOptions());
  issueCsrfCookie(res);
}

function tokenPayload(result) {
  return {
    accessToken: result.accessToken,
    ...(process.env.NODE_ENV === 'production' ? {} : { refreshToken: result.refreshToken }),
    expiresIn: result.expiresIn,
  };
}

async function recordSecurityEvent(req, input) {
  await pool.query(
    `INSERT INTO security_events(user_id,event_type,severity,ip_hash,user_agent_summary,metadata)
     VALUES($1,$2,$3,$4,$5,$6::jsonb)`,
    [input.userId || null, input.eventType, input.severity || 'INFO', req.ip ? hashOpaque(req.ip) : null,
      summarizeUserAgent(req.get('user-agent')), JSON.stringify(input.metadata || {})]
  ).catch(() => {});
}

async function mfaRequirement(userId) {
  const method = await mfa.method(userId);
  if (method) return { required: true, enrolled: true };
  const { rows } = await pool.query(
    `SELECT EXISTS(
       SELECT 1 FROM enterprise_security_policies policy
       WHERE policy.require_mfa=true AND (
         policy.institution_id IN (SELECT institution_id FROM institution_memberships WHERE user_id=$1 AND status='ACTIVE')
         OR policy.organization_id IN (SELECT firm_id FROM firm_users WHERE user_id=$1 AND is_active=true)
       )
     ) AS required`, [userId]
  );
  return { required: Boolean(rows[0]?.required), enrolled: false };
}

exports.register = async (req, res, next) => {
  try {
    const { firstName, lastName, email, password } = req.body;
    if (await User.emailExists(email)) return res.status(409).json({ success: false, code: 'VALIDATION_FAILED', message: 'Bu e-posta adresi zaten kayitli.' });
    const userRole = await Role.findByName('Users');
    if (!userRole) throw Object.assign(new Error('Default role is unavailable.'), { code: 'MIGRATION_REQUIRED', status: 503 });
    const newUser = await User.create({ firstName, lastName, email, password, roleId: userRole.id });
    const trialPlan = await SubscriptionPlan.findById(1);
    if (trialPlan) {
      const endDate = new Date(); endDate.setDate(endDate.getDate() + trialPlan.duration_days);
      await UserSubscription.create({ userId: newUser.id, planId: trialPlan.id, startDate: new Date().toISOString().slice(0, 10), endDate: endDate.toISOString().slice(0, 10) });
    }
    const result = await sessions.create({ id: newUser.id, email: newUser.email, role: userRole.role_name }, requestMeta(req));
    await queueAccountAction(newUser, 'EMAIL_VERIFICATION').catch(() => null);
    setSessionCookies(res, result);
    res.status(201).json({ success: true, message: 'Kayit basarili.', data: { user: { id: newUser.id, firstName, lastName, email, role: userRole.role_name }, tokens: tokenPayload(result) } });
  } catch (error) { next(error); }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password, mfaCode } = req.body;
    const user = await User.findByEmail(email);
    const valid = user ? await User.comparePassword(password, user.password_hash) : false;
    if (!user || !valid) {
      await recordSecurityEvent(req, { eventType: 'LOGIN_FAILED', severity: 'MEDIUM', metadata: { reason: 'INVALID_CREDENTIALS' } });
      return res.status(401).json({ success: false, code: 'AUTH_REQUIRED', message: 'E-posta veya sifre hatali.' });
    }
    if (!user.is_active) return res.status(403).json({ success: false, code: 'ACCESS_DENIED', message: 'Hesabiniz aktif degil.' });
    const requirement = await mfaRequirement(user.id);
    if (requirement.required && !requirement.enrolled) return res.status(403).json({ success: false, code: 'MFA_ENROLLMENT_REQUIRED', message: 'Kurum politikaniz MFA kurulumu gerektiriyor.' });
    if (requirement.enrolled && !mfaCode) {
      const mfaToken = jwt.sign({ userId: user.id, type: 'MFA_CHALLENGE' }, process.env.JWT_SECRET, { expiresIn: '5m' });
      return res.status(202).json({ success: true, data: { mfaRequired: true, mfaToken } });
    }
    if (requirement.enrolled && !(await mfa.verify(user.id, mfaCode))) {
      await recordSecurityEvent(req, { userId: user.id, eventType: 'MFA_FAILED', severity: 'HIGH' });
      return res.status(401).json({ success: false, code: 'MFA_INVALID', message: 'MFA dogrulamasi basarisiz.' });
    }
    const activeSubscription = await UserSubscription.findActiveByUserId(user.id);
    const result = await sessions.create({ id: user.id, email: user.email, role: user.role_name }, { ...requestMeta(req), mfa: requirement.enrolled });
    setSessionCookies(res, result);
    await recordSecurityEvent(req, { userId: user.id, eventType: 'LOGIN_SUCCEEDED', metadata: { mfa: requirement.enrolled } });
    res.json({ success: true, message: 'Giris basarili.', data: {
      user: { id: user.id, firstName: user.first_name, lastName: user.last_name, email: user.email, role: user.role_name },
      subscription: activeSubscription ? { planName: activeSubscription.plan_name, maxSearchLimit: activeSubscription.max_search_limit, startDate: activeSubscription.start_date, endDate: activeSubscription.end_date, isActive: activeSubscription.is_active } : null,
      tokens: tokenPayload(result),
    } });
  } catch (error) { next(error); }
};

exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, code: 'RESOURCE_NOT_FOUND', message: 'Kullanici bulunamadi.' });
    const activeSubscription = await UserSubscription.findActiveByUserId(user.id);
    res.json({ success: true, data: { user: { id: user.id, firstName: user.first_name, lastName: user.last_name, email: user.email, role: user.role_name, createdAt: user.created_at }, subscription: activeSubscription } });
  } catch (error) { next(error); }
};

exports.refreshToken = async (req, res, next) => {
  try {
    const refreshToken = req.body.refreshToken || parseCookies(req.headers.cookie).lz_refresh;
    if (!refreshToken) return res.status(400).json({ success: false, code: 'VALIDATION_FAILED', message: 'Refresh token gereklidir.' });
    const result = await sessions.rotate(refreshToken, requestMeta(req));
    setSessionCookies(res, result);
    res.json({ success: true, data: tokenPayload(result) });
  } catch (error) { next(error); }
};

exports.listSessions = async (req, res, next) => {
  try { res.json({ success: true, data: await sessions.list(req.user.id) }); } catch (error) { next(error); }
};

exports.revokeSession = async (req, res, next) => {
  try { await sessions.revoke(req.user.id, req.params.sessionId); res.json({ success: true }); } catch (error) { next(error); }
};

exports.revokeAllSessions = async (req, res, next) => {
  try { const count = await sessions.revokeAll(req.user.id); res.clearCookie('lz_refresh', sessions.clearCookieOptions()); res.clearCookie('lz_csrf', { path: '/' }); res.json({ success: true, data: { revoked: count } }); } catch (error) { next(error); }
};

exports.logout = async (req, res, next) => {
  try { if (req.user.sessionId) await sessions.revoke(req.user.id, req.user.sessionId, 'LOGOUT'); res.clearCookie('lz_refresh', sessions.clearCookieOptions()); res.clearCookie('lz_csrf', { path: '/' }); res.json({ success: true }); } catch (error) { next(error); }
};

exports.beginMfaEnrollment = async (req, res, next) => {
  try { res.status(201).json({ success: true, data: await mfa.beginEnrollment(req.user.id, req.user.email) }); } catch (error) { next(error); }
};

exports.enableMfa = async (req, res, next) => {
  try { await mfa.enable(req.user.id, req.body.code); await sessions.revokeAll(req.user.id, 'MFA_ENABLED'); res.json({ success: true, message: 'MFA etkinlestirildi. Yeniden giris yapin.' }); } catch (error) { next(error); }
};

exports.disableMfa = async (req, res, next) => {
  try {
    const user = await User.findByEmail(req.user.email);
    const passwordVerified = Boolean(req.body.password && await User.comparePassword(req.body.password, user.password_hash));
    await mfa.disable(req.user.id, { passwordVerified, code: req.body.code });
    await sessions.revokeAll(req.user.id, 'MFA_DISABLED');
    res.json({ success: true, message: 'MFA devre disi birakildi. Yeniden giris yapin.' });
  } catch (error) { next(error); }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const { firstName, lastName } = req.body;
    if (!firstName || !lastName) return res.status(400).json({ success: false, code: 'VALIDATION_FAILED', message: 'Ad ve soyad zorunludur.' });
    await User.updateProfile(req.user.id, { firstName, lastName });
    res.json({ success: true, data: { firstName, lastName } });
  } catch (error) { next(error); }
};

exports.updatePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword || newPassword.length < 8) return res.status(400).json({ success: false, code: 'VALIDATION_FAILED', message: 'Gecerli mevcut ve yeni sifre gereklidir.' });
    const user = await User.findByEmail(req.user.email);
    if (!await User.comparePassword(currentPassword, user.password_hash)) return res.status(401).json({ success: false, code: 'AUTH_REQUIRED', message: 'Mevcut sifre hatali.' });
    await User.updatePassword(req.user.id, newPassword);
    await pool.query('UPDATE users SET password_changed_at=now() WHERE id=$1', [req.user.id]);
    await sessions.revokeAll(req.user.id, 'PASSWORD_CHANGED');
    res.clearCookie('lz_refresh', sessions.clearCookieOptions());
    res.json({ success: true, message: 'Sifre guncellendi. Tum oturumlar kapatildi.' });
  } catch (error) { next(error); }
};

exports.createAccountActionToken = async (userId, tokenType, ttlMinutes = 30) => {
  const token = crypto.randomBytes(32).toString('base64url');
  await pool.query(
    `INSERT INTO account_action_tokens(user_id,token_type,token_hash,expires_at)
     VALUES($1,$2,$3,now()+($4::int*interval '1 minute'))`,
    [userId, tokenType, hashOpaque(token, ACCOUNT_TOKEN_PEPPER()), ttlMinutes]
  );
  return token;
};

function accountActionLink(tokenType, token) {
  const publicUrl = process.env.PUBLIC_APP_URL || (process.env.NODE_ENV === 'production' ? null : 'http://localhost:3002');
  if (!publicUrl) throw Object.assign(new Error('PUBLIC_APP_URL is not configured.'), { code: 'PROVIDER_UNCONFIGURED', status: 503 });
  const path = tokenType === 'EMAIL_VERIFICATION' ? '/auth/verify-email' : '/auth/reset-password';
  return `${publicUrl.replace(/\/$/, '')}${path}?token=${encodeURIComponent(token)}`;
}

async function queueAccountAction(user, tokenType) {
  const ttlMinutes = tokenType === 'EMAIL_VERIFICATION' ? 1440 : 30;
  const token = await exports.createAccountActionToken(user.id, tokenType, ttlMinutes);
  const action = tokenType === 'EMAIL_VERIFICATION' ? 'E-posta adresinizi dogrulayin' : 'Parolanizi sifirlayin';
  const idempotencyKey = `account:${tokenType.toLowerCase()}:${user.id}:${hashOpaque(token).slice(0, 20)}`;
  const body = `${action}: ${accountActionLink(tokenType, token)}`;
  const notification = await pool.query(
    `INSERT INTO practice_notifications(owner_user_id,recipient_user_id,event_type,channel,title,body,idempotency_key,status)
     VALUES($1,$1,$2,'EMAIL',$3,$4,$5,'QUEUED')
     ON CONFLICT(idempotency_key,channel) DO UPDATE SET title=EXCLUDED.title RETURNING id`,
    [user.id, tokenType, action, body, idempotencyKey]
  );
  await pool.query(
    `INSERT INTO outbound_email_queue(notification_id,to_email,subject,body,status,idempotency_key)
     VALUES($1,$2,$3,$4,'QUEUED',$5) ON CONFLICT(idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING`,
    [notification.rows[0].id, user.email, action, body, idempotencyKey]
  );
}

async function consumeAccountActionToken(token, tokenType, callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id,user_id FROM account_action_tokens
       WHERE token_hash=$1 AND token_type=$2 AND consumed_at IS NULL AND expires_at>now()
       FOR UPDATE`,
      [hashOpaque(token, ACCOUNT_TOKEN_PEPPER()), tokenType]
    );
    if (!rows[0]) throw Object.assign(new Error('Token gecersiz veya suresi dolmus.'), { code: 'VALIDATION_FAILED', status: 400 });
    await callback(client, rows[0].user_id);
    await client.query('UPDATE account_action_tokens SET consumed_at=now() WHERE id=$1', [rows[0].id]);
    await client.query('COMMIT');
    return rows[0].user_id;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

exports.requestEmailVerification = async (req, res, next) => {
  try {
    const user = await User.findByEmail(req.body.email);
    if (user && !user.email_verified_at) await queueAccountAction(user, 'EMAIL_VERIFICATION').catch(() => null);
    res.status(202).json({ success: true, message: 'Hesap uygunsa dogrulama iletisi siraya alindi.' });
  } catch (error) { next(error); }
};

exports.verifyEmail = async (req, res, next) => {
  try {
    await consumeAccountActionToken(req.body.token, 'EMAIL_VERIFICATION', (client, userId) => client.query('UPDATE users SET email_verified_at=now() WHERE id=$1', [userId]));
    res.json({ success: true, message: 'E-posta adresi dogrulandi.' });
  } catch (error) { next(error); }
};

exports.requestPasswordReset = async (req, res, next) => {
  try {
    const user = await User.findByEmail(req.body.email);
    if (user?.is_active) await queueAccountAction(user, 'PASSWORD_RESET').catch(() => null);
    res.status(202).json({ success: true, message: 'Hesap uygunsa parola sifirlama iletisi siraya alindi.' });
  } catch (error) { next(error); }
};

exports.completePasswordReset = async (req, res, next) => {
  try {
    const passwordHash = await bcrypt.hash(req.body.newPassword, 12);
    const userId = await consumeAccountActionToken(req.body.token, 'PASSWORD_RESET', async (client, id) => {
      await client.query('UPDATE users SET password_hash=$2,password_changed_at=now() WHERE id=$1', [id, passwordHash]);
      await client.query("UPDATE auth_sessions SET status='REVOKED',revoked_at=now(),revoke_reason='PASSWORD_RESET' WHERE user_id=$1 AND status='ACTIVE'", [id]);
    });
    await recordSecurityEvent(req, { userId, eventType: 'PASSWORD_RESET_COMPLETED', severity: 'MEDIUM' });
    res.clearCookie('lz_refresh', sessions.clearCookieOptions());
    res.json({ success: true, message: 'Parola guncellendi. Tum oturumlar kapatildi.' });
  } catch (error) { next(error); }
};
