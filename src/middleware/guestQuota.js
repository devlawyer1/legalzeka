// ============================================================
// Emsal Atlası - Guest Quota Middleware
// Kayıtsız (misafir) kullanıcıların IP bazlı arama limitini kontrol eder.
// ============================================================

const { pool } = require('../config/db');

const GUEST_SEARCH_LIMIT = 3;

async function guestQuota(req, res, next) {
  try {
    // Eğer kullanıcı giriş yapmışsa (req.user varsa), kota kontrolünü atla
    // çünkü onları checkSubscription middleware'i kontrol edecek.
    if (req.user) {
      return next();
    }

    const ipAddress = req.ip || req.connection.remoteAddress;

    const { rows } = await pool.query(
      'SELECT search_count, last_search_at FROM guest_searches WHERE ip_address = $1',
      [ipAddress]
    );

    if (rows.length === 0) {
      // İlk kez arama yapıyor
      await pool.query(
        'INSERT INTO guest_searches (ip_address, search_count) VALUES ($1, 1)',
        [ipAddress]
      );
      req.subscription = {
        planName: "Misafir",
        maxSearchLimit: GUEST_SEARCH_LIMIT,
        currentCount: 1
      };
      return next();
    }

    const guest = rows[0];
    const lastSearchDate = new Date(guest.last_search_at);
    const now = new Date();
    const hoursSinceLastSearch = (now - lastSearchDate) / (1000 * 60 * 60);

    // Eğer son aramadan bu yana 24 saat geçmişse, kotayı sıfırla
    if (hoursSinceLastSearch > 24) {
      await pool.query(
        'UPDATE GuestSearches SET search_count = 1, last_search_at = CURRENT_TIMESTAMP WHERE ip_address = $1',
        [ipAddress]
      );
      req.subscription = {
        planName: "Misafir",
        maxSearchLimit: GUEST_SEARCH_LIMIT,
        currentCount: 1
      };
      return next();
    }

    // Kota dolmuşsa reddet
    if (guest.search_count >= GUEST_SEARCH_LIMIT) {
      return res.status(403).json({
        success: false,
        code: 'GUEST_LIMIT_EXCEEDED',
        message: 'Günlük ücretsiz arama limitinize (3) ulaştınız. Sınırsız arama ve AI yorumları için lütfen ücretsiz kayıt olun.',
      });
    }

    // Kota dolmamışsa artır
    await pool.query(
      'UPDATE GuestSearches SET search_count = search_count + 1, last_search_at = CURRENT_TIMESTAMP WHERE ip_address = $1',
      [ipAddress]
    );

    req.subscription = {
      planName: "Misafir",
      maxSearchLimit: GUEST_SEARCH_LIMIT,
      currentCount: guest.search_count + 1
    };

    next();
  } catch (error) {
    console.error('❌ Misafir kota kontrol hatası:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Kota kontrolü sırasında bir hata oluştu.',
    });
  }
}

module.exports = { guestQuota };
