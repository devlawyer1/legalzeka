const { pool } = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { FIRM_ADMIN_ROLES, FIRM_READ_ROLES, FIRM_WRITE_ROLES } = require('../services/accessContext');

function rolesForPermission(permission) {
  if (permission === 'admin') return FIRM_ADMIN_ROLES;
  if (permission === 'write') return FIRM_WRITE_ROLES;
  return FIRM_READ_ROLES;
}

function accessPredicate(alias, context, permission, values) {
  const adminParam = values.push(Boolean(context.isSystemAdmin));
  const userParam = values.push(context.userId);
  const rolesParam = values.push(rolesForPermission(permission));

  return `(
    $${adminParam}::boolean = true
    OR (${alias}.scope_type = 'PERSONAL' AND ${alias}.owner_user_id = $${userParam})
    OR (
      ${alias}.scope_type = 'ORGANIZATION'
      AND EXISTS (
        SELECT 1
        FROM firm_users fu
        JOIN law_firms lf ON lf.id = fu.firm_id
        WHERE fu.firm_id = ${alias}.law_firm_id
          AND fu.user_id = $${userParam}
          AND fu.is_active = true
          AND lf.is_active = true
          AND fu.firm_role = ANY($${rolesParam}::text[])
      )
    )
  )`;
}

class Case {
  static async create({
    firmId = null,
    lawFirmId = null,
    scopeType = 'ORGANIZATION',
    ownerUserId = null,
    esasNo,
    mahkeme,
    konu,
    tarafDavaci,
    tarafDavali,
    durum,
    atananAvukatId,
    notlar,
  }) {
    const id = uuidv4();
    const organizationId = lawFirmId || firmId || null;
    const { rows } = await pool.query(
      `INSERT INTO cases (
         id, firm_id, law_firm_id, scope_type, owner_user_id, esas_no, mahkeme,
         konu, taraf_davaci, taraf_davali, durum, atanan_avukat_id, notlar
       )
       VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        id,
        organizationId,
        scopeType,
        ownerUserId,
        esasNo,
        mahkeme,
        konu,
        tarafDavaci,
        tarafDavali,
        durum || 'Açık',
        atananAvukatId,
        notlar,
      ]
    );
    return rows[0];
  }

  static async findAccessible(context, { scopeType = null, lawFirmId = null } = {}) {
    const values = [];
    const accessSql = accessPredicate('c', context, 'read', values);
    const filters = ['c.is_active = true', accessSql];

    if (scopeType) {
      values.push(scopeType);
      filters.push(`c.scope_type = $${values.length}`);
    }
    if (lawFirmId) {
      values.push(lawFirmId);
      filters.push(`c.law_firm_id = $${values.length}`);
    }

    const { rows } = await pool.query(
      `SELECT c.*, u.first_name, u.last_name
       FROM cases c
       LEFT JOIN users u ON c.atanan_avukat_id = u.id
       WHERE ${filters.join(' AND ')}
       ORDER BY c.created_at DESC`,
      values
    );
    return rows;
  }

  static async findAccessibleById(id, context, permission = 'read') {
    const values = [id];
    const accessSql = accessPredicate('c', context, permission, values);
    const { rows } = await pool.query(
      `SELECT c.*, u.first_name, u.last_name
       FROM cases c
       LEFT JOIN users u ON c.atanan_avukat_id = u.id
       WHERE c.id = $1
         AND c.is_active = true
         AND ${accessSql}
       LIMIT 1`,
      values
    );
    return rows[0] || null;
  }

  static async findByFirmId(firmId) {
    const { rows } = await pool.query(
      `SELECT c.*, u.first_name, u.last_name
       FROM cases c
       LEFT JOIN users u ON c.atanan_avukat_id = u.id
       WHERE c.law_firm_id = $1
         AND c.scope_type = 'ORGANIZATION'
         AND c.is_active = true
       ORDER BY c.created_at DESC`,
      [firmId]
    );
    return rows;
  }

  static async findById(id, firmId) {
    const { rows } = await pool.query(
      `SELECT c.*, u.first_name, u.last_name
       FROM cases c
       LEFT JOIN users u ON c.atanan_avukat_id = u.id
       WHERE c.id = $1 AND c.law_firm_id = $2 AND c.scope_type = 'ORGANIZATION'`,
      [id, firmId]
    );
    return rows[0];
  }

  static async updateAccessible(id, context, updates) {
    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        values.push(value);
        fields.push(`${key} = $${values.length}`);
      }
    }
    if (fields.length === 0) return null;

    values.push(id);
    const idParam = values.length;
    const accessSql = accessPredicate('cases', context, 'write', values);
    const { rows } = await pool.query(
      `UPDATE cases
       SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${idParam}
         AND is_active = true
         AND ${accessSql}
       RETURNING *`,
      values
    );
    return rows[0] || null;
  }

  static async update(id, firmId, updates) {
    const fields = [];
    const values = [];
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        values.push(value);
        fields.push(`${key} = $${values.length}`);
      }
    }
    if (fields.length === 0) return null;

    values.push(id, firmId);
    const { rows } = await pool.query(
      `UPDATE cases
       SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${values.length - 1} AND law_firm_id = $${values.length}
       RETURNING *`,
      values
    );
    return rows[0];
  }

  static async deleteAccessible(id, context) {
    const values = [id];
    const accessSql = accessPredicate('cases', context, 'write', values);
    const { rowCount } = await pool.query(
      `UPDATE cases
       SET is_active = false, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND is_active = true AND ${accessSql}`,
      values
    );
    return rowCount > 0;
  }

  static async delete(id, firmId) {
    const { rowCount } = await pool.query(
      `UPDATE cases
       SET is_active = false, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND law_firm_id = $2`,
      [id, firmId]
    );
    return rowCount > 0;
  }
}

module.exports = Case;
