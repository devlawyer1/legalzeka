const crypto = require('node:crypto');

function parseCookies(header) {
  return Object.fromEntries(String(header || '').split(';').map((item) => item.trim()).filter(Boolean).map((item) => {
    const index = item.indexOf('=');
    return index < 0 ? [item, ''] : [item.slice(0, index), decodeURIComponent(item.slice(index + 1))];
  }));
}

function sameValue(left, right) {
  const a = Buffer.from(String(left || '')); const b = Buffer.from(String(right || ''));
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

function csrfProtection(req, res, next) {
  if (['GET','HEAD','OPTIONS'].includes(req.method)) return next();
  const cookies = parseCookies(req.headers.cookie);
  if (!cookies.lz_refresh) return next();
  if (!sameValue(cookies.lz_csrf, req.get('x-csrf-token'))) {
    return res.status(403).json({ success: false, code: 'CSRF_INVALID', message: 'Request verification failed.', requestId: req.requestId });
  }
  next();
}

function issueCsrfCookie(res) {
  const token = crypto.randomBytes(24).toString('base64url');
  res.cookie('lz_csrf', token, { httpOnly: false, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/' });
  return token;
}

module.exports = { csrfProtection, issueCsrfCookie, parseCookies, sameValue };
