// ============================================================
// Emsal Atlası - Hata Yakalama Middleware
// Merkezi hata yönetimi
// ============================================================

/**
 * 404 - Bulunamadı hatası middleware'i.
 * Tanımlanmamış route'lara yapılan istekleri yakalar.
 */
function notFound(req, res, next) {
  const error = new Error(`Bulunamadı - ${req.originalUrl}`);
  res.status(404);
  next(error);
}

/**
 * Genel hata yakalama middleware'i.
 * Tüm yakalanmamış hataları merkezi olarak yönetir.
 */
function errorHandler(err, req, res, next) {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;

  console.error('❌ Hata:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    url: req.originalUrl,
    method: req.method,
  });

  res.status(statusCode).json({
    success: false,
    message: err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

module.exports = { notFound, errorHandler };
