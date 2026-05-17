// ============================================================
// Emsal Atlası - SubscriptionPlan Model
// Abonelik planları veritabanı işlemleri
// ============================================================

const { pool } = require('../config/db');

class SubscriptionPlan {
  /**
   * Plan adına göre abonelik planı bulur.
   * @param {string} planName - Plan adı (ör: 'Ücretsiz Deneme')
   * @returns {Promise<Object|null>}
   */
  static async findByName(planName) {
    const [rows] = await pool.query(
      'SELECT * FROM SubscriptionPlans WHERE plan_name = ?',
      [planName]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * ID'ye göre abonelik planı bulur.
   * @param {number} id
   * @returns {Promise<Object|null>}
   */
  static async findById(id) {
    const [rows] = await pool.query(
      'SELECT * FROM SubscriptionPlans WHERE id = ?',
      [id]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Tüm abonelik planlarını listeler.
   * @returns {Promise<Array>}
   */
  static async findAll() {
    const [rows] = await pool.query('SELECT * FROM SubscriptionPlans ORDER BY price ASC');
    return rows;
  }
}

module.exports = SubscriptionPlan;
