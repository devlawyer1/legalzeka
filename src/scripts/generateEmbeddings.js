// ============================================================
// Emsal Atlası - Generate Embeddings Script
// Mevcut law_versions kayıtları için eksik vektörleri hesaplar
// ============================================================

const { pool } = require('../config/db');
const { generateEmbedding } = require('../utils/embedding');

async function syncEmbeddings() {
  console.log('🔄 Eksik vektörler hesaplanıyor...');
  
  // Embedding'i olmayanları bul
  const result = await pool.query('SELECT id, law_name, article_title, article_text FROM law_versions WHERE embedding IS NULL');
  const laws = result.rows;
  
  console.log(`Bulunan kayit sayisi: ${laws.length}`);

  let success = 0;
  for (const law of laws) {
    try {
      const text = `${law.law_name} - ${law.article_title}. ${law.article_text}`;
      const vector = await generateEmbedding(text);
      const vectorStr = `[${vector.join(',')}]`;

      await pool.query('UPDATE law_versions SET embedding = $1::vector WHERE id = $2', [vectorStr, law.id]);
      success++;
      console.log(`[+] ${law.law_name} işlendi.`);
    } catch (e) {
      console.error(`[-] Hata (ID: ${law.id}):`, e.message);
    }
  }

  console.log(`✅ İşlem tamamlandı! ${success}/${laws.length} kanun vektörlendi.`);
  await pool.end();
  process.exit(0);
}

syncEmbeddings();
