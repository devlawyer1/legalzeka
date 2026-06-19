// ============================================================
// Emsal Atlası - FirmUser Model
// Büro-Kullanıcı ilişki ve davet işlemleri
// ============================================================

const { pool } = require('../config/db');
const { v4: uuidv4 } = require('uuid');

class FirmUser {
  /**
   * Büro'ya yeni üye ekler (davet kabul edildiğinde veya doğrudan).
   */
  static async addMember(firmId, userId, firmRole = 'avukat') {
    const { rows } = await pool.query(
      `INSERT INTO firm_users (firm_id, user_id, firm_role)
       VALUES ($1, $2, $3)
       ON CONFLICT (firm_id, user_id) DO UPDATE SET is_active = true, firm_role = $3
       RETURNING *`,
      [firmId, userId, firmRole]
    );
    return rows[0];
  }

  /**
   * Üyenin rolünü günceller.
   */
  static async updateRole(firmId, userId, newRole) {
    const { rows } = await pool.query(
      `UPDATE firm_users SET firm_role = $1 WHERE firm_id = $2 AND user_id = $3 RETURNING *`,
      [newRole, firmId, userId]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Üyeyi bürodan çıkarır (soft delete).
   */
  static async removeMember(firmId, userId) {
    const { rows } = await pool.query(
      `UPDATE firm_users SET is_active = false WHERE firm_id = $1 AND user_id = $2 RETURNING *`,
      [firmId, userId]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Kullanıcının belirli bir bürodaki rolünü getirir.
   */
  static async getUserFirmRole(firmId, userId) {
    const { rows } = await pool.query(
      `SELECT firm_role FROM firm_users WHERE firm_id = $1 AND user_id = $2 AND is_active = true`,
      [firmId, userId]
    );
    return rows.length > 0 ? rows[0].firm_role : null;
  }

  /**
   * Kullanıcının herhangi bir büro üyeliğini getirir (ilk aktif büro).
   */
  static async getUserActiveFirm(userId) {
    const { rows } = await pool.query(
      `SELECT fu.firm_id, fu.firm_role, lf.name as firm_name
       FROM firm_users fu
       JOIN law_firms lf ON fu.firm_id = lf.id
       WHERE fu.user_id = $1 AND fu.is_active = true AND lf.is_active = true
       LIMIT 1`,
      [userId]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  // ==================== Davet İşlemleri ====================

  /**
   * Büro'ya davet oluşturur (e-posta ile).
   */
  static async createInvitation(firmId, email, firmRole, invitedBy) {
    const id = uuidv4();
    // Davet 7 gün geçerli
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const { rows } = await pool.query(
      `INSERT INTO firm_invitations (id, firm_id, email, firm_role, invited_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [id, firmId, email, firmRole, invitedBy, expiresAt]
    );
    return rows[0];
  }

  /**
   * Bekleyen davetleri listeler.
   */
  static async getPendingInvitations(firmId) {
    const { rows } = await pool.query(
      `SELECT fi.*, u.first_name || ' ' || u.last_name as invited_by_name
       FROM firm_invitations fi
       JOIN users u ON fi.invited_by = u.id
       WHERE fi.firm_id = $1 AND fi.status = 'pending' AND fi.expires_at > NOW()
       ORDER BY fi.created_at DESC`,
      [firmId]
    );
    return rows;
  }

  /**
   * Daveti kabul eder.
   */
  static async acceptInvitation(invitationId, userId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Daveti bul
      const { rows: invitations } = await client.query(
        `SELECT * FROM firm_invitations WHERE id = $1 AND status = 'pending' AND expires_at > NOW()`,
        [invitationId]
      );

      if (invitations.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      const invitation = invitations[0];

      // Daveti kabul et
      await client.query(
        `UPDATE firm_invitations SET status = 'accepted' WHERE id = $1`,
        [invitationId]
      );

      // Kullanıcıyı büro'ya ekle
      await client.query(
        `INSERT INTO firm_users (firm_id, user_id, firm_role)
         VALUES ($1, $2, $3)
         ON CONFLICT (firm_id, user_id) DO UPDATE SET is_active = true, firm_role = $3`,
        [invitation.firm_id, userId, invitation.firm_role]
      );

      await client.query('COMMIT');
      return invitation;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = FirmUser;
