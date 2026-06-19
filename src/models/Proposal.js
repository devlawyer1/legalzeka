const { pool } = require('../config/db');

class Proposal {
  static async create(data) {
    const { id, lead_id, firm_id, title, content, amount, pdf_url, status, created_by } = data;
    const result = await pool.query(
      `INSERT INTO proposals (id, lead_id, firm_id, title, content, amount, pdf_url, status, created_by) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [id, lead_id, firm_id, title, content, amount, pdf_url, status, created_by]
    );
    return result.rows[0];
  }

  static async findByLeadId(leadId, firmId = null) {
    const params = [leadId];
    let firmClause = '';
    if (firmId) {
      params.push(firmId);
      firmClause = ` AND firm_id = $${params.length}`;
    }

    const result = await pool.query(
      `SELECT * FROM proposals WHERE lead_id = $1${firmClause} ORDER BY created_at DESC`,
      params
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

    const result = await pool.query(`SELECT * FROM proposals WHERE id = $1${firmClause}`, params);
    return result.rows[0];
  }

  static async update(id, data, firmId = null) {
    const fields = [];
    const values = [];
    let query = 'UPDATE proposals SET ';

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
}

module.exports = Proposal;
