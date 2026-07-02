const crypto = require('node:crypto');
const dns = require('node:dns').promises;
const net = require('node:net');

function securityError(message, code, status = 400) { return Object.assign(new Error(message), { code, status }); }

function privateIp(address) {
  if (net.isIP(address) === 4) {
    const parts = address.split('.').map(Number);
    return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 || (parts[0] === 169 && parts[1] === 254)
      || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168) || parts[0] >= 224;
  }
  if (net.isIP(address) === 6) return address === '::1' || address.startsWith('fc') || address.startsWith('fd') || address.startsWith('fe80') || address === '::';
  return true;
}

async function assertSafeOutboundUrl(value, { allowedHosts = [], allowHttp = false, resolver = dns.lookup } = {}) {
  let url;
  try { url = new URL(value); } catch (_) { throw securityError('URL is invalid.', 'SSRF_URL_INVALID'); }
  if (!['https:', ...(allowHttp ? ['http:'] : [])].includes(url.protocol) || url.username || url.password) throw securityError('Outbound URL is not allowed.', 'SSRF_URL_DENIED');
  if (allowedHosts.length && !allowedHosts.includes(url.hostname)) throw securityError('Outbound host is not allowed.', 'SSRF_HOST_DENIED');
  if (net.isIP(url.hostname) && privateIp(url.hostname)) throw securityError('Private network targets are not allowed.', 'SSRF_PRIVATE_ADDRESS');
  const addresses = await resolver(url.hostname, { all: true });
  if (!addresses.length || addresses.some((item) => privateIp(item.address))) throw securityError('Resolved target is not allowed.', 'SSRF_PRIVATE_ADDRESS');
  return url;
}

function assertSafeRedirect(value, allowlist) {
  let url;
  try { url = new URL(value); } catch (_) { throw securityError('Redirect URL is invalid.', 'OPEN_REDIRECT_BLOCKED'); }
  if (!allowlist.includes(url.origin) || url.protocol !== 'https:') throw securityError('Redirect origin is not allowed.', 'OPEN_REDIRECT_BLOCKED');
  return url.toString();
}

function verifyWebhookSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const left = Buffer.from(expected); const right = Buffer.from(String(signature).replace(/^sha256=/, ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

module.exports = { assertSafeOutboundUrl, assertSafeRedirect, privateIp, securityError, verifyWebhookSignature };
