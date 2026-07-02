const User = require('../models/User');
const { pool } = require('../config/db');
const { OidcService, SeatService, AuthSessionService } = require('../services/enterprise');
const { PrivacyService } = require('../services/operations/PrivacyService');
const { OperationsService } = require('../services/operations/OperationsService');

const seats = new SeatService({ db: pool }); const privacy = new PrivacyService({ db: pool }); const operations = new OperationsService({ db: pool });
const oidc = new OidcService({ db: pool }); const sessions = new AuthSessionService({ db: pool });

async function institutionAdmin(req, institutionId) {
  if (req.user.role === 'Admin') return { userId: req.user.id, role: 'SYSTEM_ADMIN' };
  const { rows } = await pool.query("SELECT role FROM institution_memberships WHERE institution_id=$1 AND user_id=$2 AND status='ACTIVE' AND role IN ('OWNER','ADMIN')", [institutionId, req.user.id]);
  if (!rows[0]) throw Object.assign(new Error('Institution admin permission is required.'), { code: 'ACCESS_DENIED', status: 403 });
  return { userId: req.user.id, role: rows[0].role };
}

exports.ssoStart = async (req, res, next) => { try { res.json({ success: true, data: await oidc.begin(req.params.providerId, req.body.redirectUri) }); } catch (error) { next(error); } };
exports.ssoCallback = async (req, res, next) => { try {
  const identity = await oidc.callback({ providerId: req.params.providerId, state: req.body.state, code: req.body.code });
  const user = await User.findById(identity.userId); const result = await sessions.create({ id: user.id, email: user.email, role: user.role_name }, { ip: req.ip, userAgent: req.get('user-agent'), mfa: true });
  res.cookie('lz_refresh', result.refreshToken, sessions.cookieOptions()); res.json({ success: true, data: { accessToken: result.accessToken, expiresIn: result.expiresIn } });
} catch (error) { next(error); } };
exports.seatUsage = async (req, res, next) => { try { await institutionAdmin(req, req.params.institutionId); res.json({ success: true, data: await seats.usage(req.params.institutionId) }); } catch (error) { next(error); } };
exports.assignSeat = async (req, res, next) => { try { const actor = await institutionAdmin(req, req.params.institutionId); res.status(201).json({ success: true, data: await seats.assign(req.params.institutionId, req.body, actor, { req }) }); } catch (error) { next(error); } };
exports.revokeSeat = async (req, res, next) => { try { const actor = await institutionAdmin(req, req.params.institutionId); res.json({ success: true, data: await seats.revoke(req.params.institutionId, req.params.seatId, actor, { req }) }); } catch (error) { next(error); } };
exports.createPrivacyRequest = async (req, res, next) => { try { res.status(201).json({ success: true, data: await privacy.createRequest(req.user.id, req.body, { identityVerified: Boolean(req.user.mfa), req }) }); } catch (error) { next(error); } };
exports.exportPrivacyData = async (req, res, next) => { try { res.json({ success: true, data: await privacy.exportData(req.params.requestId, req.user.id) }); } catch (error) { next(error); } };
exports.operations = async (req, res, next) => { try { const institutionId = req.query.institutionId || null; if (institutionId) await institutionAdmin(req, institutionId); else if (req.user.role !== 'Admin') throw Object.assign(new Error('System admin permission is required.'), { code: 'ACCESS_DENIED', status: 403 }); res.json({ success: true, data: await operations.overview({ institutionId }) }); } catch (error) { next(error); } };
exports.auditExport = async (req, res, next) => { try { if (req.query.institutionId) await institutionAdmin(req, req.query.institutionId); else if (req.user.role !== 'Admin') throw Object.assign(new Error('Admin permission is required.'), { code: 'ACCESS_DENIED', status: 403 }); const result = await operations.auditExport({ organizationId: req.query.organizationId || null, institutionId: req.query.institutionId || null, format: String(req.query.format || 'JSON').toUpperCase() }); res.type(result.contentType).send(result.body); } catch (error) { next(error); } };
