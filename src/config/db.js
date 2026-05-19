// ============================================================
// Emsal Atlası - Database Configuration
// MySQL bağlantı havuzu (Connection Pool) yapılandırması
// ============================================================

const { Pool } = require('pg');
require('dotenv').config();

// Supabase (PostgreSQL) bağlantı havuzu
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // Supabase'den alacağınız connection string
  ssl: {
    rejectUnauthorized: false // Supabase bağlantıları için genellikle gereklidir
  }
});

// Eğer DATABASE_URL yerine host, user, password vb. kullanmak istenirse:
// const pool = new Pool({
//   host: process.env.DB_HOST,
//   port: parseInt(process.env.DB_PORT, 10) || 5432,
//   user: process.env.DB_USER,
//   password: process.env.DB_PASSWORD,
//   database: process.env.DB_NAME,
//   ssl: { rejectUnauthorized: false }
// });

/**
 * Veritabanı bağlantısını test eder.
 * @returns {Promise<boolean>}
 */
async function testConnection() {
  try {
    const client = await pool.connect();
    console.log('✅ PostgreSQL (Supabase) veritabanına başarıyla bağlanıldı.');
    client.release();
    return true;
  } catch (error) {
    console.error('❌ PostgreSQL bağlantı hatası:', error.message);
    return false;
  }
}

module.exports = { pool, testConnection };
