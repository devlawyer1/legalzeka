// ============================================================
// Emsal Atlası - Server Entry Point
// Sunucu başlatma ve veritabanı bağlantısı
// ============================================================

const app = require('./src/app');
const { testConnection } = require('./src/config/db');
require('dotenv').config();

const PORT = process.env.PORT || 3000;

async function startServer() {
  console.log('');
  console.log('⚖️  ═══════════════════════════════════════════════════');
  console.log('⚖️   EMSAL ATLASI - LegalTech SaaS API');
  console.log('⚖️  ═══════════════════════════════════════════════════');
  console.log('');

  // Veritabanı bağlantısını test et
  const isDbConnected = await testConnection();

  if (!isDbConnected) {
    console.error('\n❌ Veritabanına bağlanılamadı. Lütfen aşağıdakileri kontrol edin:');
    console.error('   1. Render PostgreSQL URL\'sinin doğru olduğunu kontrol edin.');
    console.error('   2. Eğer yerel bilgisayarınızda (localhost) çalıştırıyorsanız, INTERNAL URL çalışmaz. EXTERNAL URL kullanmanız gerekir!');
    console.error('   3. "npm run migrate" (veya "node src/utils/migrate.js") komutunu çalıştırarak tabloları oluşturduğunuzdan emin olun.\n');
    process.exit(1);
  }

  // Sunucuyu başlat
  app.listen(PORT, () => {
    console.log('');
    console.log(`🚀 Sunucu ${PORT} portunda çalışıyor.`);
    console.log(`📍 http://localhost:${PORT}`);
    console.log(`📍 Health Check: http://localhost:${PORT}/api/health`);
    console.log(`🌍 Ortam: ${process.env.NODE_ENV || 'development'}`);
    console.log('');
    console.log('📋 Kullanılabilir Endpoint\'ler:');
    console.log('   POST   /api/auth/register       - Yeni kayıt');
    console.log('   POST   /api/auth/login           - Giriş');
    console.log('   GET    /api/auth/me              - Profil bilgileri (JWT)');
    console.log('   POST   /api/auth/refresh-token   - Token yenileme');
    console.log('   GET    /api/subscriptions/plans  - Abonelik planları');
    console.log('   GET    /api/subscriptions/my     - Aktif abonelik (JWT)');
    console.log('   GET    /api/subscriptions/history - Abonelik geçmişi (JWT)');
    console.log('');
  });
}

startServer();
