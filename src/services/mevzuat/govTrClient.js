const axios = require('axios');
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const { LRUCache } = require('lru-cache');
const pdfParse = require('pdf-parse');

const BASE_URL = 'https://www.mevzuat.gov.tr';
const SEARCH_ENDPOINT = `${BASE_URL}/Anasayfa/MevzuatDatatable`;

const HEADERS = {
  'Accept': 'application/json, text/javascript, */*; q=0.01',
  'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
  'Content-Type': 'application/json; charset=UTF-8',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  'X-Requested-With': 'XMLHttpRequest',
};

// Types mapping for API
const MEVZUAT_TUR_API_MAPPING = {
  'Kurum Yönetmeliği': 'KurumVeKurulusYonetmeligi',
  'Cumhurbaşkanlığı Kararnamesi': 'CumhurbaskaniKararnameleri',
  'Cumhurbaşkanı Kararı': 'CumhurbaskaniKararlari',
  'CB Yönetmeliği': 'CumhurbaskanligiVeBakanlarKuruluYonetmelik',
  'CB Genelgesi': 'CumhurbaskanligiGenelgeleri',
  'Tebliğ': 'Teblig',
};

// Cache for session token and cookies (30 min)
const sessionCache = new LRUCache({ max: 1, ttl: 1000 * 60 * 30 });
const contentCache = new LRUCache({ max: 500, ttl: 1000 * 60 * 60 });

class GovTrClient {
  constructor() {
    this.client = axios.create({
      headers: HEADERS,
      timeout: 30000,
    });
    this.browser = null;
  }

