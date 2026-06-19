// ============================================================
// Emsal Atlası - LawVersion Model
// Kanun maddelerinin tarihsel versiyonlarını saklar
// ============================================================

const { pool } = require('../config/db');
const { generateEmbedding } = require('../utils/embedding');

class LawVersion {
  /**
   * Tablo oluşturma
   */
  static async createTable() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS law_versions (
        id SERIAL PRIMARY KEY,
        law_number VARCHAR(50) NOT NULL,
        law_name VARCHAR(500) NOT NULL,
        article_number VARCHAR(50),
        article_title VARCHAR(500),
        article_text TEXT NOT NULL,
        effective_from DATE NOT NULL,
        effective_to DATE,
        source_url TEXT,
        embedding vector(384),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_law_number ON law_versions(law_number);
      CREATE INDEX IF NOT EXISTS idx_law_article ON law_versions(law_number, article_number);
      CREATE INDEX IF NOT EXISTS idx_law_temporal ON law_versions(law_number, article_number, effective_from, effective_to);
      CREATE INDEX IF NOT EXISTS idx_law_versions_embedding ON law_versions USING hnsw (embedding vector_cosine_ops);
    `);
  }

  /**
   * Belirli bir tarihteki kanun maddesini getirir (Time-Travel)
   */
  static async getAtDate(lawNumber, articleNumber, date) {
    const result = await pool.query(
      `SELECT * FROM law_versions
       WHERE law_number = $1
         AND ($2::varchar IS NULL OR article_number = $2)
         AND effective_from <= $3
         AND (effective_to IS NULL OR effective_to > $3)
       ORDER BY effective_from DESC
       LIMIT 1`,
      [lawNumber, articleNumber, date]
    );
    return result.rows[0];
  }

  /**
   * Bir kanun maddesinin tüm versiyonlarını getirir
   */
  static async getHistory(lawNumber, articleNumber) {
    const result = await pool.query(
      `SELECT * FROM law_versions
       WHERE law_number = $1
         AND ($2::varchar IS NULL OR article_number = $2)
       ORDER BY effective_from DESC`,
      [lawNumber, articleNumber]
    );
    return result.rows;
  }

  /**
   * Kanun arama (metin bazlı)
   */
  static async search(query, { date, limit = 20, offset = 0 } = {}) {
    let sql, params;

    if (date) {
      sql = `SELECT * FROM law_versions
             WHERE (law_name ILIKE $1 OR article_text ILIKE $1 OR law_number ILIKE $1 OR article_title ILIKE $1)
               AND effective_from <= $2
               AND (effective_to IS NULL OR effective_to > $2)
             ORDER BY law_number, article_number, effective_from DESC
             LIMIT $3 OFFSET $4`;
      params = [`%${query}%`, date, limit, offset];
    } else {
      // Tarih verilmezse: tüm güncel (effective_to IS NULL) versiyonları döndür
      // Eğer güncel bulunamazsa tüm versiyonları göster
      sql = `SELECT * FROM law_versions
             WHERE (law_name ILIKE $1 OR article_text ILIKE $1 OR law_number ILIKE $1 OR article_title ILIKE $1)
             ORDER BY law_number, article_number, effective_from DESC
             LIMIT $2 OFFSET $3`;
      params = [`%${query}%`, limit, offset];
    }

    const result = await pool.query(sql, params);
    return result.rows;
  }

  /**
   * Yeni versiyon ekler
   */
  static async insert({ lawNumber, lawName, articleNumber, articleTitle, articleText, effectiveFrom, effectiveTo, sourceUrl }) {
    // Vektörel bağlam için metinleri birleştir
    const textToEmbed = `${lawName} Madde ${articleNumber} - ${articleTitle}. ${articleText}`;
    const embedding = await generateEmbedding(textToEmbed);
    const formattedVector = `[${embedding.join(',')}]`;

    const result = await pool.query(
      `INSERT INTO law_versions (law_number, law_name, article_number, article_title, article_text, effective_from, effective_to, source_url, embedding)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::vector)
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [lawNumber, lawName, articleNumber, articleTitle, articleText, effectiveFrom, effectiveTo, sourceUrl, formattedVector]
    );
    return result.rows[0];
  }

  /**
   * Arama (Semantik / Vektörel)
   */
  static async searchSemantic(queryText, limit = 5) {
    const queryEmbedding = await generateEmbedding(queryText);
    const formattedVector = `[${queryEmbedding.join(',')}]`;

    const sql = `
      SELECT id, law_number, law_name, article_number, article_title, article_text,
             1 - (embedding <=> $1::vector) AS similarity_score
      FROM law_versions
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector
      LIMIT $2;
    `;
    const result = await pool.query(sql, [formattedVector, limit]);
    return result.rows;
  }

  /**
   * Tüm kanun listesini getirir (distinct)
   */
  static async getLawList() {
    const result = await pool.query(
      `SELECT DISTINCT law_number, law_name
       FROM law_versions
       ORDER BY law_number`
    );
    return result.rows;
  }
}

module.exports = LawVersion;
