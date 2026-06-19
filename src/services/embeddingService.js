// ============================================================
// Emsal Atlası - Embedding Service (Plan Uyumluluğu İçin Wrapper)
// Not: Mevcut Worker tabanlı sistemi (src/utils/embedding.js) sarmalar
// ============================================================

const { generateEmbedding } = require('../utils/embedding');

class EmbeddingService {
  constructor() {
    this.modelName = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
  }

  async init() {
    // Model yüklemesi ilk embedding isteğinde utils/embedding.js tarafından yapılır.
    // Bu yüzden burayı boş bırakıyoruz.
  }

  /**
   * Verilen metnin 384 boyutlu vektör (embedding) karşılığını döner.
   */
  async generateEmbedding(text) {
    return await generateEmbedding(text);
  }
}

module.exports = new EmbeddingService();
