// ============================================================
// Emsal Atlası - Role Model
// Rol veritabanı işlemleri
// ============================================================

const { pool } = require('../config/db');

class Role {
  /**
   * Rol adına göre rol bulur.
   * @param {string} roleName - Rol adı (ör: 'Users', 'Admin')
   * @returns {Promise<Object|null>}
   */
  static async findByName(roleName) {
    const { rows } = await pool.query(
      'SELECT * FROM roles WHERE role_name = $1',
      [roleName]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * ID'ye göre rol bulur.
   * @param {number} id
   * @returns {Promise<Object|null>}
   */
  static async findById(id) {
    const { rows } = await pool.query(
      'SELECT * FROM roles WHERE id = $1',
      [id]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Tüm rolleri listeler.
   * @returns {Promise<Array>}
   */
  static async findAll() {
    const { rows } = await pool.query('SELECT * FROM Roles');
    return rows;
  }
}

module.exports = Role;
