const { pool } = require('../config/db');

class Invoice {
  static async create(invoiceData) {
    const { firm_id, lead_id, case_id, client_name, invoice_number, amount, tax_rate, total_amount, issue_date, due_date, status, notes, is_recurring } = invoiceData;
    const result = await pool.query(
      `INSERT INTO invoices (firm_id, lead_id, case_id, client_name, invoice_number, amount, tax_rate, total_amount, issue_date, due_date, status, notes, is_recurring)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [firm_id, lead_id, case_id, client_name, invoice_number, amount, tax_rate, total_amount, issue_date, due_date, status || 'pending', notes, is_recurring || false]
    );
    return result.rows[0];
  }

  static async getByFirmId(firmId) {
    const result = await pool.query(
      `SELECT * FROM invoices WHERE firm_id = $1 ORDER BY due_date ASC`,
      [firmId]
    );
    return result.rows;
  }

  static async getById(id, firmId) {
    const result = await pool.query(
      `SELECT * FROM invoices WHERE id = $1 AND firm_id = $2`,
      [id, firmId]
    );
    return result.rows[0];
  }

  static async updateStatus(id, firmId, status) {
    const result = await pool.query(
      `UPDATE invoices SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND firm_id = $3 RETURNING *`,
      [status, id, firmId]
    );
    return result.rows[0];
  }

  static async delete(id, firmId) {
    const result = await pool.query(
      `DELETE FROM invoices WHERE id = $1 AND firm_id = $2 RETURNING id`,
      [id, firmId]
    );
    return result.rows[0];
  }

  static async getDashboardStats(firmId) {
    const result = await pool.query(`
      SELECT 
        SUM(CASE WHEN status = 'pending' THEN total_amount ELSE 0 END) as total_pending,
        SUM(CASE WHEN status = 'paid' THEN total_amount ELSE 0 END) as total_paid,
        SUM(CASE WHEN status = 'overdue' THEN total_amount ELSE 0 END) as total_overdue,
        SUM(CASE WHEN is_recurring = true AND status IN ('pending', 'paid') THEN total_amount ELSE 0 END) as mrr
      FROM invoices
      WHERE firm_id = $1 AND (status != 'cancelled' OR status IS NULL)
    `, [firmId]);
    return result.rows[0];
  }
}

module.exports = Invoice;
