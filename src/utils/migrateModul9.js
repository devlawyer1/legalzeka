require('dotenv').config();
const { pool } = require('../config/db');

async function migrateModul9() {
  console.log('🔄 Modül 9 (Finans) veritabanı tabloları oluşturuluyor...');

  try {
    await pool.query('BEGIN');

    // Faturalar (Invoices) tablosu
    await pool.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        firm_id UUID REFERENCES law_firms(id) ON DELETE CASCADE,
        lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
        case_id UUID REFERENCES cases(id) ON DELETE SET NULL,
        client_name VARCHAR(255) NOT NULL,
        invoice_number VARCHAR(100),
        amount DECIMAL(12, 2) NOT NULL,
        tax_rate DECIMAL(5, 2) DEFAULT 20.00,
        total_amount DECIMAL(12, 2) NOT NULL,
        issue_date DATE NOT NULL,
        due_date DATE NOT NULL,
        status VARCHAR(50) DEFAULT 'pending', -- pending, paid, overdue, cancelled
        notes TEXT,
        is_recurring BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Ödemeler (Payments) tablosu
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        firm_id UUID REFERENCES law_firms(id) ON DELETE CASCADE,
        invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
        amount DECIMAL(12, 2) NOT NULL,
        payment_date DATE NOT NULL,
        payment_method VARCHAR(100), -- bank_transfer, credit_card, cash
        reference_no VARCHAR(255),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query('COMMIT');
    console.log('✅ Modül 9 (Finans) tabloları başarıyla oluşturuldu!');

  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('❌ Migration hatası (Modül 9):', error);
  } finally {
    process.exit(0);
  }
}

migrateModul9();
