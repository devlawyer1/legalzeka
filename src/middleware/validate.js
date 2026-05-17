// ============================================================
// Emsal Atlası - Validation Middleware
// Express-validator sonuçlarını işleyen middleware
// ============================================================

const { validationResult } = require('express-validator');

/**
 * Express-validator sonuçlarını kontrol eder.
 * Hata varsa 400 ile döner, yoksa bir sonraki middleware'e geçer.
 */
function validate(req, res, next) {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map((err) => ({
      field: err.path,
      message: err.msg,
    }));

    return res.status(400).json({
      success: false,
      message: 'Doğrulama hatası. Lütfen girdilerinizi kontrol edin.',
      errors: formattedErrors,
    });
  }

  next();
}

module.exports = { validate };
