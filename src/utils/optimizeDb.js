require('dotenv').config();
const { pool } = require('../config/db');

async function optimizeDb() {
  console.log('🔄 PostgreSQL Optimizasyon scripti başlatılıyor...\n');
  const client = await pool.connect();
  
  try {
    // 1. search_vector sütununu ekle
    console.log('1. search_vector sütunu ekleniyor...');
    await client.query(`
      ALTER TABLE emsal_kararlar 
      ADD COLUMN IF NOT EXISTS search_vector tsvector 
      GENERATED ALWAYS AS (
        to_tsvector('turkish', coalesce(konu, '') || ' ' || coalesce(ozet, '') || ' ' || coalesce(metin, ''))
      ) STORED;
    `);

    // 2. FTS indeksini oluştur
    console.log('2. FTS indeksi (GIN) oluşturuluyor...');
    await client.query(`
      DROP INDEX IF EXISTS idx_emsal_kararlar_fts;
      CREATE INDEX IF NOT EXISTS idx_emsal_kararlar_fts ON emsal_kararlar USING GIN (search_vector);
    `);

    // 3. HNSW indeksini oluştur
    console.log('3. HNSW Vektör indeksi oluşturuluyor (Bu işlem veritabanı boyutuna göre sürebilir)...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_emsal_kararlar_embedding 
      ON emsal_kararlar USING hnsw (embedding vector_cosine_ops);
    `);

    console.log('\n✅ Optimizasyonlar başarıyla tamamlandı!');
  } catch (error) {
    console.error('❌ Optimizasyon sırasında hata oluştu:', error);
  } finally {
    client.release();
    process.exit(0);
  }
}

optimizeDb();
