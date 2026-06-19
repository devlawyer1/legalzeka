const { pool } = require('../config/db');
const { v4: uuidv4 } = require('uuid');

class Petition {
  /**
   * Yeni dilekçe oluşturur
   */
  static async create({ caseId, firmId, title, type, content, createdBy, controlReport = {} }) {
    const id = uuidv4();
    const { rows } = await pool.query(
      `INSERT INTO petitions (id, case_id, firm_id, title, type, content, version, created_by, control_report)
       VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $8::jsonb)
       RETURNING *`,
      [id, caseId, firmId, title, type, content, createdBy, JSON.stringify(controlReport || {})]
    );
    return rows[0];
  }

  /**
   * Belirli bir davanın dilekçelerini getirir
   */
  static async findByCaseId(caseId, firmId) {
    const { rows } = await pool.query(
      `SELECT p.*, u.first_name, u.last_name
       FROM petitions p
       LEFT JOIN users u ON p.created_by = u.id
       WHERE p.case_id = $1 AND p.firm_id = $2
       ORDER BY p.created_at DESC`,
      [caseId, firmId]
    );
    return rows;
  }

  /**
   * Tekil dilekçe getirir
   */
  static async findById(id, firmId) {
    const { rows } = await pool.query(
      `SELECT p.*, u.first_name, u.last_name
       FROM petitions p
       LEFT JOIN users u ON p.created_by = u.id
       WHERE p.id = $1 AND p.firm_id = $2`,
      [id, firmId]
    );
    return rows[0];
  }

  /**
   * Dilekçe içeriğini ve versiyonunu günceller
   */
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
    
    // Versiyonu ve updated_at'i otomatik artır/güncelle
    fields.push(`version = version + 1`);
    fields.push(`updated_at = CURRENT_TIMESTAMP`);

    values.push(id, firmId);
    
    const { rows } = await pool.query(
      `UPDATE petitions
       SET ${fields.join(', ')}
       WHERE id = $${idx} AND firm_id = $${idx + 1}
       RETURNING *`,
      values
    );
    return rows[0];
  }

  /**
   * Dilekçe siler
   */
  static async delete(id, firmId) {
    const { rowCount } = await pool.query(
      `DELETE FROM petitions WHERE id = $1 AND firm_id = $2`,
      [id, firmId]
    );
    return rowCount > 0;
  }
}

module.exports = Petition;
