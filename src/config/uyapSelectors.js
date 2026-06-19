// ============================================================
// Emsal Atlası - UYAP Portal Selektör Konfigürasyonu
// UYAP arayüzü değiştiğinde SADECE bu dosyayı güncelleyin.
// ============================================================

module.exports = {
  // Portal URL
  PORTAL_URL: process.env.UYAP_PORTAL_URL || 'https://avukat.uyap.gov.tr',

  // ---- Login Sayfası ----
  LOGIN: {
    TC_INPUT: '#txtTCKimlikNo',
    PASSWORD_INPUT: '#txtSifre',
    LOGIN_BUTTON: '#btnGiris',
    CAPTCHA_IMG: '#imgCaptcha',
    ERROR_MESSAGE: '.login-error-message',
    SUCCESS_INDICATOR: '#mainContent', // Login sonrası görünecek element
  },

  // ---- Dava Listesi Sayfası ----
  CASES: {
    NAV_MENU: '#menuDavalar',
    SEARCH_BUTTON: '#btnDavaAra',
    TABLE: '#tblDavalar',
    TABLE_BODY: '#tblDavalar tbody',
    ROW: 'tr',
    COLUMNS: {
      ESAS_NO: 0,       // Tablo kolon index'leri
      MAHKEME: 1,
      KONU: 2,
      TARAF_DAVACI: 3,
      TARAF_DAVALI: 4,
      DURUM: 5,
    },
    PAGINATION_NEXT: '.pagination .next',
    NO_DATA_MESSAGE: '.no-data-message',
  },

  // ---- Duruşma Takvimi Sayfası ----
  HEARINGS: {
    NAV_MENU: '#menuDurusmalar',
    TABLE: '#tblDurusmalar',
    TABLE_BODY: '#tblDurusmalar tbody',
    ROW: 'tr',
    COLUMNS: {
      TARIH: 0,
      ESAS_NO: 1,
      MAHKEME: 2,
      NOT: 3,
    },
    NO_DATA_MESSAGE: '.no-data-message',
  },

  // ---- Tebligat / Bildirimler Sayfası ----
  NOTIFICATIONS: {
    NAV_MENU: '#menuTebligatlar',
    LIST_CONTAINER: '#lstTebligatlar',
    ITEM: '.tebligat-item',
    ITEM_TITLE: '.tebligat-baslik',
    ITEM_DATE: '.tebligat-tarih',
    ITEM_CONTENT: '.tebligat-icerik',
    ITEM_TYPE: '.tebligat-tur',
    ITEM_CASE_REF: '.tebligat-esas',
    NO_DATA_MESSAGE: '.no-data-message',
  },

  // ---- Genel Zaman Aşımı (ms) ----
  TIMEOUTS: {
    NAVIGATION: parseInt(process.env.UYAP_BROWSER_TIMEOUT) || 30000,
    ELEMENT_WAIT: 10000,
    LOGIN_WAIT: 15000,
    PAGE_LOAD: 20000,
  },
};
