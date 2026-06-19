// ============================================================
// Emsal Atlası - UYAP Tebligat/Bildirim Modeli
// UYAP'tan çekilen tebligatları veritabanında saklar
// ============================================================

const { pool } = require('../config/db');
const { v4: uuidv4 } = require('uuid');

class UyapNotification {
  /**
   * Yeni tebligat kaydı oluşturur
   */
  static async create({ firmId, caseId, uyapId, title, content, notificationType, notificationDate, rawData }) {
    const id = uuidv4();
    const { rows } = await pool.query(
      `INSERT INTO uyap_notifications 
       (id, firm_id, case_id, uyap_id, title, content, notification_type, notification_date, raw_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [id, firmId, caseId || null, uyapId || null, title, content || null, notificationType || null, notificationDate || null, rawData ? JSON.stringify(rawData) : null]
    );
    return rows[0];
  }

  /**
   * Toplu tebligat oluşturur (sync sonrası)
   * Var olan uyap_id'ler tekrar eklenmez
   */
  static async bulkCreate(firmId, notifications) {
    let created = 0;
    for (const n of notifications) {
      // Daha önce eklenmiş mi kontrol et (uyap_id bazında)
      if (n.uyapId) {
        const existing = await pool.query(
          `SELECT id FROM uyap_notifications WHERE firm_id = $1 AND uyap_id = $2`,
          [firmId, n.uyapId]
        );
        if (existing.rows.length > 0) continue;
      }

      await UyapNotification.create({ firmId, ...n });
      created++;
    }
    return created;
  }

  /**
   * Büronun tebligatlarını getirir
   */
  static async findByFirmId(firmId, { unreadOnly = false, limit = 50 } = {}) {
    let query = `SELECT n.*, c.esas_no, c.mahkeme as dava_mahkeme
                 FROM uyap_notifications n
                 LEFT JOIN cases c ON n.case_id = c.id
                 WHERE n.firm_id = $1`;
    const params = [firmId];

    if (unreadOnly) {
      query += ` AND n.is_read = false`;
    }

    query += ` ORDER BY n.notification_date DESC NULLS LAST, n.created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const { rows } = await pool.query(query, params);
    return rows;
  }

  /**
   * Belirli bir davanın tebligatlarını getirir
   */
  static async findByCaseId(caseId, firmId) {
    const { rows } = await pool.query(
      `SELECT * FROM uyap_notifications
       WHERE case_id = $1 AND firm_id = $2
       ORDER BY notification_date DESC NULLS LAST`,
      [caseId, firmId]
    );
    return rows;
  }

  /**
   * Tebligatı okundu olarak işaretler
   */
  static async markAsRead(id, firmId) {
    const { rows } = await pool.query(
      `UPDATE uyap_notifications SET is_read = true WHERE id = $1 AND firm_id = $2 RETURNING *`,
      [id, firmId]
    );
    return rows[0];
  }

  /**
   * Bürodaki tüm tebligatları okundu olarak işaretler
   */
  static async markAllAsRead(firmId) {
    const { rowCount } = await pool.query(
      `UPDATE uyap_notifications SET is_read = true WHERE firm_id = $1 AND is_read = false`,
      [firmId]
    );
    return rowCount;
  }

  /**
   * Okunmamış tebligat sayısını döndürür
   */
  static async getUnreadCount(firmId) {
    const { rows } = await pool.query(
      `SELECT COUNT(*) as count FROM uyap_notifications WHERE firm_id = $1 AND is_read = false`,
      [firmId]
    );
    return parseInt(rows[0].count);
  }
}

module.exports = UyapNotification;
