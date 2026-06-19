// ============================================================
// Emsal Atlası - PostgreSQL VectorDB Seeder
// Hukuki emsal kararlar tablosunu oluşturur ve örnek verileri (vektörleriyle) yükler
// ============================================================

const { pool } = require('../config/db');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const dummyKararlar = require('./mockData.json');

function isTruthy(value) {
  return ['true', '1', 'yes', 'evet'].includes(String(value || '').toLocaleLowerCase('tr-TR'));
}

async function seedDatabase() {
  console.log('🔄 PostgreSQL VectorDB migration başlatılıyor...\n');

  try {
    // 1. Verileri yükle
    console.log('🧠 Yapay zeka modeli yükleniyor ve metinler vektörleştiriliyor (Bu biraz zaman alabilir)...');
    const { generateEmbedding } = require('./embedding');
    
    let successCount = 0;

    // Supabase pgvector eklentisinin var olduğundan emin olalım (migration içinde var ama yine de önlem)
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector;');
    
    if (isTruthy(process.env.EMSAL_SEED_TRUNCATE)) {
      await pool.query('TRUNCATE TABLE emsal_kararlar RESTART IDENTITY CASCADE;');
    }

    console.log("💾 Emsal kararlar PostgreSQL (Supabase) veritabanına yükleniyor...");

    const seedDemoData = isTruthy(process.env.EMSAL_SEED_DEMO_DATA);
    const seedRows = seedDemoData ? dummyKararlar : [];

    if (!seedDemoData) {
      console.log('ℹ️ Demo/mock emsal verisi yüklenmedi. Gerçek veri için MCP cache-first akışı kullanılacak.');
      console.log('ℹ️ Demo veri gerekiyorsa EMSAL_SEED_DEMO_DATA=true ile çalıştırın.');
    }

    for (const karar of seedRows) {
      // Kelime bazlı arama ve RAG için birleşik bir metin içeriği
      const textToEmbed = `${karar.konu}. ${karar.ozet}`;
      const embedding = await generateEmbedding(textToEmbed);
      
      // pgvector için embedding formatı string halinde bir array olmalıdır
      const embeddingString = `[${embedding.join(',')}]`;

      await pool.query(
        `INSERT INTO emsal_kararlar 
        (karar_no, karar_yili, mahkeme, konu, ozet, metin, anahtar_kelimeler, source, verification_status, embedding) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'demo', 'demo', $8)`,
        [
          karar.karar_no,
          karar.karar_yili,
          karar.mahkeme,
          karar.konu,
          karar.ozet,
          karar.metin,
          karar.anahtar_kelimeler,
          embeddingString
        ]
      );
      
      successCount++;
    }

    console.log(`✅ ${successCount} adet emsal karar başarıyla PostgreSQL veritabanına yüklendi.`);

  } catch (error) {
    console.error('❌ PostgreSQL Seed Hatası:', error.message);
  } finally {
    // Connection pool'u kapat ki script kapanabilsin
    // process.exit(0);
  }
}

// Sadece doğrudan çağrıldığında çalıştır
if (require.main === module) {
  seedDatabase().then(() => process.exit(0));
}

module.exports = { seedDatabase };
