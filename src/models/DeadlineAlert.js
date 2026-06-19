// ============================================================
// Emsal Atlası - DeadlineAlert Model
// Süre takibi ve proaktif uyarı sistemi
// ============================================================

const { pool } = require('../config/db');
const { v4: uuidv4 } = require('uuid');

class DeadlineAlert {
  /**
   * Tablo oluşturma (migration)
   */
  static async createTable() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS deadline_alerts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        firm_id UUID NOT NULL REFERENCES law_firms(id) ON DELETE CASCADE,
        case_id UUID REFERENCES cases(id) ON DELETE SET NULL,
        title VARCHAR(500) NOT NULL,
        description TEXT,
        deadline_date TIMESTAMP NOT NULL,
        alert_type VARCHAR(50) DEFAULT 'genel',
        priority VARCHAR(20) DEFAULT 'normal',
        is_acknowledged BOOLEAN DEFAULT FALSE,
        acknowledged_by UUID REFERENCES users(id),
        acknowledged_at TIMESTAMP,
        source VARCHAR(50) DEFAULT 'manual',
        source_ref VARCHAR(255),
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_deadline_firm ON deadline_alerts(firm_id);
      CREATE INDEX IF NOT EXISTS idx_deadline_date ON deadline_alerts(deadline_date);
      CREATE INDEX IF NOT EXISTS idx_deadline_active ON deadline_alerts(firm_id, is_acknowledged, deadline_date);
    `);
  }

  /**
   * Yeni süre uyarısı oluşturur
   */
  static async create({ firmId, caseId, title, description, deadlineDate, alertType, priority, source, sourceRef, createdBy }) {
    const result = await pool.query(
      `INSERT INTO deadline_alerts (firm_id, case_id, title, description, deadline_date, alert_type, priority, source, source_ref, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [firmId, caseId, title, description, deadlineDate, alertType || 'genel', priority || 'normal', source || 'manual', sourceRef, createdBy]
    );
    return result.rows[0];
  }

  static async findBySource({ firmId, caseId, source, sourceRef }) {
    const result = await pool.query(
      `SELECT *
       FROM deadline_alerts
       WHERE firm_id = $1
         AND ($2::uuid IS NULL OR case_id = $2)
         AND source = $3
         AND source_ref = $4
       ORDER BY created_at DESC
       LIMIT 1`,
      [firmId, caseId || null, source, sourceRef]
    );
    return result.rows[0];
  }

  /**
   * Büro için aktif (onaylanmamış) deadline'ları getirir
   */
  static async getActiveByFirm(firmId, limit = 50) {
    const result = await pool.query(
      `SELECT da.*, c.esas_no, c.mahkeme, c.konu
       FROM deadline_alerts da
       LEFT JOIN cases c ON da.case_id = c.id
       WHERE da.firm_id = $1 AND da.is_acknowledged = FALSE
       ORDER BY da.deadline_date ASC
       LIMIT $2`,
      [firmId, limit]
    );
    return result.rows;
  }

  /**
   * Tüm deadline'ları getirir (geçmiş dahil)
   */
  static async getAllByFirm(firmId, { limit = 50, offset = 0 } = {}) {
    const result = await pool.query(
      `SELECT da.*, c.esas_no, c.mahkeme, c.konu
       FROM deadline_alerts da
       LEFT JOIN cases c ON da.case_id = c.id
       WHERE da.firm_id = $1
       ORDER BY da.deadline_date DESC
       LIMIT $2 OFFSET $3`,
      [firmId, limit, offset]
    );
    return result.rows;
  }

  /**
   * Yaklaşan deadline sayısı
   */
  static async getUrgentCount(firmId) {
    const result = await pool.query(
      `SELECT COUNT(*) as count
       FROM deadline_alerts
       WHERE firm_id = $1
         AND is_acknowledged = FALSE
         AND deadline_date <= NOW() + INTERVAL '7 days'`,
      [firmId]
    );
    return parseInt(result.rows[0].count);
  }

  /**
   * Deadline'ı onaylar
   */
  static async acknowledge(id, userId) {
    const result = await pool.query(
      `UPDATE deadline_alerts 
       SET is_acknowledged = TRUE, acknowledged_by = $2, acknowledged_at = NOW(), updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, userId]
    );
    return result.rows[0];
  }

  /**
   * Deadline siler
   */
  static async delete(id) {
    const result = await pool.query(`DELETE FROM deadline_alerts WHERE id = $1 RETURNING id`, [id]);
    return result.rows[0];
  }
}

module.exports = DeadlineAlert;
