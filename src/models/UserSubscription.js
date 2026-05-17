// ============================================================
// Emsal Atlası - UserSubscription Model
// Kullanıcı abonelik veritabanı işlemleri
// ============================================================

const { pool } = require('../config/db');

class UserSubscription {
  /**
   * Yeni kullanıcı aboneliği oluşturur.
   * @param {Object} data - { userId, planId, startDate, endDate }
   * @returns {Promise<Object>}
   */
  static async create({ userId, planId, startDate, endDate }) {
    const [result] = await pool.query(
      `INSERT INTO UserSubscriptions (user_id, plan_id, start_date, end_date, is_active)
       VALUES (?, ?, ?, ?, 1)`,
      [userId, planId, startDate, endDate]
    );

    return {
      id: result.insertId,
      userId,
      planId,
      startDate,
      endDate,
      isActive: true,
    };
  }

  /**
   * Kullanıcının aktif aboneliğini getirir.
   * @param {string} userId - UUID
   * @returns {Promise<Object|null>}
   */
  static async findActiveByUserId(userId) {
    const [rows] = await pool.query(
      `SELECT us.*, sp.plan_name, sp.max_search_limit, sp.price
       FROM UserSubscriptions us
       JOIN SubscriptionPlans sp ON us.plan_id = sp.id
       WHERE us.user_id = ? AND us.is_active = 1 AND us.end_date >= CURDATE()
       ORDER BY us.created_at DESC
       LIMIT 1`,
      [userId]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Kullanıcının tüm abonelik geçmişini getirir.
   * @param {string} userId - UUID
   * @returns {Promise<Array>}
   */
  static async findAllByUserId(userId) {
    const [rows] = await pool.query(
      `SELECT us.*, sp.plan_name, sp.max_search_limit, sp.price
       FROM UserSubscriptions us
       JOIN SubscriptionPlans sp ON us.plan_id = sp.id
       WHERE us.user_id = ?
       ORDER BY us.created_at DESC`,
      [userId]
    );
    return rows;
  }

  /**
   * Aboneliği devre dışı bırakır.
   * @param {number} subscriptionId
   * @returns {Promise<void>}
   */
  static async deactivate(subscriptionId) {
    await pool.query(
      'UPDATE UserSubscriptions SET is_active = 0 WHERE id = ?',
      [subscriptionId]
    );
  }
}

module.exports = UserSubscription;
