const { pool } = require('../config/db');
const { v4: uuidv4 } = require('uuid');

class Task {
  static async create({ firmId, caseId, baslik, aciklama, atayanId, atananId, sonTarih, oncelik, durum }) {
    const id = uuidv4();
    const { rows } = await pool.query(
      `INSERT INTO tasks (id, firm_id, case_id, baslik, aciklama, atayan_id, atanan_id, son_tarih, oncelik, durum)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, 'Normal'), COALESCE($10, 'Yapılacak'))
       RETURNING *`,
      [id, firmId, caseId || null, baslik, aciklama, atayanId, atananId || null, sonTarih || null, oncelik || null, durum || null]
    );
    return rows[0];
  }

  static async findByFirmId(firmId) {
    const { rows } = await pool.query(
      `SELECT t.*, c.esas_no, c.mahkeme,
              u1.first_name as atayan_isim, u1.last_name as atayan_soyisim,
              u2.first_name as atanan_isim, u2.last_name as atanan_soyisim
       FROM tasks t
       LEFT JOIN cases c ON t.case_id = c.id
       JOIN users u1 ON t.atayan_id = u1.id
       LEFT JOIN users u2 ON t.atanan_id = u2.id
       WHERE t.firm_id = $1
       ORDER BY t.created_at DESC`,
      [firmId]
    );
    return rows;
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
      `UPDATE tasks 
       SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${idx} AND firm_id = $${idx + 1}
       RETURNING *`,
      values
    );
    return rows[0];
  }

  static async delete(id, firmId) {
    const { rowCount } = await pool.query(
      `DELETE FROM tasks WHERE id = $1 AND firm_id = $2`,
      [id, firmId]
    );
    return rowCount > 0;
  }
}

module.exports = Task;