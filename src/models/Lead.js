const { pool } = require('../config/db');

class Lead {
  static async create(data) {
    const { id, firm_id, name, contact_info, subject, estimated_value, stage, assigned_to, notes } = data;
    const result = await pool.query(
      `INSERT INTO leads (id, firm_id, name, contact_info, subject, estimated_value, stage, assigned_to, notes) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [id, firm_id, name, contact_info, subject, estimated_value, stage, assigned_to, notes]
    );
    return result.rows[0];
  }

  static async findByFirmId(firmId) {
    const result = await pool.query(
      `SELECT l.*, 
              u.first_name as assigned_first_name, u.last_name as assigned_last_name 
       FROM leads l
       LEFT JOIN users u ON l.assigned_to = u.id
       WHERE l.firm_id = $1
       ORDER BY l.created_at DESC`,
      [firmId]
    );
    return result.rows;
  }

  static async findById(id, firmId = null) {
    const params = [id];
    let firmClause = '';
    if (firmId) {
      params.push(firmId);
      firmClause = ` AND firm_id = $${params.length}`;
    }

    const result = await pool.query(`SELECT * FROM leads WHERE id = $1${firmClause}`, params);
    return result.rows[0];
  }

  static async update(id, data, firmId = null) {
    const fields = [];
    const values = [];
    let query = 'UPDATE leads SET ';

    Object.keys(data).forEach((key, index) => {
      fields.push(`${key} = $${index + 1}`);
      values.push(data[key]);
    });

    if (fields.length === 0) return this.findById(id, firmId);

    values.push(id);
    let whereClause = ` WHERE id = $${values.length}`;
    if (firmId) {
      values.push(firmId);
      whereClause += ` AND firm_id = $${values.length}`;
    }

    query += fields.join(', ') + `, updated_at = CURRENT_TIMESTAMP${whereClause} RETURNING *`;

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async delete(id, firmId = null) {
    if (firmId) {
      await pool.query('DELETE FROM leads WHERE id = $1 AND firm_id = $2', [id, firmId]);
      return;
    }
    await pool.query('DELETE FROM leads WHERE id = $1', [id]);
  }
}

module.exports = Lead;
