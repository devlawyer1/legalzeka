// ============================================================
// Emsal Atlası - Database Migration (PostgreSQL)
// Veritabanı tablolarını oluşturur ve seed data ekler
// ============================================================

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { pool } = require('../config/db');

async function migrate() {
  try {
    console.log('🔄 Migration başlatılıyor...\n');

    // SQL dosyasını oku
    const sqlFilePath = path.join(__dirname, '..', 'config', 'database.sql');
    const sql = fs.readFileSync(sqlFilePath, 'utf8');

    // SQL komutlarını çalıştır
    await pool.query(sql);

    console.log('✅ Veritabanı tabloları başarıyla oluşturuldu.');
    console.log('✅ Varsayılan roller ve abonelik planları eklendi.');
    console.log('\n🎉 Migration tamamlandı!');
  } catch (error) {
    console.error('❌ Migration hatası:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Doğrudan çalıştırılırsa migrate et
if (require.main === module) {
  migrate().then(() => process.exit(0));
}

module.exports = { migrate };
