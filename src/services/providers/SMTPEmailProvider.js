const nodemailer = require('nodemailer');
const { getRedisProvider } = require('../redis/RedisProvider');

function providerError(message, code = 'PROVIDER_UNAVAILABLE', status = 503) {
  return Object.assign(new Error(message), { code, status });
}

class SMTPEmailProvider {
  constructor({ transporter, redis = getRedisProvider(), config = process.env } = {}) {
    this.redis = redis;
    this.config = config;
    this.configured = Boolean(transporter || (config.SMTP_HOST && config.SMTP_FROM));
    this.transporter = transporter || (this.configured ? nodemailer.createTransport({
      host: config.SMTP_HOST, port: Number(config.SMTP_PORT || 587), secure: config.SMTP_SECURE === 'true',
      auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD } : undefined,
      requireTLS: config.SMTP_REQUIRE_TLS !== 'false', connectionTimeout: Number(config.SMTP_TIMEOUT_MS || 10000),
      socketTimeout: Number(config.SMTP_TIMEOUT_MS || 10000), tls: { minVersion: 'TLSv1.2', rejectUnauthorized: config.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false' },
    }) : null);
  }

  status() { return this.configured ? 'CONFIGURED' : 'UNCONFIGURED'; }

  render(template, variables = {}) {
    return String(template || '').replace(/{{\s*([A-Za-z0-9_]+)\s*}}/g, (_, key) => String(variables[key] ?? ''));
  }

  async send({ to, subject, body, html, templateVariables, idempotencyKey, communicationType = 'TRANSACTIONAL' }) {
    if (!this.configured) throw providerError('SMTP provider is not configured.', 'PROVIDER_UNCONFIGURED');
    if (!idempotencyKey) throw providerError('Email idempotency key is required.', 'VALIDATION_FAILED', 400);
    const key = this.redis.key('email-idempotency', [idempotencyKey]);
    const existing = await this.redis.getJson(key, { critical: false });
    if (existing?.providerMessageId) return { ...existing, duplicate: true };
    const text = this.render(body, templateVariables);
    const headers = communicationType === 'MARKETING' && this.config.UNSUBSCRIBE_URL
      ? { 'List-Unsubscribe': `<${this.config.UNSUBSCRIBE_URL}>` } : undefined;
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(providerError('SMTP request timed out.', 'DEPENDENCY_TIMEOUT', 504)), Number(this.config.SMTP_TIMEOUT_MS || 10000)); });
    let result;
    try {
      result = await Promise.race([this.transporter.sendMail({ from: this.config.SMTP_FROM, to, subject: this.render(subject, templateVariables), text, html: html ? this.render(html, templateVariables) : undefined, headers }), timeout]);
    } finally { clearTimeout(timer); }
    const sent = { providerMessageId: result.messageId, accepted: result.accepted || [] };
    await this.redis.setJson(key, sent, 86400, { critical: false });
    return sent;
  }

  async health() {
    if (!this.configured) return { status: 'UNCONFIGURED' };
    try { await this.transporter.verify(); return { status: 'UP' }; } catch (_) { return { status: 'DOWN' }; }
  }

  verifyWebhook() { throw providerError('SMTP bounce webhook requires a provider-specific adapter.', 'NOT_IMPLEMENTED', 501); }
}

module.exports = { SMTPEmailProvider, providerError };
