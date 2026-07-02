// ============================================================
// Emsal Atlası - Auth Validation
// Kayıt ve giriş isteği doğrulama kuralları
// ============================================================

const { body } = require('express-validator');

/**
 * Kayıt (Register) doğrulama kuralları.
 */
const registerValidation = [
  body('firstName')
    .trim()
    .notEmpty()
    .withMessage('Ad alanı zorunludur.')
    .isLength({ min: 2, max: 100 })
    .withMessage('Ad 2-100 karakter arasında olmalıdır.'),

  body('lastName')
    .trim()
    .notEmpty()
    .withMessage('Soyad alanı zorunludur.')
    .isLength({ min: 2, max: 100 })
    .withMessage('Soyad 2-100 karakter arasında olmalıdır.'),

  body('email')
    .trim()
    .notEmpty()
    .withMessage('E-posta alanı zorunludur.')
    .isEmail()
    .withMessage('Geçerli bir e-posta adresi giriniz.')
    .normalizeEmail(),

  body('password')
    .notEmpty()
    .withMessage('Şifre alanı zorunludur.')
    .isLength({ min: 8 })
    .withMessage('Şifre en az 8 karakter olmalıdır.')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Şifre en az bir büyük harf, bir küçük harf ve bir rakam içermelidir.'),

  body('passwordConfirm')
    .notEmpty()
    .withMessage('Şifre tekrarı alanı zorunludur.')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Şifreler eşleşmiyor.');
      }
      return true;
    }),
];

/**
 * Giriş (Login) doğrulama kuralları.
 */
const loginValidation = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('E-posta alanı zorunludur.')
    .isEmail()
    .withMessage('Geçerli bir e-posta adresi giriniz.')
    .normalizeEmail(),

  body('password')
    .notEmpty()
    .withMessage('Şifre alanı zorunludur.'),
];

/**
 * Refresh token doğrulama kuralları.
 */
const refreshTokenValidation = [
  body('refreshToken')
    .optional(),
];

const accountEmailValidation = [body('email').trim().isEmail().normalizeEmail().withMessage('Gecerli bir e-posta adresi gereklidir.')];
const accountTokenValidation = [body('token').isString().isLength({ min: 32, max: 200 }).withMessage('Gecerli bir token gereklidir.')];
const passwordResetValidation = [
  ...accountTokenValidation,
  body('newPassword').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Yeni parola guclu olmalidir.'),
];

module.exports = {
  registerValidation,
  loginValidation,
  refreshTokenValidation,
  accountEmailValidation,
  accountTokenValidation,
  passwordResetValidation,
};
