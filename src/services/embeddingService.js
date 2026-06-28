const { generateEmbedding } = require('../utils/embedding');

class EmbeddingService {
  constructor() {
    this.modelName = process.env.EMBEDDING_MODEL || 'tei-http';
  }

  async init() {
    // The external embedding service is initialized independently.
  }

  async generateEmbedding(text) {
    return generateEmbedding(text);
  }
}

module.exports = new EmbeddingService();
