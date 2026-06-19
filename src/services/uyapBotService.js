// ============================================================
// Emsal Atlası - UYAP Bot Service (Puppeteer RPA Engine)
// Avukatın girdiği kimlik bilgileriyle UYAP'a bağlanır,
// dava/duruşma/tebligat verilerini kazıyıp döndürür.
// Kimlik bilgileri bellekte tutulur, işlem sonrası silinir.
// ============================================================

const puppeteer = require('puppeteer');
const SELECTORS = require('../config/uyapSelectors');
const path = require('path');
const fs = require('fs');

// Screenshot dizini
const SCREENSHOT_DIR = path.join(__dirname, '..', '..', 'uploads', 'uyap_screenshots');

class UyapBotService {
  constructor() {
    this.browser = null;
    this.page = null;
    this.maxRetries = parseInt(process.env.UYAP_MAX_RETRIES) || 3;
  }

  /**
   * Puppeteer browser'ı başlatır
   */
  async initBrowser() {
    this.browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--window-size=1920,1080',
      ],
      defaultViewport: { width: 1920, height: 1080 },
    });

    this.page = await this.browser.newPage();

    // Gerçek tarayıcı gibi görünmek için User-Agent ayarla
    await this.page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Extra headers
    await this.page.setExtraHTTPHeaders({
      'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
    });

    return this.page;
  }

  /**
   * Tarayıcıyı kapatır
   */
  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  /**
   * Hata durumunda ekran görüntüsü alır
   */
  async takeScreenshot(name) {
    try {
      if (!fs.existsSync(SCREENSHOT_DIR)) {
        fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
      }
      const filename = `${name}_${Date.now()}.png`;
      const filepath = path.join(SCREENSHOT_DIR, filename);
      await this.page.screenshot({ path: filepath, fullPage: true });
      console.log(`[UYAP] Screenshot saved: ${filename}`);
      return filepath;
    } catch (err) {
      console.error('[UYAP] Screenshot failed:', err.message);
      return null;
    }
  }

  /**
   * Retry mekanizmasıyla bir fonksiyonu çalıştırır
   */
  async withRetry(fn, label, retries = this.maxRetries) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        console.error(`[UYAP] ${label} — Deneme ${attempt}/${retries} başarısız:`, error.message);
        if (attempt === retries) {
          await this.takeScreenshot(`error_${label}`);
          throw error;
        }
        // Exponential backoff: 2s, 4s, 8s...
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * UYAP'a giriş yapar
   * @param {string} tcKimlik - TC Kimlik No
   * @param {string} password - Şifre
   * @returns {boolean} Giriş başarılı mı
   */
  async login(tcKimlik, password) {
    return this.withRetry(async () => {
      console.log('[UYAP] Giriş sayfasına gidiliyor...');
      await this.page.goto(SELECTORS.PORTAL_URL, {
        waitUntil: 'networkidle2',
        timeout: SELECTORS.TIMEOUTS.NAVIGATION,
      });

      // TC Kimlik alanını bul ve doldur
      await this.page.waitForSelector(SELECTORS.LOGIN.TC_INPUT, {
        timeout: SELECTORS.TIMEOUTS.ELEMENT_WAIT,
      });
      await this.page.type(SELECTORS.LOGIN.TC_INPUT, tcKimlik, { delay: 50 });

      // Şifre alanını doldur
      await this.page.type(SELECTORS.LOGIN.PASSWORD_INPUT, password, { delay: 50 });

      // Giriş butonuna tıkla
      await this.page.click(SELECTORS.LOGIN.LOGIN_BUTTON);

      // Giriş sonucunu bekle
      try {
        await this.page.waitForSelector(SELECTORS.LOGIN.SUCCESS_INDICATOR, {
          timeout: SELECTORS.TIMEOUTS.LOGIN_WAIT,
        });
        console.log('[UYAP] Giriş başarılı.');
        return true;
      } catch (err) {
        // Hata mesajı var mı kontrol et
        const errorMsg = await this.page.$(SELECTORS.LOGIN.ERROR_MESSAGE);
        if (errorMsg) {
          const text = await this.page.evaluate(el => el.textContent, errorMsg);
          throw new Error(`UYAP giriş hatası: ${text.trim()}`);
        }
        throw new Error('UYAP giriş başarısız — bilinmeyen hata (timeout).');
      }
    }, 'login', 2); // Login için max 2 deneme
  }

  /**
   * Açık davaları kazır
   * @returns {Array} Dava verileri
   */
  async scrapeCases() {
    return this.withRetry(async () => {
      console.log('[UYAP] Dava listesi sayfasına gidiliyor...');

      // Dava menüsüne tıkla
      await this.page.waitForSelector(SELECTORS.CASES.NAV_MENU, {
        timeout: SELECTORS.TIMEOUTS.ELEMENT_WAIT,
      });
      await this.page.click(SELECTORS.CASES.NAV_MENU);
      await this.page.waitForTimeout(2000);

      // Arama butonuna tıkla (tüm davaları listele)
      const searchBtn = await this.page.$(SELECTORS.CASES.SEARCH_BUTTON);
      if (searchBtn) {
        await searchBtn.click();
        await this.page.waitForTimeout(3000);
      }

      // Tablo var mı kontrol et
      const noData = await this.page.$(SELECTORS.CASES.NO_DATA_MESSAGE);
      if (noData) {
        console.log('[UYAP] Dava bulunamadı.');
        return [];
      }

      // Tablo verilerini çek
      await this.page.waitForSelector(SELECTORS.CASES.TABLE_BODY, {
        timeout: SELECTORS.TIMEOUTS.ELEMENT_WAIT,
      });

      const cases = await this.page.evaluate((sel) => {
        const rows = document.querySelectorAll(`${sel.TABLE_BODY} ${sel.ROW}`);
        const data = [];
        rows.forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 5) {
            data.push({
              esasNo: cells[sel.COLUMNS.ESAS_NO]?.textContent?.trim() || '',
              mahkeme: cells[sel.COLUMNS.MAHKEME]?.textContent?.trim() || '',
              konu: cells[sel.COLUMNS.KONU]?.textContent?.trim() || '',
              tarafDavaci: cells[sel.COLUMNS.TARAF_DAVACI]?.textContent?.trim() || '',
              tarafDavali: cells[sel.COLUMNS.TARAF_DAVALI]?.textContent?.trim() || '',
              durum: cells[sel.COLUMNS.DURUM]?.textContent?.trim() || 'Açık',
            });
          }
        });
        return data;
      }, SELECTORS.CASES);

      console.log(`[UYAP] ${cases.length} dava bulundu.`);
      return cases;
    }, 'scrapeCases');
  }

  /**
   * Duruşma takvimini kazır
   * @returns {Array} Duruşma verileri
   */
  async scrapeHearings() {
    return this.withRetry(async () => {
      console.log('[UYAP] Duruşma listesi sayfasına gidiliyor...');

      await this.page.waitForSelector(SELECTORS.HEARINGS.NAV_MENU, {
        timeout: SELECTORS.TIMEOUTS.ELEMENT_WAIT,
      });
      await this.page.click(SELECTORS.HEARINGS.NAV_MENU);
      await this.page.waitForTimeout(2000);

      const noData = await this.page.$(SELECTORS.HEARINGS.NO_DATA_MESSAGE);
      if (noData) {
        console.log('[UYAP] Duruşma bulunamadı.');
        return [];
      }

      await this.page.waitForSelector(SELECTORS.HEARINGS.TABLE_BODY, {
        timeout: SELECTORS.TIMEOUTS.ELEMENT_WAIT,
      });

      const hearings = await this.page.evaluate((sel) => {
        const rows = document.querySelectorAll(`${sel.TABLE_BODY} ${sel.ROW}`);
        const data = [];
        rows.forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 3) {
            data.push({
              tarihSaat: cells[sel.COLUMNS.TARIH]?.textContent?.trim() || '',
              esasNo: cells[sel.COLUMNS.ESAS_NO]?.textContent?.trim() || '',
              mahkeme: cells[sel.COLUMNS.MAHKEME]?.textContent?.trim() || '',
              notlar: cells[sel.COLUMNS.NOT]?.textContent?.trim() || '',
            });
          }
        });
        return data;
      }, SELECTORS.HEARINGS);

      console.log(`[UYAP] ${hearings.length} duruşma bulundu.`);
      return hearings;
    }, 'scrapeHearings');
  }

  /**
   * Tebligat / bildirimleri kazır
   * @returns {Array} Tebligat verileri
   */
  async scrapeNotifications() {
    return this.withRetry(async () => {
      console.log('[UYAP] Tebligat sayfasına gidiliyor...');

      await this.page.waitForSelector(SELECTORS.NOTIFICATIONS.NAV_MENU, {
        timeout: SELECTORS.TIMEOUTS.ELEMENT_WAIT,
      });
      await this.page.click(SELECTORS.NOTIFICATIONS.NAV_MENU);
      await this.page.waitForTimeout(2000);

      const noData = await this.page.$(SELECTORS.NOTIFICATIONS.NO_DATA_MESSAGE);
      if (noData) {
        console.log('[UYAP] Tebligat bulunamadı.');
        return [];
      }

      await this.page.waitForSelector(SELECTORS.NOTIFICATIONS.LIST_CONTAINER, {
        timeout: SELECTORS.TIMEOUTS.ELEMENT_WAIT,
      });

      const notifications = await this.page.evaluate((sel) => {
        const items = document.querySelectorAll(`${sel.LIST_CONTAINER} ${sel.ITEM}`);
        const data = [];
        items.forEach(item => {
          data.push({
            title: item.querySelector(sel.ITEM_TITLE)?.textContent?.trim() || '',
            date: item.querySelector(sel.ITEM_DATE)?.textContent?.trim() || '',
            content: item.querySelector(sel.ITEM_CONTENT)?.textContent?.trim() || '',
            type: item.querySelector(sel.ITEM_TYPE)?.textContent?.trim() || '',
            caseRef: item.querySelector(sel.ITEM_CASE_REF)?.textContent?.trim() || '',
          });
        });
        return data;
      }, SELECTORS.NOTIFICATIONS);

      console.log(`[UYAP] ${notifications.length} tebligat bulundu.`);
      return notifications;
    }, 'scrapeNotifications');
  }

  /**
   * Tam senkronizasyon: Login → Dava → Duruşma → Tebligat
   * @param {string} tcKimlik
   * @param {string} password
   * @returns {object} { cases, hearings, notifications }
   */
  async fullSync(tcKimlik, password) {
    const result = {
      cases: [],
      hearings: [],
      notifications: [],
      errors: [],
    };

    try {
      await this.initBrowser();
      await this.login(tcKimlik, password);

      // Davaları çek
      try {
        result.cases = await this.scrapeCases();
      } catch (err) {
        console.error('[UYAP] Dava çekme hatası:', err.message);
        result.errors.push(`Dava: ${err.message}`);
      }

      // Duruşmaları çek
      try {
        result.hearings = await this.scrapeHearings();
      } catch (err) {
        console.error('[UYAP] Duruşma çekme hatası:', err.message);
        result.errors.push(`Duruşma: ${err.message}`);
      }

      // Tebligatları çek
      try {
        result.notifications = await this.scrapeNotifications();
      } catch (err) {
        console.error('[UYAP] Tebligat çekme hatası:', err.message);
        result.errors.push(`Tebligat: ${err.message}`);
      }

    } finally {
      // Kimlik bilgileri bellekten temizle
      tcKimlik = null;
      password = null;
      await this.closeBrowser();
    }

    return result;
  }
}

module.exports = UyapBotService;
