// ============================================================
// Emsal Atlası - Database Migration
// Veritabanı tablolarını oluşturur ve seed data ekler
// ============================================================

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const mysql = require('mysql2/promise');

async function migrate() {
  let connection;

  try {
    // Önce veritabanı olmadan bağlan
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT, 10) || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      multipleStatements: true,
    });

    console.log('🔄 Migration başlatılıyor...\n');

    // SQL dosyasını oku
    const sqlFilePath = path.join(__dirname, '..', 'config', 'database.sql');
    const sql = fs.readFileSync(sqlFilePath, 'utf8');

    // SQL komutlarını çalıştır
    await connection.query(sql);

    console.log('✅ Veritabanı tabloları başarıyla oluşturuldu.');
    console.log('✅ Varsayılan roller ve abonelik planları eklendi.');
    console.log('\n🎉 Migration tamamlandı!');
  } catch (error) {
    console.error('❌ Migration hatası:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Doğrudan çalıştırılırsa migrate et
if (require.main === module) {
  migrate().then(() => process.exit(0));
}

module.exports = { migrate };
