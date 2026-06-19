const axios = require('axios');
const { LRUCache } = require('lru-cache');

const BASE_URL = 'https://bedesten.adalet.gov.tr/mevzuat';
const APP_NAME = 'UyapMevzuat';

const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'AdaletApplicationName': APP_NAME,
  'Origin': 'https://mevzuat.adalet.gov.tr',
  'Referer': 'https://mevzuat.adalet.gov.tr/',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
};

// In-memory cache
const cache = new LRUCache({
  max: 500,
  ttl: 1000 * 60 * 60, // 1 hour TTL
});

class BedestenClient {
  constructor() {
    this.client = axios.create({
      baseURL: BASE_URL,
      headers: HEADERS,
      timeout: 30000,
    });
  }

  _wrap(data) {
    return { data, applicationName: APP_NAME };
  }

  _wrapPaging(data) {
    return { data, applicationName: APP_NAME, paging: true };
  }

  _decodeBase64(raw) {
    try {
      return Buffer.from(raw, 'base64').toString('utf-8');
    } catch (e) {
      return raw;
    }
  }

  _toIso8601Start(dateStr) {
    // Convert DD/MM/YYYY to ISO 8601 UTC for range start (previous day 21:00 UTC)
    const [day, month, year] = dateStr.split('/');
    const dt = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day) - 1, 21, 0, 0));
    return dt.toISOString();
  }

  _toIso8601End(dateStr) {
    // Convert DD/MM/YYYY to ISO 8601 UTC for range end (given day 21:00 UTC)
    const [day, month, year] = dateStr.split('/');
    const dt = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), 21, 0, 0));
    return dt.toISOString();
  }

  /**
   * Search or list legislation documents.
   */
  async searchDocuments({
    phrase = '',
    mevzuatAdi = '',
    mevzuatNo = null,
    mevzuatTurList = null,
    basliktaAra = true,
    tamCumle = false,
    resmiGazeteTarihiStart = null,
    resmiGazeteTarihiEnd = null,
    resmiGazeteSayisi = null,
    page = 1,
    pageSize = 25,
    sortField = 'RESMI_GAZETE_TARIHI',
    sortDirection = 'desc'
  }) {
    const inner = {
      pageSize,
      pageNumber: page,
      sortFields: [sortField],
      sortDirection
    };

    if (phrase) inner.phrase = phrase;
    if (mevzuatAdi) inner.mevzuatAdi = mevzuatAdi;
    if (mevzuatNo) inner.mevzuatNo = mevzuatNo;
    if (mevzuatTurList && Array.isArray(mevzuatTurList)) inner.mevzuatTurList = mevzuatTurList;
    if (!basliktaAra) inner.basliktaAra = false;
    if (tamCumle) inner.tamCumle = true;
    if (resmiGazeteTarihiStart) inner.resmiGazeteTarihiStart = this._toIso8601Start(resmiGazeteTarihiStart);
    if (resmiGazeteTarihiEnd) inner.resmiGazeteTarihiEnd = this._toIso8601End(resmiGazeteTarihiEnd);
    if (resmiGazeteSayisi) inner.resmiGazeteSayisi = resmiGazeteSayisi;

    try {
      const resp = await this.client.post('/searchDocuments', this._wrapPaging(inner));
      const body = resp.data;

      const meta = body.metadata || {};
      if (meta.FMTY !== 'SUCCESS') {
        throw new Error(meta.FMTE || 'Unknown bedesten search error');
      }

      const data = body.data || {};
      return {
        documents: data.mevzuatList || [],
        totalResults: data.total || 0,
        start: data.start || 0,
        queryUsed: phrase || mevzuatAdi
      };
    } catch (error) {
      console.error('[BedestenClient] Search Error:', error.message);
      throw error;
    }
  }

  /**
   * Fetch full document content (decoded from base64 HTML).
   */
  async getDocumentContent(mevzuatId) {
    const cacheKey = `doc_${mevzuatId}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    const inner = { documentType: 'MEVZUAT', id: mevzuatId };
    try {
      const resp = await this.client.post('/getDocumentContent', this._wrap(inner));
      const body = resp.data;

      const meta = body.metadata || {};
      if (meta.FMTY !== 'SUCCESS') {
        throw new Error(meta.FMTE || 'Unknown getDocumentContent error');
      }

      const data = body.data || {};
      const raw = data.content || '';
      const mimeType = data.mimeType || 'text/html';
      const decoded = this._decodeBase64(raw);

      const result = { content: decoded, mimeType };
      cache.set(cacheKey, result);
      return result;
    } catch (error) {
      console.error('[BedestenClient] getDocumentContent Error:', error.message);
      throw error;
    }
  }

  /**
   * Fetch a single article's content by maddeId.
   */
  async getArticleContent(maddeId) {
    const inner = { documentType: 'MADDE', id: maddeId };
    try {
      const resp = await this.client.post('/getDocumentContent', this._wrap(inner));
      const body = resp.data;

      const meta = body.metadata || {};
      if (meta.FMTY !== 'SUCCESS') {
        throw new Error(meta.FMTE || 'Unknown getArticleContent error');
      }

      const data = body.data || {};
      const decoded = this._decodeBase64(data.content || '');
      return { content: decoded, mimeType: data.mimeType || 'text/html' };
    } catch (error) {
      console.error('[BedestenClient] getArticleContent Error:', error.message);
      throw error;
    }
  }

  /**
   * Get the article tree (madde ağacı / table of contents).
   */
  async getArticleTree(mevzuatId) {
    const cacheKey = `tree_${mevzuatId}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    const inner = { mevzuatId };
    try {
      const resp = await this.client.post('/mevzuatMaddeTree', this._wrap(inner));
      const body = resp.data;

      const meta = body.metadata || {};
      if (meta.FMTY !== 'SUCCESS') {
        throw new Error(meta.FMTE || 'Unknown getArticleTree error');
      }

      const data = body.data || {};
      const children = Array.isArray(data.children) ? data.children : (Array.isArray(data) ? data : []);
      
      cache.set(cacheKey, children);
      return children;
    } catch (error) {
      console.error('[BedestenClient] getArticleTree Error:', error.message);
      throw error;
    }
  }

  /**
   * Fetch law rationale content (Gerekçe).
   */
  async getGerekceContent(gerekceId) {
    const cacheKey = `gerekce_${gerekceId}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    const inner = { gerekceId };
    try {
      const resp = await this.client.post('/getGerekceContent', this._wrap(inner));
      const body = resp.data;

      const meta = body.metadata || {};
      if (meta.FMTY !== 'SUCCESS') {
        throw new Error(meta.FMTE || 'Unknown getGerekceContent error');
      }

      const data = body.data || {};
      const raw = data.content || '';
      const mimeType = data.mimetype || data.mimeType || 'text/html';
      const decoded = this._decodeBase64(raw);

      const result = {
        gerekceId: data.gerekceId,
        mevzuatId: data.mevzuatId,
        content: decoded,
        mimeType
      };
      
      cache.set(cacheKey, result);
      return result;
    } catch (error) {
      console.error('[BedestenClient] getGerekceContent Error:', error.message);
      throw error;
    }
  }
  
  /**
   * Strip HTML tags from content
   */
  stripHtml(htmlText) {
    if (!htmlText) return '';
    let text = htmlText.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<[^>]+>/g, '');
    
    // Decode HTML entities (basic)
    const entities = {
      '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' '
    };
    text = text.replace(/&[a-z0-9]+;/g, match => entities[match] || match);
    
    return text.split('\n').map(line => line.trim()).filter(line => line).join('\n');
  }
}

module.exports = new BedestenClient();
