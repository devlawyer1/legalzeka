const { providerError } = require('./SMTPEmailProvider');

class LlmProviderGuard {
  constructor({ provider, name = process.env.LLM_PROVIDER || 'unknown', config = process.env, now = () => Date.now() } = {}) {
    this.provider = provider; this.name = name; this.config = config; this.now = now;
    this.failures = 0; this.openUntil = 0;
  }

  assertAllowed(model) {
    if (this.config.LLM_PROVIDER_ENABLED === 'false') throw providerError('LLM provider is disabled.', 'PROVIDER_UNAVAILABLE');
    const allowlist = String(this.config.LLM_MODEL_ALLOWLIST || '').split(',').map((item) => item.trim()).filter(Boolean);
    if (allowlist.length && !allowlist.includes(model)) throw providerError('Model is not allowed in this environment.', 'ACCESS_DENIED', 403);
  }

  async execute({ model, operation, timeoutMs = Number(this.config.LLM_TIMEOUT_MS || 30000) }) {
    this.assertAllowed(model);
    if (this.openUntil > this.now()) throw providerError('LLM circuit breaker is open.', 'PROVIDER_UNAVAILABLE');
    const attempts = Math.max(1, Number(this.config.LLM_MAX_ATTEMPTS || 2));
    let last;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const result = await Promise.race([operation(), new Promise((_, reject) => setTimeout(() => reject(providerError('LLM request timed out.', 'DEPENDENCY_TIMEOUT', 504)), timeoutMs))]);
        this.failures = 0; return result;
      } catch (error) { last = error; this.failures += 1; }
    }
    if (this.failures >= Number(this.config.LLM_CIRCUIT_FAILURES || 5)) this.openUntil = this.now() + Number(this.config.LLM_CIRCUIT_COOLDOWN_MS || 60000);
    throw last;
  }

  async health(model) {
    if (!this.provider) return { status: 'UNCONFIGURED', provider: this.name };
    try { this.assertAllowed(model); return { status: this.openUntil > this.now() ? 'DEGRADED' : 'UP', provider: this.name, model, dataRegion: this.config.LLM_DATA_REGION || null, retention: this.config.LLM_LOG_RETENTION || 'UNKNOWN' }; }
    catch (error) { return { status: 'DOWN', provider: this.name, code: error.code }; }
  }
}

module.exports = { LlmProviderGuard };
