const axios = require('axios');
const { decrypt, encrypt } = require('../enterprise/secureValue');
const { providerError } = require('./SMTPEmailProvider');
const { getRedisProvider } = require('../redis/RedisProvider');

class GoogleCalendarProvider {
  constructor({ http = axios, db, redis = getRedisProvider(), clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID, clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET } = {}) {
    this.http = http; this.db = db; this.redis = redis; this.clientId = clientId; this.clientSecret = clientSecret;
  }

  status() { return this.clientId && this.clientSecret ? 'CONFIGURED' : 'UNCONFIGURED'; }

  authorizationUrl({ redirectUri, state, codeChallenge }) {
    if (this.status() !== 'CONFIGURED') throw providerError('Google Calendar is not configured.', 'PROVIDER_UNCONFIGURED');
    const params = new URLSearchParams({ client_id: this.clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'https://www.googleapis.com/auth/calendar.events', access_type: 'offline', prompt: 'consent', state, code_challenge: codeChallenge, code_challenge_method: 'S256' });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  async exchangeCode({ code, redirectUri, codeVerifier }) {
    const response = await this.http.post('https://oauth2.googleapis.com/token', new URLSearchParams({ code, client_id: this.clientId, client_secret: this.clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: codeVerifier }), { timeout: 10000, headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    return { encryptedTokens: encrypt(JSON.stringify(response.data)), expiresAt: new Date(Date.now() + Number(response.data.expires_in || 3600) * 1000) };
  }

  async refresh(encryptedTokens) {
    const tokens = JSON.parse(decrypt(encryptedTokens));
    if (!tokens.refresh_token) throw providerError('Calendar refresh token is unavailable.', 'PROVIDER_UNAVAILABLE');
    const response = await this.http.post('https://oauth2.googleapis.com/token', new URLSearchParams({ refresh_token: tokens.refresh_token, client_id: this.clientId, client_secret: this.clientSecret, grant_type: 'refresh_token' }), { timeout: 10000, headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    return encrypt(JSON.stringify({ ...tokens, ...response.data, refresh_token: tokens.refresh_token }));
  }

  async request(method, path, { encryptedTokens, data, idempotencyKey, approvedByUser } = {}) {
    if (!approvedByUser && ['post','put','patch','delete'].includes(method.toLowerCase())) throw providerError('Explicit user approval is required for calendar changes.', 'APPROVAL_REQUIRED', 403);
    const tokens = JSON.parse(decrypt(encryptedTokens));
    const response = await this.http.request({ method, url: `https://www.googleapis.com/calendar/v3${path}`, data, timeout: 10000, headers: { Authorization: `Bearer ${tokens.access_token}`, ...(idempotencyKey ? { 'X-Goog-Request-Reason': `legalzeka:${idempotencyKey}` } : {}) } });
    return response.data;
  }

  async createEvent(calendarId, event, options = {}) {
    if (!options.idempotencyKey) throw providerError('Calendar idempotency key is required.', 'VALIDATION_FAILED', 400);
    const key = this.redis.key('calendar-idempotency', [options.idempotencyKey]);
    const existing = await this.redis.getJson(key, { critical: false });
    if (existing?.id) return { ...existing, duplicate: true };
    const created = await this.request('post', `/calendars/${encodeURIComponent(calendarId)}/events`, { ...options, data: event });
    await this.redis.setJson(key, created, 86400, { critical: false });
    return created;
  }
  updateEvent(calendarId, eventId, event, options) { return this.request('put', `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, { ...options, data: event }); }
  deleteEvent(calendarId, eventId, options) { return this.request('delete', `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, options); }
  async disconnect(connectionId) { if (this.db) await this.db.query("UPDATE provider_connections SET status='DISABLED',encrypted_credentials='',updated_at=now() WHERE id=$1", [connectionId]); return true; }
  verifyWebhook({ channelToken, expectedToken }) { return channelToken && expectedToken && channelToken === expectedToken; }
}

module.exports = { GoogleCalendarProvider };
