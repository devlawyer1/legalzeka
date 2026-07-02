function parseHeaders(value) {
  return Object.fromEntries(String(value || '').split(',').map((item) => item.trim()).filter(Boolean).map((item) => {
    const index = item.indexOf('=');
    return index > 0 ? [item.slice(0, index).trim(), item.slice(index + 1).trim()] : [item, ''];
  }));
}

class DisabledErrorTrackingProvider {
  status() { return 'UNCONFIGURED'; }
  async capture() { return { delivered: false, reason: 'UNCONFIGURED' }; }
}

class OtlpErrorTrackingProvider {
  constructor({ endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT, headers = process.env.OTEL_EXPORTER_OTLP_HEADERS, timeoutMs = 3000 } = {}) {
    const base = new URL(endpoint);
    if (process.env.NODE_ENV === 'production' && base.protocol !== 'https:') throw new Error('Production OTLP endpoint must use HTTPS.');
    this.endpoint = new URL(base.pathname.endsWith('/v1/logs') ? base.pathname : `${base.pathname.replace(/\/$/, '')}/v1/logs`, base).toString();
    this.headers = parseHeaders(headers);
    this.timeoutMs = timeoutMs;
  }

  status() { return 'CONFIGURED'; }

  async capture(error, context = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const attributes = [
      ['error.type', error.code || 'INTERNAL_ERROR'], ['http.request_id', context.requestId],
      ['trace.id', context.traceId], ['span.id', context.spanId], ['http.route', context.route],
      ['http.request.method', context.method], ['deployment.environment', process.env.NODE_ENV || 'development'],
      ['service.version', process.env.RELEASE_VERSION || 'dev'],
    ].filter(([, value]) => value !== undefined).map(([key, value]) => ({ key, value: { stringValue: String(value).slice(0, 256) } }));
    const payload = { resourceLogs: [{ resource: { attributes: [{ key: 'service.name', value: { stringValue: process.env.OTEL_SERVICE_NAME || 'legalzeka-backend' } }] }, scopeLogs: [{ scope: { name: 'legalzeka.error-tracking' }, logRecords: [{ timeUnixNano: (BigInt(Date.now()) * 1000000n).toString(), severityText: 'ERROR', body: { stringValue: error.code || 'INTERNAL_ERROR' }, attributes }] }] }] };
    try {
      const response = await fetch(this.endpoint, { method: 'POST', headers: { 'content-type': 'application/json', ...this.headers }, body: JSON.stringify(payload), signal: controller.signal });
      if (!response.ok) throw new Error(`OTLP exporter returned ${response.status}.`);
      return { delivered: true };
    } finally { clearTimeout(timer); }
  }
}

let singleton;
function getErrorTrackingProvider() {
  if (!singleton) singleton = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
    ? new OtlpErrorTrackingProvider()
    : new DisabledErrorTrackingProvider();
  return singleton;
}

module.exports = { DisabledErrorTrackingProvider, OtlpErrorTrackingProvider, getErrorTrackingProvider, parseHeaders };
