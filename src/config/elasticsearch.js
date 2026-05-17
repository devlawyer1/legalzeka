// ============================================================
// Emsal Atlası - Elasticsearch Configuration
// Elasticsearch bağlantı yapılandırması
// ============================================================

const { Client } = require('@elastic/elasticsearch');
require('dotenv').config();

const esNode = process.env.ELASTICSEARCH_NODE || 'http://localhost:9200';

const esClient = new Client({
  node: esNode,
  // Single-node geliştirme ortamında self-signed sertifika uyarılarını kapatmak için
  tls: {
    rejectUnauthorized: false
  }
});

/**
 * Elasticsearch bağlantısını test eder.
 * @returns {Promise<boolean>}
 */
async function testEsConnection() {
  try {
    const health = await esClient.cluster.health({});
    console.log(`✅ Elasticsearch veritabanına başarıyla bağlanıldı. Durum: ${health.status}`);
    return true;
  } catch (error) {
    console.error('❌ Elasticsearch bağlantı hatası:', error.message);
    return false;
  }
}

module.exports = { esClient, testEsConnection };
