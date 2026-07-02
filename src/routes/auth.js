// ============================================================
// Emsal Atlası - Auth Routes
// Kimlik doğrulama endpoint'leri
// ============================================================

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { distributedRateLimit } = require('../middleware/distributedRateLimit');
const { validate } = require('../middleware/validate');
const {
  registerValidation,
  loginValidation,
  refreshTokenValidation,
  accountEmailValidation,
  accountTokenValidation,
  passwordResetValidation,
} = require('../validators/authValidator');

/**
 * @route   POST /api/auth/register
 * @desc    Yeni kullanıcı kaydı
 * @access  Public
 */
router.post('/register', registerValidation, validate, authController.register);

/**
 * @route   POST /api/auth/login
 * @desc    Kullanıcı girişi
 * @access  Public
 */
router.post('/login', distributedRateLimit({ scope: 'login', limit: Number(process.env.LOGIN_RATE_LIMIT_MAX || 10), windowSeconds: 900, key: (req) => `${req.ip}:${req.body?.email || ''}` }), loginValidation, validate, authController.login);

/**
 * @route   GET /api/auth/me
 * @desc    Mevcut kullanıcı bilgilerini getir
 * @access  Private (JWT gerekli)
 */
router.get('/me', authenticate, authController.getMe);

/**
 * @route   POST /api/auth/refresh-token
 * @desc    Access token yenile
 * @access  Public (Refresh token gerekli)
 */
router.post('/refresh-token', refreshTokenValidation, validate, authController.refreshToken);
router.post('/email-verification/request', distributedRateLimit({ scope: 'email-verification', limit: 5, windowSeconds: 900, key: (req) => `${req.ip}:${req.body?.email || ''}` }), accountEmailValidation, validate, authController.requestEmailVerification);
router.post('/email-verification/complete', accountTokenValidation, validate, authController.verifyEmail);
router.post('/password-reset/request', distributedRateLimit({ scope: 'password-reset', limit: 5, windowSeconds: 900, key: (req) => `${req.ip}:${req.body?.email || ''}` }), accountEmailValidation, validate, authController.requestPasswordReset);
router.post('/password-reset/complete', distributedRateLimit({ scope: 'password-reset-complete', limit: 8, windowSeconds: 900, key: (req) => req.ip }), passwordResetValidation, validate, authController.completePasswordReset);
router.get('/sessions', authenticate, authController.listSessions);
router.delete('/sessions/:sessionId', authenticate, authController.revokeSession);
router.delete('/sessions', authenticate, authController.revokeAllSessions);
router.post('/logout', authenticate, authController.logout);
router.post('/mfa/enroll', authenticate, authController.beginMfaEnrollment);
router.post('/mfa/enable', authenticate, authController.enableMfa);
router.post('/mfa/disable', authenticate, authController.disableMfa);

/**
 * @route   PUT /api/auth/profile
 * @desc    Profil bilgilerini güncelle (Ad, Soyad)
 * @access  Private (JWT gerekli)
 */
router.put('/profile', authenticate, authController.updateProfile);

/**
 * @route   PUT /api/auth/password
 * @desc    Şifre güncelle
 * @access  Private (JWT gerekli)
 */
router.put('/password', authenticate, authController.updatePassword);

module.exports = router;
