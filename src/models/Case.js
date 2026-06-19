const { pool } = require('../config/db');
const { v4: uuidv4 } = require('uuid');

class Case {
  static async create({ firmId, esasNo, mahkeme, konu, tarafDavaci, tarafDavali, durum, atananAvukatId, notlar }) {
    const id = uuidv4();
    const { rows } = await pool.query(
      `INSERT INTO cases (id, firm_id, esas_no, mahkeme, konu, taraf_davaci, taraf_davali, durum, atanan_avukat_id, notlar)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [id, firmId, esasNo, mahkeme, konu, tarafDavaci, tarafDavali, durum || 'Açık', atananAvukatId, notlar]
    );
    return rows[0];
  }

  static async findByFirmId(firmId) {
    const { rows } = await pool.query(
      `SELECT c.*, u.first_name, u.last_name 
       FROM cases c
       LEFT JOIN users u ON c.atanan_avukat_id = u.id
       WHERE c.firm_id = $1 AND c.is_active = true
       ORDER BY c.created_at DESC`,
      [firmId]
    );
    return rows;
  }

  static async findById(id, firmId) {
    const { rows } = await pool.query(
      `SELECT c.*, u.first_name, u.last_name 
       FROM cases c
       LEFT JOIN users u ON c.atanan_avukat_id = u.id
       WHERE c.id = $1 AND c.firm_id = $2`,
      [id, firmId]
    );
    return rows[0];
  }

  static async update(id, firmId, updates) {
    const fields = [];
    const values = [];
    let idx = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        fields.push(`${key} = $${idx}`);
        values.push(value);
        idx++;
      }
    }

    if (fields.length === 0) return null;

    values.push(id, firmId);
    const { rows } = await pool.query(
      `UPDATE cases 
       SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${idx} AND firm_id = $${idx + 1}
       RETURNING *`,
      values
    );
    return rows[0];
  }

  static async delete(id, firmId) {
    const { rowCount } = await pool.query(
      `UPDATE cases SET is_active = false WHERE id = $1 AND firm_id = $2`,
      [id, firmId]
    );
    return rowCount > 0;
  }
}

module.exports = Case;