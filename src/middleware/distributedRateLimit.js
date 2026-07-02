const { getRedisProvider } = require('../services/redis/RedisProvider');
const { hashOpaque } = require('../services/enterprise/secureValue');

const local = new Map();

function localLimit(key, limit, windowSeconds) {
  const now = Date.now(); const current = local.get(key);
  if (!current || current.expiresAt <= now) { local.set(key, { count: 1, expiresAt: now + windowSeconds * 1000 }); return { allowed: true, count: 1, retryAfterSeconds: windowSeconds }; }
  current.count += 1;
  return { allowed: current.count <= limit, count: current.count, retryAfterSeconds: Math.ceil((current.expiresAt - now) / 1000) };
}

function distributedRateLimit({ scope, limit, windowSeconds, critical = true, key = (req) => req.ip }) {
  return async (req, res, next) => {
    try {
      const identity = hashOpaque(key(req) || 'anonymous');
      const redis = getRedisProvider();
      const result = (process.env.REDIS_URL || redis.client)
        ? await redis.rateLimit(redis.key('rate', [scope, identity]), { limit, windowSeconds, critical })
        : process.env.NODE_ENV === 'production' && critical
          ? (() => { throw Object.assign(new Error('Distributed rate limit is unavailable.'), { code: 'PROVIDER_UNAVAILABLE', status: 503 }); })()
          : localLimit(`${scope}:${identity}`, limit, windowSeconds);
      res.setHeader('RateLimit-Limit', String(limit));
      res.setHeader('RateLimit-Remaining', String(Math.max(limit - result.count, 0)));
      if (!result.allowed) {
        res.setHeader('Retry-After', String(result.retryAfterSeconds));
        return res.status(429).json({ success: false, code: 'RATE_LIMITED', message: 'Too many requests.', requestId: req.requestId });
      }
      next();
    } catch (error) { next(error); }
  };
}

module.exports = { distributedRateLimit, localLimit };
