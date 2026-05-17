// ============================================================
// Emsal Atlası - Elasticsearch Seeder
// Hukuki emsal kararlar indexini oluşturur ve örnek verileri yükler
// ============================================================

const { esClient } = require('../config/elasticsearch');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const INDEX_NAME = 'emsal_kararlar';

const dummyKararlar = require('./mockData.json');

async function seedElastic() {
  console.log('🔄 Elasticsearch migration başlatılıyor...\n');

  try {
    // 1. Index var mı kontrol et, varsa sil (Temiz bir başlangıç için)
    const exists = await esClient.indices.exists({ index: INDEX_NAME });
    if (exists) {
      console.log(`🗑️ Mevcut '${INDEX_NAME}' indexi siliniyor...`);
      await esClient.indices.delete({ index: INDEX_NAME });
    }

    // 2. Index oluştur ve Mapping ayarla
    console.log(`📦 Yeni '${INDEX_NAME}' indexi oluşturuluyor...`);
    await esClient.indices.create({
      index: INDEX_NAME,
      body: {
        settings: {
          analysis: {
            analyzer: {
              turkish_analyzer: {
                type: 'custom',
                tokenizer: 'standard',
                filter: ['lowercase', 'turkish_stop', 'turkish_stemmer']
              }
            },
            filter: {
              turkish_stop: {
                type: 'stop',
                stopwords: '_turkish_'
              },
              turkish_stemmer: {
                type: 'stemmer',
                language: 'turkish'
              }
            }
          }
        },
        mappings: {
          properties: {
            karar_no: { type: 'keyword' },
            karar_yili: { type: 'integer' },
            mahkeme: { type: 'text', analyzer: 'turkish_analyzer' },
            konu: { type: 'text', analyzer: 'turkish_analyzer' },
            ozet: { type: 'text', analyzer: 'turkish_analyzer' },
            metin: { type: 'text', analyzer: 'turkish_analyzer' },
            anahtar_kelimeler: { type: 'keyword' },
            
            // Aşama 3: Semantik arama vektör alanı (all-MiniLM-L6-v2 boyutu: 384)
            embedding: { type: 'dense_vector', dims: 384, index: true, similarity: 'cosine' }
          }
        }
      }
    });

    // 3. Verileri Bulk API ile yükle (Önce embedding'leri oluştur)
    console.log('🧠 Yapay zeka modeli yükleniyor ve metinler vektörleştiriliyor (Bu biraz zaman alabilir)...');
    const { generateEmbedding } = require('./embedding');
    
    // Her karar için "konu" ve "ozet" metnini birleştirip vektörize edelim
    const kararlarVektorlu = [];
    for (const karar of dummyKararlar) {
      const textToEmbed = `${karar.konu}. ${karar.ozet}`;
      const embedding = await generateEmbedding(textToEmbed);
      kararlarVektorlu.push({ ...karar, embedding });
    }

    console.log("💾 Emsal kararlar Elasticsearch'e yükleniyor...");
    
    const operations = kararlarVektorlu.flatMap(doc => [
      { index: { _index: INDEX_NAME } },
      doc
    ]);

    const bulkResponse = await esClient.bulk({ refresh: true, operations });

    if (bulkResponse.errors) {
      console.error('❌ Bulk operasyonunda hata oluştu.');
      console.log(bulkResponse.items.filter(item => item.index && item.index.error));
    } else {
      console.log(`✅ ${dummyKararlar.length} adet emsal karar başarıyla yüklendi.`);
    }

  } catch (error) {
    console.error('❌ Elasticsearch Seed Hatası:', error.message);
  }
}

// Sadece doğrudan çağrıldığında çalıştır
if (require.main === module) {
  seedElastic().then(() => process.exit(0));
}

module.exports = { seedElastic };
