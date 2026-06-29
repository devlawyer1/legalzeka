const { pool } = require('../config/db');
const { v4: uuidv4 } = require('uuid');

class FirmTemplate {
  // Yeni şablon oluştur
  static async create(data) {
    const query = `
      INSERT INTO firm_templates (
        id, firm_id, organization_id, scope_type, title, content, template_type, tags, created_by
      )
      VALUES ($1, $2, $2, 'ORGANIZATION', $3, $4, $5, $6, $7)
      RETURNING *
    `;
    
    // Etiketleri virgülle ayrılmış bir stringden diziye dönüştür veya dizi ise bırak
    let tagsArray = [];
    if (typeof data.tags === 'string') {
        tagsArray = data.tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
    } else if (Array.isArray(data.tags)) {
        tagsArray = data.tags;
    }

    const values = [
      uuidv4(),
      data.firm_id,
      data.title,
      data.content,
      data.template_type,
      tagsArray,
      data.created_by
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  // Firmaya ait şablonları listele
  static async findByFirm(firmId) {
    const query = `
      SELECT * FROM firm_templates 
      WHERE organization_id = $1 AND scope_type = 'ORGANIZATION' AND deleted_at IS NULL
      ORDER BY created_at DESC
    `;
    const result = await pool.query(query, [firmId]);
    return result.rows;
  }

  // Şablon ID'ye göre getir
  static async findById(id) {
    const query = `SELECT * FROM firm_templates WHERE id = $1`;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  // Şablon güncelle
  static async update(id, data) {
    const query = `
      UPDATE firm_templates
      SET title = $1, content = $2, template_type = $3, tags = $4, updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING *
    `;
    
    let tagsArray = [];
    if (typeof data.tags === 'string') {
        tagsArray = data.tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
    } else if (Array.isArray(data.tags)) {
        tagsArray = data.tags;
    }

    const values = [
      data.title,
      data.content,
      data.template_type,
      tagsArray,
      id
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  // Şablon sil
  static async delete(id, firmId) {
    const query = `
      UPDATE firm_templates SET deleted_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND organization_id = $2
        AND scope_type = 'ORGANIZATION' AND is_read_only = FALSE
      RETURNING *
    `;
    const result = await pool.query(query, [id, firmId]);
    return result.rows[0];
  }

  // Embedding kaydet (RAG için arka planda çalışacak)
  static async updateEmbedding(id, embeddingVector) {
    const query = `
      UPDATE firm_templates
      SET embedding = $1::vector
      WHERE id = $2
    `;
    // pgvector formatı: '[1.1, 2.2, ...]'
    const vectorStr = `[${embeddingVector.join(',')}]`;
    await pool.query(query, [vectorStr, id]);
  }

  // RAG için benzer şablonları ara
  static async findSimilar(firmId, embeddingVector, limit = 5) {
    const query = `
      SELECT id, title, content, template_type,
             1 - (embedding <=> $1::vector) AS similarity
      FROM firm_templates
      WHERE firm_id = $2 AND embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector
      LIMIT $3
    `;
    const vectorStr = `[${embeddingVector.join(',')}]`;
    const result = await pool.query(query, [vectorStr, firmId, limit]);
    return result.rows;
  }
}

module.exports = FirmTemplate;
