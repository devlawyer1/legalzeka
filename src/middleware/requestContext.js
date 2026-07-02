const crypto = require('crypto');

function requestContext(req, res, next) {
  const incoming = req.get('x-request-id');
  req.requestId = incoming && incoming.length <= 128 ? incoming : crypto.randomUUID();
  req.traceId = /^[0-9a-f]{32}$/i.test(req.get('x-trace-id') || '') ? req.get('x-trace-id').toLowerCase() : crypto.randomBytes(16).toString('hex');
  req.spanId = crypto.randomBytes(8).toString('hex');
  res.setHeader('X-Request-ID', req.requestId);
  res.setHeader('X-Trace-ID', req.traceId);
  next();
}

module.exports = requestContext;
