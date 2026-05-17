// ============================================================
// Emsal Atlası - Subscription Guard Middleware
// Aktif abonelik kontrolü - Arama gibi premium özelliklere
// erişimi aboneliği olan kullanıcılarla sınırlar.
//
// Kullanım: authenticate → checkSubscription → route handler
// ============================================================

const { pool } = require('../config/db');

/**
 * Aktif abonelik kontrol middleware'i.
 *
 * Bu middleware, authenticate middleware'inden SONRA çalıştırılmalıdır.
 * req.user.id kullanarak UserSubscriptions tablosunda aktif ve süresi
 * dolmamış bir abonelik arar.
 *
 * Akış:
 *   1. req.user var mı? (authenticate çalışmış mı?)
 *   2. UserSubscriptions tablosunda:
 *      - user_id = req.user.id
 *      - is_active = 1
 *      - end_date >= bugünün tarihi
 *   3. Aktif abonelik varsa → req.subscription'a bilgileri ekler, next()
 *   4. Aktif abonelik yoksa → 403 Forbidden döner
 */
async function checkSubscription(req, res, next) {
  try {
    // 1. authenticate middleware'inin çalıştığından emin ol
    if (!req.user) {
      if (req.subscription && req.subscription.planName === "Misafir") {
        return next(); // Misafir kotası tarafından onaylanmış
      }
      return res.status(401).json({
        success: false,
        message: 'Önce kimlik doğrulaması yapılmalıdır.',
      });
    }

    // 2. Kullanıcının aktif ve süresi dolmamış aboneliğini sorgula
    const [subscriptions] = await pool.query(
      `SELECT us.id, us.plan_id, us.start_date, us.end_date, us.is_active,
              sp.plan_name, sp.max_search_limit, sp.price
       FROM UserSubscriptions us
       JOIN SubscriptionPlans sp ON us.plan_id = sp.id
       WHERE us.user_id = ?
         AND us.is_active = 1
         AND us.end_date >= CURDATE()
       ORDER BY us.end_date DESC
       LIMIT 1`,
      [req.user.id]
    );

    // 3. Aktif abonelik yoksa → 403 Forbidden
    if (subscriptions.length === 0) {
      return res.status(403).json({
        success: false,
        code: 'SUBSCRIPTION_REQUIRED',
        message: 'Bu özelliği kullanabilmek için aktif bir aboneliğe ihtiyacınız var. Lütfen aboneliğinizi yenileyin.',
        data: {
          renewUrl: '/api/subscriptions/plans',
        },
      });
    }

    // 4. Abonelik bilgisini request'e ekle (sonraki middleware/controller kullanabilsin)
    const sub = subscriptions[0];
    req.subscription = {
      id: sub.id,
      planId: sub.plan_id,
      planName: sub.plan_name,
      maxSearchLimit: sub.max_search_limit,
      startDate: sub.start_date,
      endDate: sub.end_date,
    };

    next();
  } catch (error) {
    console.error('❌ Abonelik kontrol hatası:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Abonelik kontrolü sırasında bir hata oluştu.',
    });
  }
}

module.exports = { checkSubscription };
