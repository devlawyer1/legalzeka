// ============================================================
// Emsal Atlası - Admin Controller
// Sistem yönetimi işlevleri
// ============================================================

const { pool } = require('../config/db');

/**
 * Dashboard için genel istatistikleri döndürür
 */
exports.getDashboardStats = async (req, res, next) => {
  try {
    const usersResult = await pool.query('SELECT COUNT(*) as count FROM users');
    const firmsResult = await pool.query('SELECT COUNT(*) as count FROM law_firms');
    const activeFirmsResult = await pool.query('SELECT COUNT(*) as count FROM law_firms WHERE is_active = true');
    const subscriptionsResult = await pool.query('SELECT COUNT(*) as count FROM user_subscriptions WHERE is_active = true');
    
    // Basit bir örnek metrik, gerçek MRR abonelik tablosundan hesaplanabilir.
    const mrrResult = await pool.query(`
      SELECT SUM(sp.price) as mrr 
      FROM user_subscriptions us 
      JOIN subscription_plans sp ON us.plan_id = sp.id 
      WHERE us.is_active = true
    `);

    // Son aktiviteleri al (Son 5 kullanıcı)
    const recentUsersResult = await pool.query('SELECT first_name, last_name, email, created_at FROM users ORDER BY created_at DESC LIMIT 5');
    const recentActivities = recentUsersResult.rows.map(u => ({
      title: 'Yeni Kullanıcı Kaydı',
      description: `${u.first_name} ${u.last_name} (${u.email}) sisteme kayıt oldu.`,
      date: u.created_at
    }));

    res.status(200).json({
      success: true,
      data: {
        totalUsers: parseInt(usersResult.rows[0].count),
        totalFirms: parseInt(firmsResult.rows[0].count),
        activeFirms: parseInt(activeFirmsResult.rows[0].count),
        activeSubscriptions: parseInt(subscriptionsResult.rows[0].count),
        estimatedMrr: mrrResult.rows[0].mrr ? parseFloat(mrrResult.rows[0].mrr) : 0,
        recentActivities
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Tüm kullanıcıları listeler
 */
exports.getAllUsers = async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT u.id, u.first_name, u.last_name, u.email, u.is_active, u.created_at, r.role_name
      FROM users u
      JOIN roles r ON u.role_id = r.id
      ORDER BY u.created_at DESC
    `);
    
    res.status(200).json({
      success: true,
      data: rows
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Kullanıcının durumunu (Aktif/Pasif) günceller
 */
exports.updateUserStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (id === req.user.id) {
      return res.status(400).json({ success: false, message: "Kendi hesabınızı donduramazsınız." });
    }

    const { rowCount } = await pool.query(
      'UPDATE users SET is_active = $1 WHERE id = $2',
      [isActive, id]
    );

    if (rowCount === 0) {
      return res.status(404).json({ success: false, message: "Kullanıcı bulunamadı." });
    }

    res.status(200).json({
      success: true,
      message: `Kullanıcı durumu başarıyla ${isActive ? 'aktif' : 'pasif'} olarak güncellendi.`
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Tüm hukuk bürolarını listeler
 */
exports.getAllFirms = async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT lf.id, lf.name, lf.city, lf.is_active, lf.created_at, 
             u.first_name as owner_first, u.last_name as owner_last, u.email as owner_email,
             (SELECT COUNT(*) FROM firm_users fu WHERE fu.firm_id = lf.id AND fu.is_active = true) as member_count
      FROM law_firms lf
      JOIN users u ON lf.owner_id = u.id
      ORDER BY lf.created_at DESC
    `);
    
    res.status(200).json({
      success: true,
      data: rows
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Tüm abonelikleri listeler
 */
exports.getAllSubscriptions = async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT us.id, 
             CASE WHEN us.is_active = true THEN 'active' ELSE 'inactive' END as status, 
             us.start_date, us.end_date, us.is_active, us.created_at,
             sp.plan_name, sp.price as price_monthly,
             u.first_name, u.last_name, u.email
      FROM user_subscriptions us
      JOIN subscription_plans sp ON us.plan_id = sp.id
      JOIN users u ON us.user_id = u.id
      ORDER BY us.created_at DESC
    `);
    
    res.status(200).json({
      success: true,
      data: rows
    });
  } catch (error) {
    next(error);
  }
};
