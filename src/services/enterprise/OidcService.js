const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { pool } = require('../../config/db');
const { decrypt, hashOpaque } = require('./secureValue');
const { getRedisProvider } = require('../redis/RedisProvider');
const { authError } = require('./AuthSessionService');

function base64url(buffer) { return Buffer.from(buffer).toString('base64url'); }

class OidcService {
  constructor({ db = pool, redis = getRedisProvider(), fetchImpl = global.fetch } = {}) {
    this.db = db; this.redis = redis; this.fetch = fetchImpl;
  }

  async configuration(providerId) {
    const { rows } = await this.db.query("SELECT * FROM identity_provider_configs WHERE id=$1 AND provider_type='OIDC' AND status='ACTIVE'", [providerId]);
    if (!rows[0]) throw authError('Identity provider is unavailable.', 'PROVIDER_UNAVAILABLE', 503);
    return rows[0];
  }

  async discovery(config) {
    const url = config.discovery_url || `${String(config.issuer).replace(/\/$/, '')}/.well-known/openid-configuration`;
    const response = await this.fetch(url, { signal: AbortSignal.timeout(Number(process.env.PROVIDER_TIMEOUT_MS || 8000)) });
    if (!response.ok) throw authError('OIDC discovery failed.', 'PROVIDER_UNAVAILABLE', 503);
    const document = await response.json();
    if (document.issuer !== config.issuer || !document.authorization_endpoint || !document.token_endpoint || !document.jwks_uri) throw authError('OIDC discovery metadata is invalid.', 'OIDC_METADATA_INVALID', 502);
    return document;
  }

  async begin(providerId, redirectUri) {
    const config = await this.configuration(providerId);
    const allowed = Array.isArray(config.metadata?.redirectUris) ? config.metadata.redirectUris : [];
    if (!allowed.includes(redirectUri)) throw authError('Redirect URI is not allowed.', 'OIDC_REDIRECT_INVALID', 400);
    const discovery = await this.discovery(config);
    const state = base64url(crypto.randomBytes(32)); const nonce = base64url(crypto.randomBytes(32)); const verifier = base64url(crypto.randomBytes(48));
    const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
    await this.redis.setJson(this.redis.key('oauth-state', [hashOpaque(state)]), { providerId, nonce, verifier, redirectUri }, 600, { critical: true, onlyIfAbsent: true });
    const params = new URLSearchParams({ response_type: 'code', client_id: config.client_id, redirect_uri: redirectUri, scope: 'openid email profile', state, nonce, code_challenge: challenge, code_challenge_method: 'S256' });
    return { authorizationUrl: `${discovery.authorization_endpoint}?${params}`, state };
  }

  async callback({ providerId, state, code }) {
    const key = this.redis.key('oauth-state', [hashOpaque(state)]);
    const pending = await this.redis.getJson(key, { critical: true });
    await this.redis.delete(key, { critical: true });
    if (!pending || pending.providerId !== providerId) throw authError('OIDC state is invalid.', 'OIDC_STATE_INVALID');
    const config = await this.configuration(providerId); const discovery = await this.discovery(config);
    const response = await this.fetch(discovery.token_endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({
      grant_type: 'authorization_code', code, redirect_uri: pending.redirectUri, client_id: config.client_id,
      client_secret: decrypt(config.encrypted_client_secret), code_verifier: pending.verifier,
    }), signal: AbortSignal.timeout(Number(process.env.PROVIDER_TIMEOUT_MS || 8000)) });
    if (!response.ok) throw authError('OIDC token exchange failed.', 'OIDC_TOKEN_INVALID');
    const tokens = await response.json();
    const claims = await this.verifyIdToken(tokens.id_token, discovery, config);
    if (claims.nonce !== pending.nonce) throw authError('OIDC nonce is invalid.', 'OIDC_NONCE_INVALID');
    const domain = String(claims.email || '').split('@')[1]?.toLowerCase();
    if (config.domains?.length && !config.domains.map((item) => item.toLowerCase()).includes(domain)) throw authError('Email domain is not allowed.', 'OIDC_DOMAIN_DENIED', 403);
    const links = await this.db.query('SELECT * FROM user_identity_links WHERE identity_provider_id=$1 AND external_subject=$2', [providerId, claims.sub]);
    if (!links.rows[0]) throw authError('Identity must be linked by an administrator before login.', 'OIDC_ACCOUNT_LINK_REQUIRED', 403);
    await this.db.query('UPDATE user_identity_links SET last_login_at=now(),external_email=$2 WHERE id=$1', [links.rows[0].id, claims.email || null]);
    return { userId: links.rows[0].user_id, claims: { sub: claims.sub, email: claims.email } };
  }

  async verifyIdToken(token, discovery, config) {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded?.header?.kid) throw authError('OIDC token header is invalid.', 'OIDC_TOKEN_INVALID');
    const response = await this.fetch(discovery.jwks_uri, { signal: AbortSignal.timeout(Number(process.env.PROVIDER_TIMEOUT_MS || 8000)) });
    const jwks = await response.json(); const jwk = jwks.keys?.find((item) => item.kid === decoded.header.kid);
    if (!jwk) throw authError('OIDC signing key was not found.', 'OIDC_TOKEN_INVALID');
    const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    return jwt.verify(token, publicKey, { algorithms: ['RS256','RS384','RS512','ES256','ES384'], issuer: config.issuer, audience: config.client_id, clockTolerance: 30 });
  }
}

module.exports = { OidcService, base64url };
