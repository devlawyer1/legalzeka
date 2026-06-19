// ============================================================
// Emsal Atlası - LawFirm Model
// Hukuk bürosu veritabanı işlemleri
// ============================================================

const { pool } = require('../config/db');
const { v4: uuidv4 } = require('uuid');

class LawFirm {
  /**
   * Yeni hukuk bürosu oluşturur.
   */
  static async create({ name, taxNumber, address, phone, ownerId }) {
    const id = uuidv4();
    const { rows } = await pool.query(
      `INSERT INTO law_firms (id, name, tax_number, address, phone, owner_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [id, name, taxNumber || null, address || null, phone || null, ownerId]
    );

    // Kurucu, otomatik olarak firm_users tablosuna 'kurucu' rolüyle eklenir
    await pool.query(
      `INSERT INTO firm_users (firm_id, user_id, firm_role)
       VALUES ($1, $2, 'kurucu')`,
      [id, ownerId]
    );

    return rows[0];
  }

  /**
   * Büro ID'sine göre büro bilgilerini getirir.
   */
  static async findById(id) {
    const { rows } = await pool.query(
      `SELECT lf.*, u.first_name || ' ' || u.last_name AS owner_name
       FROM law_firms lf
       JOIN users u ON lf.owner_id = u.id
       WHERE lf.id = $1`,
      [id]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Kullanıcının üye olduğu tüm büroları listeler.
   */
  static async findByUserId(userId) {
    const { rows } = await pool.query(
      `SELECT lf.*, fu.firm_role, fu.joined_at
       FROM law_firms lf
       JOIN firm_users fu ON lf.id = fu.firm_id
       WHERE fu.user_id = $1 AND fu.is_active = true AND lf.is_active = true
       ORDER BY fu.joined_at DESC`,
      [userId]
    );
    return rows;
  }

  /**
   * Büro bilgilerini günceller.
   */
  static async update(id, { name, taxNumber, address, phone }) {
    const { rows } = await pool.query(
      `UPDATE law_firms
       SET name = COALESCE($1, name),
           tax_number = COALESCE($2, tax_number),
           address = COALESCE($3, address),
           phone = COALESCE($4, phone),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING *`,
      [name, taxNumber, address, phone, id]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Bürodaki mevcut üye (seat) sayısını döndürür.
   */
  static async getSeatCount(firmId) {
    const { rows } = await pool.query(
      `SELECT COUNT(*) as count FROM firm_users WHERE firm_id = $1 AND is_active = true`,
      [firmId]
    );
    return parseInt(rows[0].count);
  }

  /**
   * Bürodaki tüm üyeleri listeler.
   */
  static async getMembers(firmId) {
    const { rows } = await pool.query(
      `SELECT fu.id, fu.firm_role, fu.is_active, fu.joined_at,
              u.id AS user_id, u.first_name, u.last_name, u.email
       FROM firm_users fu
       JOIN users u ON fu.user_id = u.id
       WHERE fu.firm_id = $1
       ORDER BY 
         CASE fu.firm_role 
           WHEN 'kurucu' THEN 1 
           WHEN 'ortak' THEN 2 
           WHEN 'avukat' THEN 3 
           WHEN 'stajyer' THEN 4 
           WHEN 'asistan' THEN 5 
         END`,
      [firmId]
    );
    return rows;
  }
}

module.exports = LawFirm;
