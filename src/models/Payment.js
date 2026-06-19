const { pool } = require('../config/db');

class Payment {
  static async create(paymentData) {
    const { firm_id, invoice_id, amount, payment_date, payment_method, reference_no, notes } = paymentData;
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Insert payment
      const result = await client.query(
        `INSERT INTO payments (firm_id, invoice_id, amount, payment_date, payment_method, reference_no, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [firm_id, invoice_id, amount, payment_date, payment_method, reference_no, notes]
      );
      
      // Calculate total paid for this invoice
      const sumResult = await client.query(
        `SELECT SUM(amount) as total_paid FROM payments WHERE invoice_id = $1 AND firm_id = $2`,
        [invoice_id, firm_id]
      );
      
      const totalPaid = sumResult.rows[0].total_paid || 0;
      
      // Get invoice total amount
      const invoiceResult = await client.query(
        `SELECT total_amount FROM invoices WHERE id = $1 AND firm_id = $2`,
        [invoice_id, firm_id]
      );
      
      if (invoiceResult.rows.length > 0) {
        const invoiceTotal = invoiceResult.rows[0].total_amount;
        if (totalPaid >= invoiceTotal) {
          await client.query(
            `UPDATE invoices SET status = 'paid', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [invoice_id]
          );
        }
      }
      
      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async getByInvoiceId(invoiceId, firmId) {
    const result = await pool.query(
      `SELECT * FROM payments WHERE invoice_id = $1 AND firm_id = $2 ORDER BY payment_date DESC`,
      [invoiceId, firmId]
    );
    return result.rows;
  }
}

module.exports = Payment;
