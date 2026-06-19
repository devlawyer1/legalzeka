// ============================================================
// Emsal Atlası - Firm Authorization Middleware
// Büro bazlı yetkilendirme
// ============================================================

const FirmUser = require('../models/FirmUser');
const { pool } = require('../config/db');

/**
 * Kullanıcının bir büro'ya üye olup olmadığını ve yetkisini kontrol eder.
 * req.user.firmId ve req.user.firmRole değerlerini ekler.
 */
async function firmMember(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Önce giriş yapmalısınız.',
      });
    }

    // URL'deki firmId veya kullanıcının aktif bürosu
    let firmId = req.params.firmId || req.body.firmId || req.query.firmId;

    if (!firmId) {
      const caseId = req.params.caseId || (req.baseUrl?.endsWith('/cases') ? req.params.id : null);
      if (caseId) {
        const { rows } = await pool.query(
          'SELECT firm_id FROM cases WHERE id = $1 LIMIT 1',
          [caseId]
        );
        firmId = rows[0]?.firm_id;
      }
    }

    if (!firmId && req.params.docId) {
      const { rows } = await pool.query(
        'SELECT firm_id FROM case_documents WHERE id = $1 LIMIT 1',
        [req.params.docId]
      );
      firmId = rows[0]?.firm_id;
    }

    if (!firmId && req.baseUrl?.endsWith('/deadlines') && req.params.id) {
      const { rows } = await pool.query(
        'SELECT firm_id FROM deadline_alerts WHERE id = $1 LIMIT 1',
        [req.params.id]
      );
      firmId = rows[0]?.firm_id;
    }

    if (!firmId) {
      return res.status(400).json({
        success: false,
        message: 'Büro ID (firmId) belirtilmelidir.',
      });
    }

    const firmRole = await FirmUser.getUserFirmRole(firmId, req.user.id);

    if (!firmRole) {
      return res.status(403).json({
        success: false,
        message: 'Bu büroya erişim yetkiniz bulunmamaktadır.',
      });
    }

    req.user.firmId = firmId;
    req.user.firmRole = firmRole;
    next();
  } catch (error) {
    console.error('Büro yetki kontrolü hatası:', error);
    return res.status(500).json({
      success: false,
      message: 'Yetkilendirme sırasında bir hata oluştu.',
    });
  }
}

/**
 * Sadece büro yöneticilerine (kurucu/ortak) izin verir.
 * firmMember middleware'inden sonra kullanılmalıdır.
 */
function firmAdmin(req, res, next) {
  if (!req.user || !req.user.firmRole) {
    return res.status(401).json({
      success: false,
      message: 'Büro üyeliği doğrulanmadı.',
    });
  }

  const adminRoles = ['kurucu', 'ortak'];
  if (!adminRoles.includes(req.user.firmRole)) {
    return res.status(403).json({
      success: false,
      message: 'Bu işlem için büro yöneticisi (kurucu/ortak) olmanız gerekmektedir.',
    });
  }

  next();
}

module.exports = { firmMember, firmAdmin };
