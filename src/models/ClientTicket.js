const { pool } = require('../config/db');

class ClientTicket {
  static async create(ticketData) {
    const { firm_id, client_name, is_vip, subject, description, priority, due_date } = ticketData;
    const result = await pool.query(
      `INSERT INTO client_tickets (firm_id, client_name, is_vip, subject, description, priority, due_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [firm_id, client_name, is_vip || false, subject, description || null, priority || 'medium', due_date || null]
    );
    return result.rows[0];
  }

  static async getByFirmId(firmId) {
    const result = await pool.query(
      `SELECT * FROM client_tickets WHERE firm_id = $1 ORDER BY is_vip DESC, created_at DESC`,
      [firmId]
    );
    return result.rows;
  }

  static async updateStatus(id, firmId, status) {
    const result = await pool.query(
      `UPDATE client_tickets SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND firm_id = $3 RETURNING *`,
      [status, id, firmId]
    );
    return result.rows[0];
  }
}

module.exports = ClientTicket;
