// ============================================================
// Emsal Atlası - JWT Authentication Middleware
// Token doğrulama ve rol bazlı yetkilendirme
// ============================================================

const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const { AuthSessionService } = require('../services/enterprise/AuthSessionService');

/**
 * JWT token doğrulama middleware'i.
 * Authorization header'dan Bearer token'ı alır ve doğrular.
 * Doğrulanan kullanıcı bilgisini req.user'a ekler.
 */
async function authenticate(req, res, next) {
  try {
    // 1. Header'dan token'ı al
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Erişim reddedildi. Token bulunamadı.',
      });
    }

    const token = authHeader.split(' ')[1];

    // 2. Token'ı doğrula
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.sid) {
      await new AuthSessionService({ db: pool }).assertActive(decoded.sid, decoded.userId);
    } else if (process.env.NODE_ENV === 'production' && process.env.ALLOW_LEGACY_STATELESS_TOKENS !== 'true') {
      return res.status(401).json({ success: false, code: 'AUTH_REQUIRED', message: 'Session-bound token is required.' });
    }

    // 3. Kullanıcının hala aktif olup olmadığını kontrol et
    const { rows: users } = await pool.query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.is_active, r.role_name
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1`,
      [decoded.userId]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Bu token ile ilişkili kullanıcı bulunamadı.',
      });
    }

    const user = users[0];

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Hesabınız devre dışı bırakılmıştır.',
      });
    }

    // 4. Kullanıcı bilgisini request'e ekle
    req.user = {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role_name,
      sessionId: decoded.sid || null,
      mfa: Boolean(decoded.mfa),
    };

    // 5. Kullanıcının aktif büro üyeliğini ekle (varsa)
    const { rows: firmRows } = await pool.query(
      `SELECT fu.firm_id, fu.firm_role, lf.name as firm_name
       FROM firm_users fu
       JOIN law_firms lf ON fu.firm_id = lf.id
       WHERE fu.user_id = $1 AND fu.is_active = true AND lf.is_active = true
       LIMIT 1`,
      [user.id]
    );
    if (firmRows.length > 0) {
      req.user.firmId = firmRows[0].firm_id;
      req.user.firmRole = firmRows[0].firm_role;
      req.user.firmName = firmRows[0].firm_name;
    }

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token süresi dolmuş. Lütfen tekrar giriş yapın.',
      });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Geçersiz token.',
      });
    }
    if (error.code === 'AUTH_REQUIRED') return res.status(401).json({ success: false, code: error.code, message: error.message });
    return res.status(500).json({
      success: false,
      message: 'Kimlik doğrulama sırasında bir hata oluştu.',
    });
  }
}

/**
 * Rol bazlı yetkilendirme middleware'i.
 * Belirtilen rollere sahip kullanıcılara erişim izni verir.
 * @param  {...string} roles - İzin verilen roller (ör: 'Admin', 'Users')
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Önce kimlik doğrulaması yapılmalıdır.',
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Bu işlem için yetkiniz bulunmamaktadır.',
      });
    }

    next();
  };
}

/**
 * İsteğe bağlı JWT doğrulama middleware'i.
 * Token varsa req.user'ı doldurur, yoksa hata fırlatmaz.
 */
async function optionalAuthenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(); // Token yok, misafir olarak devam et
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const { rows: users } = await pool.query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.is_active, r.role_name
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1`,
      [decoded.userId]
    );

    if (users.length > 0 && users[0].is_active) {
      req.user = {
        id: users[0].id,
        email: users[0].email,
        firstName: users[0].first_name,
        lastName: users[0].last_name,
        role: users[0].role_name,
      };
    }
    next();
  } catch (error) {
    // Token geçersizse misafir olarak devam et
    next();
  }
}

module.exports = { authenticate, optionalAuthenticate, authorize };
