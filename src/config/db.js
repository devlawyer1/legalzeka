// ============================================================
// Emsal Atlası - Database Configuration (PostgreSQL Wrapper)
// PostgreSQL bağlantı havuzu yapılandırması ve MySQL uyumluluk sarmalayıcısı
// ============================================================

const { Pool } = require('pg');
require('dotenv').config();

const isRenderInternal = process.env.DATABASE_URL?.includes('dpg-') && !process.env.DATABASE_URL?.includes('render.com');

const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Render Internal bağlantıları SSL desteklemez, ancak External bağlantılar ve Production ortamları gerektirir.
  ssl: isRenderInternal ? false : (process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false)
});

/**
 * Bu Wrapper, mysql2 kütüphanesine göre yazılmış tüm mevcut kodların ( [rows] = await pool.query('...') vs.)
 * kod değişikliği yapılmadan PostgreSQL üzerinde çalışmasını sağlar.
 */
const queryWrapper = async (text, params = []) => {
  let i = 1;
  // Soru işaretlerini ($1, $2, ...) PostgreSQL formatına çevir
  let pgText = text.replace(/\?/g, () => `$${i++}`);

  // PostgreSQL'de INSERT işleminde insertId alabilmek için RETURNING id ekle
  const isInsert = pgText.trim().toUpperCase().startsWith('INSERT');
  if (isInsert && !pgText.toUpperCase().includes('RETURNING')) {
    pgText = `${pgText} RETURNING id`;
  }

  try {
    const result = await pgPool.query(pgText, params);
    
    // MySQL davranışını simüle et
    result.insertId = isInsert && result.rows.length > 0 ? result.rows[0].id : null;
    result.affectedRows = result.rowCount;

    // mysql2 [rows, fields] döndürür. Biz de [rows, resultMetadata] döndürüyoruz.
    return [result.rows, result];
  } catch (err) {
    console.error('SQL Error:', pgText, params, err.message);
    throw err;
  }
};

const pool = {
  query: queryWrapper,
  execute: queryWrapper,
  getConnection: async () => {
    const client = await pgPool.connect();
    return {
      query: async (t, p) => queryWrapper(t, p),
      execute: async (t, p) => queryWrapper(t, p),
      release: () => client.release()
    };
  }
};

/**
 * Veritabanı bağlantısını test eder.
 * @returns {Promise<boolean>}
 */
async function testConnection() {
  try {
    const [rows] = await pool.query('SELECT 1 AS ok');
    console.log('✅ PostgreSQL veritabanına (Render) başarıyla bağlanıldı.');
    return true;
  } catch (error) {
    console.error('❌ PostgreSQL bağlantı hatası:', error.message);
    return false;
  }
}

module.exports = { pool, testConnection };
