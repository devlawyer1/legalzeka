// ============================================================
// Emsal Atlası - Local Embedding Service (Transformers.js)
// Metinleri vektörlere dönüştürür
// ============================================================

let pipeline;

/**
 * Transformers.js kütüphanesini kullanarak feature-extraction pipeline'ını başlatır.
 * Sadece ihtiyaç duyulduğunda (lazy load) yüklenir.
 */
async function getPipeline() {
  if (!pipeline) {
    const transformers = await import('@xenova/transformers');
    // Feature extraction modeli olarak Türkçe destekli çok dilli (multilingual) model kullanıyoruz
    pipeline = await transformers.pipeline('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2');
  }
  return pipeline;
}

/**
 * Verilen metni vektör (embedding) dizisine dönüştürür.
 * @param {string} text - Vektörize edilecek metin
 * @returns {Promise<number[]>} - 384 boyutlu sayı dizisi
 */
async function generateEmbedding(text) {
  try {
    const extractor = await getPipeline();
    // Metni modele verip ortalama (mean pooling) vektörünü alıyoruz
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    // Çıktıyı standart Javascript Array'ine dönüştür
    return Array.from(output.data);
  } catch (error) {
    console.error('Embedding oluşturma hatası:', error);
    throw error;
  }
}

module.exports = { generateEmbedding };
