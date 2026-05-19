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
    const { rows } = await pool.query(
      `INSERT INTO UserSubscriptions (user_id, plan_id, start_date, end_date, is_active)
       VALUES ($1, $2, $3, $4, true) RETURNING id`,
      [userId, planId, startDate, endDate]
    );

    return {
      id: rows[0].id,
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
    const { rows } = await pool.query(
      `SELECT us.*, sp.plan_name, sp.max_search_limit, sp.price
       FROM UserSubscriptions us
       JOIN SubscriptionPlans sp ON us.plan_id = sp.id
       WHERE us.user_id = $1 AND us.is_active = true AND us.end_date >= CURRENT_DATE
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
    const { rows } = await pool.query(
      `SELECT us.*, sp.plan_name, sp.max_search_limit, sp.price
       FROM UserSubscriptions us
       JOIN SubscriptionPlans sp ON us.plan_id = sp.id
       WHERE us.user_id = $1
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
      'UPDATE UserSubscriptions SET is_active = false WHERE id = $1',
      [subscriptionId]
    );
  }
}

module.exports = UserSubscription;
