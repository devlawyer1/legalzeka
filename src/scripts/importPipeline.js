require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const fs = require('fs');
const { pool } = require('../config/db');
const { generateEmbedding } = require('../utils/embedding');

async function importData() {
  try {
    const filePath = process.argv[2];
    if (!filePath) {
      console.error('Lütfen bir JSON dosya yolu belirtin. Örn: node importPipeline.js data.json');
      process.exit(1);
    }

    if (!fs.existsSync(filePath)) {
      console.error(`Dosya bulunamadı: ${filePath}`);
      process.exit(1);
    }

    const fileContent = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(fileContent);

    if (!Array.isArray(data)) {
      console.error('JSON dosyası bir array içermelidir.');
      process.exit(1);
    }

    console.log(`Toplam ${data.length} adet karar işlenecek...`);

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      try {
        const textForEmbedding = `${item.konu || ''} ${item.ozet || ''} ${item.metin || ''}`.trim();
        
        // Vektör oluştur
        let embeddingVector = null;
        if (textForEmbedding.length > 0) {
          const vector = await generateEmbedding(textForEmbedding);
          embeddingVector = `[${vector.join(',')}]`;
        }

        // Veritabanına kaydet
        await pool.query(`
          INSERT INTO emsal_kararlar (
            karar_no, karar_yili, mahkeme, hukuk_dali, konu, ozet, metin, anahtar_kelimeler, embedding
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          item.karar_no,
          item.karar_yili,
          item.mahkeme,
          item.hukuk_dali,
          item.konu,
          item.ozet,
          item.metin,
          item.anahtar_kelimeler || [],
          embeddingVector
        ]);

        successCount++;
        process.stdout.write(`\rİşlenen: ${i + 1}/${data.length} (Başarılı: ${successCount}, Hata: ${errorCount})`);
      } catch (err) {
        errorCount++;
        console.error(`\nHata oluştu (Karar No: ${item.karar_no}):`, err.message);
      }
    }

    console.log(`\nİşlem tamamlandı. ${successCount} eklendi, ${errorCount} hata.`);
  } catch (error) {
    console.error('Kritik hata:', error);
  } finally {
    pool.end();
  }
}

importData();
