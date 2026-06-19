const { pool } = require('../config/db');
const { v4: uuidv4 } = require('uuid');

class InternalMessage {
  static async create({ firmId, gonderenId, icerik }) {
    const id = uuidv4();
    const { rows } = await pool.query(
      `INSERT INTO internal_messages (id, firm_id, gonderen_id, icerik)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [id, firmId, gonderenId, icerik]
    );
    return rows[0];
  }

  static async findByFirmId(firmId, limit = 50, offset = 0) {
    const { rows } = await pool.query(
      `SELECT m.*, u.first_name, u.last_name 
       FROM internal_messages m
       JOIN users u ON m.gonderen_id = u.id
       WHERE m.firm_id = $1
       ORDER BY m.created_at DESC
       LIMIT $2 OFFSET $3`,
      [firmId, limit, offset]
    );
    return rows.reverse(); // Gosterim icin eskiden yeniye sirala
  }
}

module.exports = InternalMessage;
