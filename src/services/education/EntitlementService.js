const { pool } = require('../../config/db');

const FEATURES = Object.freeze([
  'EDU_WORKSPACE', 'EDU_CASE_BRIEF', 'EDU_FLASHCARDS', 'EDU_QUIZ', 'EDU_MOOT',
  'ACADEMIC_RESEARCH', 'ACADEMIC_COURSE', 'ACADEMIC_EXPORT',
  'PROFESSIONAL_MATTER', 'PRACTICE_MANAGEMENT', 'AGENT_WORKFLOWS',
]);

function entitlementError(code) {
  const error = new Error(`Feature entitlement required: ${code}`);
  error.status = 403;
  error.code = 'FEATURE_NOT_ENTITLED';
  error.feature = code;
  return error;
}

class EntitlementService {
  constructor({ db = pool } = {}) { this.db = db; }

  async getForUser(userId, { db = this.db } = {}) {
    const { rows } = await db.query(
      `SELECT sp.plan_name, sp.max_seats, sp.feature_entitlements
       FROM user_subscriptions us
       JOIN subscription_plans sp ON sp.id = us.plan_id
       WHERE us.user_id = $1 AND us.is_active = true AND us.end_date >= CURRENT_DATE
       ORDER BY us.created_at DESC LIMIT 1`,
      [userId]
    );
    if (!rows[0]) return { legacyUnrestricted: true, planName: null, maxSeats: null, features: {} };
    const features = rows[0].feature_entitlements || {};
    const hasFeatureContract = FEATURES.some((feature) => Object.hasOwn(features, feature));
    return {
      legacyUnrestricted: !hasFeatureContract,
      planName: rows[0].plan_name,
      maxSeats: rows[0].max_seats,
      features,
    };
  }

  async has(context, feature, options = {}) {
    if (!FEATURES.includes(feature)) throw entitlementError(feature);
    if (context?.isSystemAdmin) return true;
    const entitlement = await this.getForUser(context?.userId, options);
    if (entitlement.legacyUnrestricted) return true;
    return entitlement.features[feature] === true;
  }

  async require(context, feature, options = {}) {
    if (!await this.has(context, feature, options)) throw entitlementError(feature);
    return true;
  }
}

function requireFeature(feature, { service = new EntitlementService() } = {}) {
  return async (req, res, next) => {
    try {
      const { getAccessContext } = require('../accessContext');
      const context = await getAccessContext(req);
      await service.require(context, feature);
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { EntitlementService, FEATURES, entitlementError, requireFeature };
