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
  const statusCode = Number(err.status || err.statusCode) || (res.statusCode === 200 ? 500 : res.statusCode);

  console.error('❌ Hata:', {
    message: err.message,
    stack: process.env.NODE_ENV !== 'test' ? err.stack : undefined,
    requestId: req.requestId || req.get?.('x-request-id') || undefined,
    url: req.originalUrl,
    method: req.method,
  });

  res.status(statusCode).json({
    success: false,
    message: statusCode >= 500 ? 'Beklenmeyen bir sunucu hatasi olustu.' : err.message,
    ...(err.code && { code: err.code }),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

module.exports = { notFound, errorHandler };
