// ============================================================
// Emsal Atlası - Auth Routes
// Kimlik doğrulama endpoint'leri
// ============================================================

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const {
  registerValidation,
  loginValidation,
  refreshTokenValidation,
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
router.post('/login', loginValidation, validate, authController.login);

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
