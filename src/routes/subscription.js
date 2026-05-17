// ============================================================
// Emsal Atlası - Subscription Routes
// Abonelik endpoint'leri
// ============================================================

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const UserSubscription = require('../models/UserSubscription');

/**
 * @route   GET /api/subscriptions/plans
 * @desc    Tüm abonelik planlarını listeler
 * @access  Public
 */
router.get('/plans', async (req, res, next) => {
  try {
    const plans = await SubscriptionPlan.findAll();
    res.status(200).json({
      success: true,
      data: plans,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/subscriptions/my
 * @desc    Kullanıcının aktif aboneliğini getirir
 * @access  Private
 */
router.get('/my', authenticate, async (req, res, next) => {
  try {
    const subscription = await UserSubscription.findActiveByUserId(req.user.id);

    if (!subscription) {
      return res.status(200).json({
        success: true,
        message: 'Aktif aboneliğiniz bulunmamaktadır.',
        data: null,
      });
    }

    res.status(200).json({
      success: true,
      data: {
        planName: subscription.plan_name,
        maxSearchLimit: subscription.max_search_limit,
        startDate: subscription.start_date,
        endDate: subscription.end_date,
        isActive: subscription.is_active,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/subscriptions/history
 * @desc    Kullanıcının abonelik geçmişini getirir
 * @access  Private
 */
router.get('/history', authenticate, async (req, res, next) => {
  try {
    const subscriptions = await UserSubscription.findAllByUserId(req.user.id);
    res.status(200).json({
      success: true,
      data: subscriptions,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
