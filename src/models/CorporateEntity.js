const { pool } = require('../config/db');

class CorporateEntity {
  static async create(entityData) {
    const { firm_id, name, parent_id, type, share_percentage, tax_number, industry, notes } = entityData;
    const result = await pool.query(
      `INSERT INTO corporate_entities (firm_id, name, parent_id, type, share_percentage, tax_number, industry, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [firm_id, name, parent_id || null, type, share_percentage || null, tax_number || null, industry || null, notes || null]
    );
    return result.rows[0];
  }

  static async getByFirmId(firmId) {
    const result = await pool.query(
      `SELECT * FROM corporate_entities WHERE firm_id = $1 ORDER BY created_at ASC`,
      [firmId]
    );
    return result.rows;
  }

  static async getTreeByFirmId(firmId) {
    const entities = await this.getByFirmId(firmId);
    
    // Ağaç yapısına dönüştürme
    const map = {};
    const roots = [];

    // Önce map oluştur
    entities.forEach(entity => {
      map[entity.id] = { ...entity, children: [] };
    });

    // Parent'lara atama yap
    entities.forEach(entity => {
      if (entity.parent_id && map[entity.parent_id]) {
        map[entity.parent_id].children.push(map[entity.id]);
      } else {
        roots.push(map[entity.id]);
      }
    });

    return roots;
  }
}

module.exports = CorporateEntity;
