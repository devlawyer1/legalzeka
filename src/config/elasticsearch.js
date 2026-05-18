// ============================================================
// Emsal Atlası - Elasticsearch Configuration
// Elasticsearch bağlantı yapılandırması
// ============================================================

const { Client } = require('@elastic/elasticsearch');
require('dotenv').config();

const esNode = process.env.ELASTICSEARCH_NODE || 'http://localhost:9200';
const esCloudId = process.env.ELASTICSEARCH_CLOUD_ID;
const esApiKey = process.env.ELASTICSEARCH_API_KEY;
const esUsername = process.env.ELASTICSEARCH_USERNAME;
const esPassword = process.env.ELASTICSEARCH_PASSWORD;

let clientConfig = {};

if (esCloudId) {
  // Elastic Cloud (Serverless veya Managed) bağlantısı
  clientConfig.cloud = {
    id: esCloudId
  };
} else {
  // Dış kaynak url'si (Aiven, Bonsai, AWS vb.) veya Local bağlantı
  clientConfig.node = esNode;
}

// Kimlik doğrulama ayarları
if (esApiKey) {
  clientConfig.auth = { apiKey: esApiKey };
} else if (esUsername && esPassword) {
  clientConfig.auth = {
    username: esUsername,
    password: esPassword
  };
}

// Sadece local ortamda SSL hatalarını yok say
if (!esCloudId && esNode.includes('localhost')) {
  clientConfig.tls = {
    rejectUnauthorized: false
  };
}

const esClient = new Client(clientConfig);

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
