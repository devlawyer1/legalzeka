const { pool } = require('../config/db');
const { v4: uuidv4 } = require('uuid');

class PetitionComparison {
  /**
   * Yeni bir karşılaştırma raporu kaydeder
   */
  static async create({ caseId, firmId, petition1Id, petition2Id, aiReport, createdBy }) {
    const id = uuidv4();
    const { rows } = await pool.query(
      `INSERT INTO petition_comparisons (id, case_id, firm_id, petition1_id, petition2_id, ai_report, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [id, caseId, firmId, petition1Id, petition2Id, aiReport, createdBy]
    );
    return rows[0];
  }

  /**
   * Belirli bir davanın karşılaştırma raporlarını getirir
   */
  static async findByCaseId(caseId, firmId) {
    const { rows } = await pool.query(
      `SELECT pc.*, 
              p1.title as petition1_title, 
              p2.title as petition2_title,
              u.first_name, u.last_name
       FROM petition_comparisons pc
       LEFT JOIN petitions p1 ON pc.petition1_id = p1.id
       LEFT JOIN petitions p2 ON pc.petition2_id = p2.id
       LEFT JOIN users u ON pc.created_by = u.id
       WHERE pc.case_id = $1 AND pc.firm_id = $2
       ORDER BY pc.created_at DESC`,
      [caseId, firmId]
    );
    return rows;
  }

  /**
   * Tekil rapor getirir
   */
  static async findById(id, firmId) {
    const { rows } = await pool.query(
      `SELECT pc.*, 
              p1.title as petition1_title, 
              p2.title as petition2_title,
              u.first_name, u.last_name
       FROM petition_comparisons pc
       LEFT JOIN petitions p1 ON pc.petition1_id = p1.id
       LEFT JOIN petitions p2 ON pc.petition2_id = p2.id
       LEFT JOIN users u ON pc.created_by = u.id
       WHERE pc.id = $1 AND pc.firm_id = $2`,
      [id, firmId]
    );
    return rows[0];
  }

  /**
   * Karşılaştırma raporunu siler
   */
  static async delete(id, firmId) {
    const { rowCount } = await pool.query(
      `DELETE FROM petition_comparisons WHERE id = $1 AND firm_id = $2`,
      [id, firmId]
    );
    return rowCount > 0;
  }
}

module.exports = PetitionComparison;
