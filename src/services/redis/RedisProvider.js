const crypto = require('node:crypto');
const { LRUCache } = require('lru-cache');

class RedisProvider {
  constructor({ client = null, url = process.env.REDIS_URL, prefix = process.env.REDIS_KEY_PREFIX || 'legalzeka' } = {}) {
    this.client = client;
    this.url = url;
    this.prefix = prefix;
    this.fallback = new LRUCache({ max: 1000, ttl: 60000 });
    this.connected = Boolean(client?.isReady);
  }

  async connect() {
    if (!this.client) {
      if (!this.url) return false;
      const { createClient } = require('redis');
      this.client = createClient({ url: this.url, socket: { connectTimeout: Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 3000) } });
      this.client.on('error', () => { this.connected = false; });
    }
    if (!this.client.isOpen && this.client.connect) await this.client.connect();
    this.connected = this.client.isReady !== false;
    return this.connected;
  }

  key(scope, parts = []) {
    const safe = [scope, ...parts].map((part) => encodeURIComponent(String(part ?? 'none')));
    return `${this.prefix}:${safe.join(':')}`;
  }

  async execute(operation, { critical = false, fallback } = {}) {
    try {
      if (!this.client || this.client.isReady === false) await this.connect();
      if (!this.client) throw new Error('Redis is not configured.');
      return await operation(this.client);
    } catch (error) {
      if (critical) throw Object.assign(new Error('Shared security state is unavailable.'), { code: 'PROVIDER_UNAVAILABLE', status: 503, cause: error });
      return typeof fallback === 'function' ? fallback() : fallback;
    }
  }

  async getJson(key, { critical = false } = {}) {
    return this.execute(async (client) => {
      const value = await client.get(key);
      return value ? JSON.parse(value) : null;
    }, { critical, fallback: () => this.fallback.get(key) || null });
  }

  async setJson(key, value, ttlSeconds, { critical = false, onlyIfAbsent = false } = {}) {
    return this.execute(async (client) => {
      const options = { EX: ttlSeconds };
      if (onlyIfAbsent) options.NX = true;
      return client.set(key, JSON.stringify(value), options);
    }, { critical, fallback: () => { if (!onlyIfAbsent || !this.fallback.has(key)) this.fallback.set(key, value, { ttl: ttlSeconds * 1000 }); return 'FALLBACK'; } });
  }

  async delete(key, { critical = false } = {}) {
    return this.execute((client) => client.del(key), { critical, fallback: () => this.fallback.delete(key) });
  }

  async rateLimit(key, { limit, windowSeconds, critical = true }) {
    const lua = `local value=redis.call('INCR',KEYS[1]); if value==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; local ttl=redis.call('TTL',KEYS[1]); return {value,ttl}`;
    const result = await this.execute(
      (client) => client.eval(lua, { keys: [key], arguments: [String(windowSeconds)] }),
      { critical, fallback: null }
    );
    const count = Number(result?.[0] ?? limit + 1);
    return { allowed: count <= limit, count, retryAfterSeconds: Math.max(Number(result?.[1] || windowSeconds), 1) };
  }

  async acquireLock(key, ttlMs, owner = crypto.randomUUID()) {
    const result = await this.execute(
      (client) => client.set(key, owner, { PX: ttlMs, NX: true }),
      { critical: true }
    );
    return result === 'OK' ? owner : null;
  }

  async releaseLock(key, owner) {
    const lua = `if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end`;
    return this.execute((client) => client.eval(lua, { keys: [key], arguments: [owner] }), { critical: true });
  }

  async health() {
    try {
      if (!this.client || this.client.isReady === false) await this.connect();
      if (!this.client) return { status: 'UNCONFIGURED' };
      return { status: (await this.client.ping()) === 'PONG' ? 'UP' : 'DEGRADED' };
    } catch (_) {
      return { status: 'DOWN' };
    }
  }

  async close() {
    if (this.client?.isOpen && this.client.quit) await this.client.quit();
  }
}

let shared;
function getRedisProvider() {
  if (!shared) shared = new RedisProvider();
  return shared;
}

module.exports = { RedisProvider, getRedisProvider };
