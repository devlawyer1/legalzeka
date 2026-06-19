require('dotenv').config();
const { pool } = require('../config/db');

async function migrateModul8and10() {
  console.log('🔄 Modül 8 & 10 veritabanı tabloları oluşturuluyor...');

  try {
    await pool.query('BEGIN');

    // Şirket Ağacı (Corporate Entities - Modül 10)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS corporate_entities (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        firm_id UUID REFERENCES law_firms(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        parent_id UUID REFERENCES corporate_entities(id) ON DELETE SET NULL, -- Ağaç yapısı için
        type VARCHAR(100), -- holding, subsidiary, affiliate, branch
        share_percentage DECIMAL(5, 2), -- Hissedar oranı
        tax_number VARCHAR(100),
        industry VARCHAR(100),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // VIP Müvekkil Talepleri (Client Tickets / SLA - Modül 8)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS client_tickets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        firm_id UUID REFERENCES law_firms(id) ON DELETE CASCADE,
        client_name VARCHAR(255) NOT NULL,
        is_vip BOOLEAN DEFAULT false,
        subject VARCHAR(255) NOT NULL,
        description TEXT,
        status VARCHAR(50) DEFAULT 'open', -- open, in_progress, resolved
        priority VARCHAR(50) DEFAULT 'medium', -- low, medium, high, urgent
        due_date TIMESTAMP, -- SLA için son yanıtlanma süresi
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query('COMMIT');
    console.log('✅ Modül 8 & 10 tabloları başarıyla oluşturuldu!');

  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('❌ Migration hatası (Modül 8 & 10):', error);
  } finally {
    process.exit(0);
  }
}

migrateModul8and10();
