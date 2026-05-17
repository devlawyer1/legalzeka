// ============================================================
// Emsal Atlası - User Model
// Kullanıcı veritabanı işlemleri
// ============================================================

const { pool } = require('../config/db');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const SALT_ROUNDS = 12;

class User {
  /**
   * Yeni kullanıcı oluşturur.
   * @param {Object} userData - { firstName, lastName, email, password, roleId }
   * @returns {Promise<Object>} Oluşturulan kullanıcı bilgisi
   */
  static async create({ firstName, lastName, email, password, roleId }) {
    const id = uuidv4();
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const [result] = await pool.query(
      `INSERT INTO Users (id, role_id, first_name, last_name, email, password_hash, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [id, roleId, firstName, lastName, email, passwordHash]
    );

    return {
      id,
      roleId,
      firstName,
      lastName,
      email,
      isActive: true,
    };
  }

  /**
   * E-posta adresine göre kullanıcı bulur.
   * @param {string} email
   * @returns {Promise<Object|null>}
   */
  static async findByEmail(email) {
    const [rows] = await pool.query(
      `SELECT u.*, r.role_name
       FROM Users u
       JOIN Roles r ON u.role_id = r.id
       WHERE u.email = ?`,
      [email]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * ID'ye göre kullanıcı bulur.
   * @param {string} id - UUID
   * @returns {Promise<Object|null>}
   */
  static async findById(id) {
    const [rows] = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.is_active, u.created_at,
              r.role_name
       FROM Users u
       JOIN Roles r ON u.role_id = r.id
       WHERE u.id = ?`,
      [id]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Şifre doğrulama.
   * @param {string} plainPassword - Düz metin şifre
   * @param {string} hashedPassword - Hashlenmiş şifre
   * @returns {Promise<boolean>}
   */
  static async comparePassword(plainPassword, hashedPassword) {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  /**
   * Kullanıcının e-postasının zaten kayıtlı olup olmadığını kontrol eder.
   * @param {string} email
   * @returns {Promise<boolean>}
   */
  static async emailExists(email) {
    const [rows] = await pool.query(
      'SELECT id FROM Users WHERE email = ?',
      [email]
    );
    return rows.length > 0;
  }

  /**
   * Kullanıcı profilini günceller (Ad ve Soyad).
   * @param {string} id - UUID
   * @param {Object} data - { firstName, lastName }
   */
  static async updateProfile(id, { firstName, lastName }) {
    await pool.query(
      'UPDATE Users SET first_name = ?, last_name = ? WHERE id = ?',
      [firstName, lastName, id]
    );
  }

  /**
   * Kullanıcı şifresini günceller.
   * @param {string} id - UUID
   * @param {string} newPassword - Yeni şifre (düz metin)
   */
  static async updatePassword(id, newPassword) {
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await pool.query(
      'UPDATE Users SET password_hash = ? WHERE id = ?',
      [passwordHash, id]
    );
  }
}

module.exports = User;
