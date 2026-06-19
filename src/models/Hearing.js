const { pool } = require('../config/db');
const { v4: uuidv4 } = require('uuid');

class Hearing {
  /**
   * Yeni duruşma oluşturur
   */
  static async create({ caseId, firmId, tarihSaat, katilacakAvukatId, notlar, hatirlatici }) {
    const id = uuidv4();
    const { rows } = await pool.query(
      `INSERT INTO hearings (id, case_id, firm_id, tarih_saat, hearing_date, katilacak_avukat_id, notlar, notes, hatirlatici)
       VALUES ($1, $2, $3, $4, $4, $5, $6, $6, COALESCE($7, true))
       RETURNING *`,
      [id, caseId, firmId, tarihSaat, katilacakAvukatId || null, notlar || null, hatirlatici]
    );
    return rows[0];
  }

  /**
   * Belirli bir davanın duruşmalarını getirir
   */
  static async findByCaseId(caseId, firmId) {
    const { rows } = await pool.query(
      `SELECT h.*, u.first_name, u.last_name
       FROM hearings h
       LEFT JOIN users u ON h.katilacak_avukat_id = u.id
       WHERE h.case_id = $1 AND h.firm_id = $2
       ORDER BY COALESCE(h.hearing_date, h.tarih_saat) ASC`,
      [caseId, firmId]
    );
    return rows;
  }

  /**
   * Büronun tüm yaklaşan duruşmalarını getirir
   */
  static async findUpcomingByFirmId(firmId) {
    const { rows } = await pool.query(
      `SELECT h.*, c.esas_no, c.mahkeme as dava_mahkeme, c.konu as dava_konu,
              u.first_name, u.last_name
       FROM hearings h
       JOIN cases c ON h.case_id = c.id
       LEFT JOIN users u ON h.katilacak_avukat_id = u.id
       WHERE h.firm_id = $1 AND COALESCE(h.hearing_date, h.tarih_saat) >= NOW()
       ORDER BY COALESCE(h.hearing_date, h.tarih_saat) ASC`,
      [firmId]
    );
    return rows;
  }

  /**
   * Duruşma bilgilerini günceller
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

    values.push(id, firmId);
    const { rows } = await pool.query(
      `UPDATE hearings
       SET ${fields.join(', ')}
       WHERE id = $${idx} AND firm_id = $${idx + 1}
       RETURNING *`,
      values
    );
    return rows[0];
  }

  /**
   * Duruşma kaydını siler
   */
  static async delete(id, firmId) {
    const { rowCount } = await pool.query(
      `DELETE FROM hearings WHERE id = $1 AND firm_id = $2`,
      [id, firmId]
    );
    return rowCount > 0;
  }
}

module.exports = Hearing;
