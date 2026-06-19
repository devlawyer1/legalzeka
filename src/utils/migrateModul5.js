const { pool } = require('../config/db');

const modul5Migration = `
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Resmi Gazete Kayıtları
CREATE TABLE IF NOT EXISTS gazette_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    publish_date DATE NOT NULL,
    title TEXT NOT NULL,
    summary TEXT,
    raw_content TEXT,
    category VARCHAR(255),
    url TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Gönderilen Bültenler
CREATE TABLE IF NOT EXISTS newsletters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sent_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    content_html TEXT NOT NULL,
    recipient_count INTEGER DEFAULT 0
);

-- Bülten Aboneleri
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    preferred_categories TEXT[],
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
`;

async function runMigration() {
    console.log('🔄 Running Module 5 migrations...');
    try {
        await pool.query(modul5Migration);
        console.log('✅ Module 5 tables created successfully.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err);
        process.exit(1);
    }
}

runMigration();
