const SAFE_CODES = new Set([
  'AUTH_REQUIRED','ACCESS_DENIED','RESOURCE_NOT_FOUND','VALIDATION_FAILED','TENANT_SCOPE_VIOLATION',
  'PROVIDER_UNAVAILABLE','PROVIDER_UNCONFIGURED','RATE_LIMITED','BUDGET_EXCEEDED','DEPENDENCY_TIMEOUT',
  'STORAGE_FAILURE','DATABASE_UNAVAILABLE','MIGRATION_REQUIRED','CSRF_INVALID','CORS_DENIED',
]);
const { getErrorTrackingProvider } = require('../services/observability');

function safeLogMessage(message, statusCode) {
  if (process.env.NODE_ENV === 'production' && statusCode >= 500) return 'Internal request failure.';
  return String(message || 'Request failed.')
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/[A-Za-z]:\\[^\s]+|\/(?:[^\s/]+\/)+[^\s]+/g, '[path]')
    .replace(/(password|secret|token|authorization)\s*[:=]\s*\S+/gi, '$1=[redacted]')
    .slice(0, 500);
}

function notFound(req, res, next) {
  const error = Object.assign(new Error('Resource not found.'), { code: 'RESOURCE_NOT_FOUND' });
  res.status(404);
  next(error);
}

function errorHandler(err, req, res, next) {
  void next;
  const statusCode = Number(err.status || err.statusCode) || (res.statusCode === 200 ? 500 : res.statusCode);
  const code = err.code || (statusCode === 404 ? 'RESOURCE_NOT_FOUND' : 'INTERNAL_ERROR');
  const loggedMessage = safeLogMessage(err.message, statusCode);
  console.error(JSON.stringify({
    level: 'error', event: 'request_failed', service: process.env.OTEL_SERVICE_NAME || 'legalzeka-backend',
    environment: process.env.NODE_ENV || 'development', release: process.env.RELEASE_VERSION || 'dev',
    message: loggedMessage, code, stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    requestId: req.requestId, traceId: req.traceId, spanId: req.spanId,
    route: req.route?.path || req.path, method: req.method,
  }));
  void getErrorTrackingProvider().capture({ code }, {
    requestId: req.requestId, traceId: req.traceId, spanId: req.spanId,
    route: req.route?.path || req.path, method: req.method,
  }).catch(() => {});
  const safeClientMessage = SAFE_CODES.has(code)
    ? err.message
    : statusCode >= 500
      ? 'Beklenmeyen bir sunucu hatasi olustu.'
      : process.env.NODE_ENV !== 'production' ? err.message : 'Request could not be completed.';
  res.status(statusCode).json({
    success: false, message: safeClientMessage, code, requestId: req.requestId,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

module.exports = { SAFE_CODES, notFound, errorHandler, safeLogMessage };
