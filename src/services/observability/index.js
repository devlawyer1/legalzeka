const metrics = new Map();
const { getErrorTrackingProvider } = require('./ErrorTrackingProvider');
const SAFE_ATTRIBUTES = new Set(['method','route','status','service','provider','operation','result','queue','model']);

function safeAttributes(attributes = {}) {
  return Object.fromEntries(Object.entries(attributes).filter(([key]) => SAFE_ATTRIBUTES.has(key)).map(([key, value]) => [key, String(value).slice(0, 120)]));
}

function metricKey(name, attributes) {
  const labels = Object.entries(safeAttributes(attributes)).sort().map(([key, value]) => `${key}="${value.replace(/["\\]/g, '')}"`).join(',');
  return labels ? `${name}{${labels}}` : name;
}

function increment(name, value = 1, attributes = {}) {
  const key = metricKey(name, attributes); metrics.set(key, (metrics.get(key) || 0) + Number(value));
}

function observe(name, value, attributes = {}) {
  increment(`${name}_count`, 1, attributes); increment(`${name}_sum`, Number(value), attributes);
}

function renderMetrics() {
  return [...metrics.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${key} ${value}`).join('\n') + '\n';
}

function log(level, event, fields = {}) {
  const blocked = /prompt|content|document|answer|message|token|secret|password|authorization/i;
  const safe = Object.fromEntries(Object.entries(fields).filter(([key]) => !blocked.test(key)).map(([key, value]) => [key, typeof value === 'string' ? value.slice(0, 500) : value]));
  const line = { timestamp: new Date().toISOString(), level, event, service: process.env.OTEL_SERVICE_NAME || 'legalzeka', environment: process.env.NODE_ENV || 'development', release: process.env.RELEASE_VERSION || 'dev', ...safe };
  (level === 'error' ? console.error : console.log)(JSON.stringify(line));
}

function httpMetrics(req, res, next) {
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const duration = Number(process.hrtime.bigint() - started) / 1e9;
    const attributes = { method: req.method, route: req.route?.path || req.path, status: res.statusCode };
    observe('http_request_duration_seconds', duration, attributes);
    if (res.statusCode >= 400) increment('http_error_total', 1, attributes);
    log('info', 'http_request', { requestId: req.requestId, traceId: req.traceId, spanId: req.spanId, method: req.method, route: req.path, status: res.statusCode, durationMs: Math.round(duration * 1000) });
  });
  next();
}

module.exports = { getErrorTrackingProvider, httpMetrics, increment, log, metrics, observe, renderMetrics, safeAttributes };
