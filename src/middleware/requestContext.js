const crypto = require('crypto');

function requestContext(req, res, next) {
  const incoming = req.get('x-request-id');
  req.requestId = incoming && incoming.length <= 128 ? incoming : crypto.randomUUID();
  res.setHeader('X-Request-ID', req.requestId);
  next();
}

module.exports = requestContext;
