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

    // 2. Admin kullanıcıları için sınırsız erişim (bypass)
    if (req.user.role === 'Admin') {
      req.subscription = {
        id: -1,
        planId: -1,
        planName: 'Admin Sınırsız',
        maxSearchLimit: -1, // Sınırsız limit
        maxSeats: -1,
        entitlements: {
          maxSeats: -1,
          maxCases: -1,
          maxDocumentAnalyses: -1,
          maxWorkflows: -1,
          clientPortal: true,
          auditLogs: true,
          privateKnowledgeBase: true,
        },
        startDate: new Date(),
        endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 100)),
      };
      return next();
    }

    // 3. Kullanıcının aktif ve süresi dolmamış aboneliğini sorgula
    const { rows: subscriptions } = await pool.query(
      `SELECT us.id, us.plan_id, us.start_date, us.end_date, us.is_active,
              sp.plan_name, sp.max_search_limit, sp.max_seats, sp.price,
              sp.max_cases, sp.max_document_analyses, sp.max_workflows,
              sp.client_portal_enabled, sp.audit_logs_enabled,
              sp.private_knowledge_base_enabled, sp.feature_entitlements
       FROM user_subscriptions us
       JOIN subscription_plans sp ON us.plan_id = sp.id
       WHERE us.user_id = $1
         AND us.is_active = true
         AND us.end_date >= CURRENT_DATE
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
      maxSeats: sub.max_seats,
      entitlements: sub.feature_entitlements || {
        maxSeats: sub.max_seats,
        maxCases: sub.max_cases,
        maxDocumentAnalyses: sub.max_document_analyses,
        maxWorkflows: sub.max_workflows,
        clientPortal: sub.client_portal_enabled,
        auditLogs: sub.audit_logs_enabled,
        privateKnowledgeBase: sub.private_knowledge_base_enabled,
      },
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
