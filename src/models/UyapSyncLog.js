// ============================================================
// Emsal Atlası - UYAP Senkronizasyon Log Modeli
// Her senkronizasyon işleminin kaydını tutar (audit trail)
// ============================================================

const { pool } = require('../config/db');
const { v4: uuidv4 } = require('uuid');

class UyapSyncLog {
  /**
   * Yeni sync log kaydı oluşturur (status: 'running')
   */
  static async create({ firmId, userId, syncType }) {
    const id = uuidv4();
    const { rows } = await pool.query(
      `INSERT INTO uyap_sync_logs (id, firm_id, user_id, sync_type, status, started_at)
       VALUES ($1, $2, $3, $4, 'running', CURRENT_TIMESTAMP)
       RETURNING *`,
      [id, firmId, userId, syncType]
    );
    return rows[0];
  }

  /**
   * Sync log'u tamamlar (başarılı veya hatalı)
   */
  static async complete(id, { status, casesSynced, hearingsSynced, notificationsSynced, errorMessage }) {
    const { rows } = await pool.query(
      `UPDATE uyap_sync_logs
       SET status = $2,
           cases_synced = COALESCE($3, 0),
           hearings_synced = COALESCE($4, 0),
           notifications_synced = COALESCE($5, 0),
           error_message = $6,
           completed_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id, status, casesSynced, hearingsSynced, notificationsSynced, errorMessage]
    );
    return rows[0];
  }

  /**
   * Büronun senkronizasyon loglarını getirir
   */
  static async findByFirmId(firmId, limit = 20) {
    const { rows } = await pool.query(
      `SELECT sl.*, u.first_name, u.last_name
       FROM uyap_sync_logs sl
       LEFT JOIN users u ON sl.user_id = u.id
       WHERE sl.firm_id = $1
       ORDER BY sl.started_at DESC
       LIMIT $2`,
      [firmId, limit]
    );
    return rows;
  }

  /**
   * Kullanıcının en son senkronizasyon durumunu getirir
   */
  static async findLatestByUserId(userId, firmId) {
    const { rows } = await pool.query(
      `SELECT * FROM uyap_sync_logs
       WHERE user_id = $1 AND firm_id = $2
       ORDER BY started_at DESC
       LIMIT 1`,
      [userId, firmId]
    );
    return rows[0] || null;
  }
}

module.exports = UyapSyncLog;
