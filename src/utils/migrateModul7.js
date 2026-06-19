const { pool } = require('../config/db');

async function migrate() {
  try {
    console.log('Creating leads table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS leads (
          id UUID PRIMARY KEY,
          firm_id UUID NOT NULL REFERENCES law_firms(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          contact_info TEXT,
          subject VARCHAR(255),
          estimated_value DECIMAL(12, 2) DEFAULT 0.00,
          stage VARCHAR(50) NOT NULL DEFAULT 'ilk_gorusme', -- ilk_gorusme, teklif_hazirlaniyor, pazarlik, sozlesme_imzalandi, iptal
          assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
          notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('Creating proposals table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS proposals (
          id UUID PRIMARY KEY,
          lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
          firm_id UUID NOT NULL REFERENCES law_firms(id) ON DELETE CASCADE,
          title VARCHAR(255) NOT NULL,
          content TEXT NOT NULL,
          amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
          pdf_url VARCHAR(255),
          status VARCHAR(50) NOT NULL DEFAULT 'taslak', -- taslak, gonderildi, kabul_edildi, reddedildi
          created_by UUID REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('Modul 7 (CRM) Migration completed successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    process.exit(0);
  }
}

migrate();