  async getBrowser() {
    if (!this.browser || !this.browser.isConnected()) {
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });
    }
    return this.browser;
  }

  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async ensureSession() {
    const cachedSession = sessionCache.get('session');
    if (cachedSession) {
      return cachedSession;
    }

    console.log('[GovTrClient] Getting new session and Antiforgery token via Puppeteer...');
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    
    try {
      await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      
      const cookies = await page.cookies();
      const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
      
      // Extract antiforgery token
      const token = await page.$eval('input[name="__RequestVerificationToken"]', el => el.value).catch(() => null);
      
      let finalToken = token;
      if (!finalToken) {
        const tokenCookie = cookies.find(c => c.name.includes('Antiforgery'));
        if (tokenCookie) finalToken = tokenCookie.value;
      }

      if (!finalToken) {
        console.warn('[GovTrClient] Could not find Antiforgery token.');
      } else {
        console.log('[GovTrClient] Session established successfully.');
      }

      const sessionData = { cookie: cookieStr, token: finalToken };
      sessionCache.set('session', sessionData);
      
      await page.close();
      return sessionData;
    } catch (error) {
      await page.close();
      console.error('[GovTrClient] Error ensuring session:', error.message);
      throw error;
    }
  }

  _normalizeMevzuatTur(tur) {
    return MEVZUAT_TUR_API_MAPPING[tur] || tur;
  }

  async searchDocuments({
    aranacakIfade = '',
    mevzuatTur = 'Kanun',
    tamCumle = false,
    aranacakYer = 'BaslikIcerik',
    mevzuatNo = '',
    baslangicTarihi = '',
    bitisTarihi = '',
    pageNumber = 1,
    pageSize = 25
  }) {
    const session = await this.ensureSession();
    
    const payload = {
      draw: 1,
      columns: [
        { data: null, name: "", searchable: true, orderable: false, search: { value: "", regex: false } },
        { data: null, name: "", searchable: true, orderable: false, search: { value: "", regex: false } },
        { data: null, name: "", searchable: true, orderable: false, search: { value: "", regex: false } }
      ],
      order: [],
      start: (pageNumber - 1) * pageSize,
      length: pageSize,
      search: { value: "", regex: false },
      parameters: {
        MevzuatTur: this._normalizeMevzuatTur(mevzuatTur),
        YonetmelikMevzuatTur: "OsmanliKanunu", // Required by API
        AranacakIfade: aranacakIfade,
        TamCumle: tamCumle ? "true" : "false",
        AranacakYer: aranacakYer,
        MevzuatNo: mevzuatNo,
        KurumId: "0",
        AltKurumId: "0",
        BaslangicTarihi: baslangicTarihi,
        BitisTarihi: bitisTarihi,
        antiforgerytoken: session.token || ""
      }
    };

    try {
      const response = await this.client.post(SEARCH_ENDPOINT, payload, {
        headers: { Cookie: session.cookie }
      });

      const totalResults = response.data.recordsTotal || 0;
      const documents = (response.data.data || []).map(item => ({
        mevzuatNo: item.mevzuatNo || '',
        mevAdi: item.mevAdi || '',
        kabulTarih: item.kabulTarih || '',
        resmiGazeteTarihi: item.resmiGazeteTarihi || '',
        resmiGazeteSayisi: item.resmiGazeteSayisi || '',
        mevzuatTertip: item.mevzuatTertip || '',
        mevzuatTur: item.tur || 1,
        url: item.url || ''
      }));

      return {
        documents,
        totalResults,
        currentPage: pageNumber,
        pageSize,
        totalPages: Math.ceil(totalResults / pageSize),
        queryUsed: aranacakIfade
      };
    } catch (error) {
      console.error('[GovTrClient] Search Error:', error.message);
      // If 403 or 500, maybe session expired. Delete cache.
      if (error.response && [403, 500].includes(error.response.status)) {
        sessionCache.delete('session');
      }
      throw error;
    }
  }

  async getContentFromHtml(mevzuatNo, mevzuatTur, mevzuatTertip) {
    const cacheKey = `html:${mevzuatTur}.${mevzuatTertip}.${mevzuatNo}`;
    if (contentCache.has(cacheKey)) {
      return contentCache.get(cacheKey);
    }

    const iframeUrl = `${BASE_URL}/anasayfa/MevzuatFihristDetayIframe?MevzuatTur=${mevzuatTur}&MevzuatNo=${mevzuatNo}&MevzuatTertip=${mevzuatTertip}`;
    console.log(`[GovTrClient] Scraping HTML via Puppeteer: ${iframeUrl}`);
    
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      await page.goto(iframeUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('body', { timeout: 10000 });
      const htmlContent = await page.content();
      await page.close();

      const $ = cheerio.load(htmlContent);
      $('script, style, nav, header, footer').remove();
      
      const contentDiv = $('.mevzuat').length ? $('.mevzuat') : $('body');
      let markdownContent = '';

      if (contentDiv.length) {
        // Simple HTML to text conversion
        markdownContent = contentDiv.text().replace(/\n\s*\n/g, '\n\n').trim();
      }

      if (markdownContent) {
        const result = { maddeId: mevzuatNo, mevzuatId: mevzuatNo, content: markdownContent };
        contentCache.set(cacheKey, result);
        return result;
      }

      return null;
    } catch (error) {
      await page.close();
      console.error(`[GovTrClient] HTML Scraping Error for ${mevzuatNo}:`, error.message);
      return null;
    }
  }

  async getPdfContent(pdfUrl) {
    try {
      const response = await axios.get(pdfUrl, { responseType: 'arraybuffer' });
      const data = await pdfParse(response.data);
      return data.text;
    } catch (error) {
      console.error('[GovTrClient] PDF Parse Error:', error.message);
      return null;
    }
  }

  async getDocContent(docUrl) {
    try {
      // mevzuat.gov.tr DOC files are often just HTML files
      const response = await axios.get(docUrl, { 
        responseType: 'arraybuffer',
        headers: { 'Accept': 'application/msword, */*' }
      });
      const htmlContent = response.data.toString('utf-8');
      
      const $ = cheerio.load(htmlContent);
      return $('body').text().replace(/\n\s*\n/g, '\n\n').trim();
    } catch (error) {
      console.error('[GovTrClient] DOC Parse Error:', error.message);
      return null;
    }
  }

  async getContent(mevzuatNo, mevzuatTur = 1, mevzuatTertip = '3', resmiGazeteTarihi = null) {
    const isPdfOnly = [20, 22].includes(Number(mevzuatTur)); // 20: CB Karari, 22: CB Genelgesi
    
    let docUrl = null;
    let pdfUrl = null;

    if (Number(mevzuatTur) === 22) { // CB Genelgesi
      if (!resmiGazeteTarihi) throw new Error('resmiGazeteTarihi is required for CB Genelgesi');
      const [d, m, y] = resmiGazeteTarihi.split('/');
      const dateStr = `${y}${m.padStart(2, '0')}${d.padStart(2, '0')}`;
      pdfUrl = `${BASE_URL}/MevzuatMetin/CumhurbaskanligiGenelgeleri/${dateStr}-${mevzuatNo}.pdf`;
    } else if (Number(mevzuatTur) === 20) { // CB Karari
      pdfUrl = `${BASE_URL}/MevzuatMetin/${mevzuatTur}.${mevzuatTertip}.${mevzuatNo}.pdf`;
    } else {
      docUrl = `${BASE_URL}/MevzuatMetin/${mevzuatTur}.${mevzuatTertip}.${mevzuatNo}.doc`;
      pdfUrl = `${BASE_URL}/MevzuatMetin/${mevzuatTur}.${mevzuatTertip}.${mevzuatNo}.pdf`;
    }

    if (!isPdfOnly) {
      const htmlResult = await this.getContentFromHtml(mevzuatNo, mevzuatTur, mevzuatTertip);
      if (htmlResult && htmlResult.content) return htmlResult;
    }

    // Try DOC if applicable
    if (docUrl) {
      const docText = await this.getDocContent(docUrl);
      if (docText) return { maddeId: mevzuatNo, mevzuatId: mevzuatNo, content: docText };
    }

    // Try PDF
    if (pdfUrl) {
      const pdfText = await this.getPdfContent(pdfUrl);
      if (pdfText) return { maddeId: mevzuatNo, mevzuatId: mevzuatNo, content: pdfText };
    }

    throw new Error('Failed to extract content from HTML, DOC, and PDF fallbacks.');
  }
}

module.exports = new GovTrClient();
