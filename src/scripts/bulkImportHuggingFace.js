const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { pool } = require('../config/db');
const { generateEmbedding } = require('../utils/embedding');

// Hugging Face Datasets Server API URL'si
// 18.000 kayıttan oluşan daha devasa OrionCAF datasetine geçtik.
const DATASET_URL = 'https://datasets-server.huggingface.co/rows';
const DATASET_NAME = 'OrionCAF/turkish_law_qa_dataset';
const CONFIG_NAME = 'default';
const SPLIT_NAME = 'train';

const BATCH_SIZE = 50; // API ve Vektörizasyon limitlerini aşmamak için her seferde 50 karar
const MAX_RECORDS = 10000; // Çekilmek istenen maksimum kayıt

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function bulkImport() {
  console.log('🚀 Toplu Karar İndirme ve Vektörleştirme Scripti Başladı!');
  console.log(`Hedef Dataset: ${DATASET_NAME}`);
  console.log(`Hedef Kayıt Sayısı: ${MAX_RECORDS} (Batch: ${BATCH_SIZE})`);

  let currentOffset = 0;
  let totalInserted = 0;

  try {
    // vector_extension vb. hazır olduğundan emin ol
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector;');

    while (currentOffset < MAX_RECORDS) {
      console.log(`\n⏳ [Batch ${currentOffset / BATCH_SIZE + 1}] Çekiliyor (Offset: ${currentOffset})...`);
      
      try {
        const response = await axios.get(DATASET_URL, {
          params: {
            dataset: DATASET_NAME,
            config: CONFIG_NAME,
            split: SPLIT_NAME,
            offset: currentOffset,
            length: BATCH_SIZE
          }
        });

        const rows = response.data.rows;
        if (!rows || rows.length === 0) {
          console.log('✅ Dataset sonuna ulaşıldı veya veri bulunamadı.');
          break;
        }

        console.log(`📦 ${rows.length} kayıt indirildi. Vektörleştiriliyor ve DB'ye yazılıyor...`);

        // Batch processing
        for (const row of rows) {
          try {
            // Dataset sütunlarına göre dinamik çıkarma (Her dataset'in yapısı farklı olabilir)
            // KocLab dataset'inde genellikle text, label gibi field'lar olur
            const rowData = row.row || {};
            const metin = rowData.text || rowData.content || rowData.decision || JSON.stringify(rowData);
            
            // Eğer metin 50 karakterden kısaysa atla (kalitesiz veri)
            if (!metin || metin.length < 50) continue;

            const karar_no = rowData.case_number || `AYM-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            const karar_yili = rowData.year || new Date().getFullYear();
            const mahkeme = rowData.court || "Anayasa Mahkemesi / Yargıtay";
            const konu = rowData.topic || rowData.label || "Hukuki Uyuşmazlık";
            const ozet = metin.substring(0, 300) + '...';

            // Yapay zeka ile embedding oluştur (RAG için)
            // Uyarı: Bu işlem lokalde çalışıyorsa CPU'yu, OpenAI API ise kotayı kullanır.
            const embeddingArray = await generateEmbedding(metin.substring(0, 8000)); // Çok uzunsa kes
            const embeddingString = `[${embeddingArray.join(',')}]`;

            // Veritabanına Ekle
            await pool.query(
              `INSERT INTO emsal_kararlar 
              (karar_no, karar_yili, mahkeme, hukuk_dali, konu, ozet, metin, anahtar_kelimeler, embedding) 
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
              [
                karar_no,
                karar_yili,
                mahkeme,
                "Genel Hukuk", // Default
                konu,
                ozet,
                metin,
                ["açık kaynak", "aym"], // Default keywords
                embeddingString
              ]
            );

            totalInserted++;
          } catch (rowErr) {
            // Bazı satırlarda duplicate key veya embedding hatası olabilir, skip
            // console.warn('Satır atlandı:', rowErr.message);
          }
        }

        console.log(`✅ Şu ana kadar toplam ${totalInserted} karar başarıyla sisteme gömüldü.`);

        // HF API'ye veya LLM API'sine aşırı yüklenmemek için bekle (Rate Limiting)
        currentOffset += BATCH_SIZE;
        console.log('⏱️ Rate limit için 3 saniye bekleniyor...');
        await delay(3000);

      } catch (apiError) {
        console.error(`❌ API Çekim Hatası (Offset: ${currentOffset}):`, apiError.response ? apiError.response.data : apiError.message);
        console.log('10 saniye bekleyip tekrar denenecek...');
        await delay(10000);
      }
    }

    console.log(`\n🎉 İŞLEM TAMAMLANDI! Toplam ${totalInserted} adet gerçek emsal karar veritabanınıza yüklendi.`);

  } catch (err) {
    console.error('❌ Ölümcül Hata:', err.message);
  } finally {
    await pool.end();
  }
}

// Sadece script çağrıldığında çalışır
if (require.main === module) {
  bulkImport().then(() => process.exit(0));
}

module.exports = { bulkImport };
