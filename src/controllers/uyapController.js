// ============================================================
// Emsal Atlası - UYAP Controller
// UYAP entegrasyon endpoint'leri
// Kimlik bilgileri saklanmaz — her istekte gönderilir, sonra silinir.
// ============================================================

const UyapBotService = require('../services/uyapBotService');
const UyapSyncLog = require('../models/UyapSyncLog');
const UyapNotification = require('../models/UyapNotification');
const Case = require('../models/Case');
const Hearing = require('../models/Hearing');

/**
 * Manuel senkronizasyon başlat
 * POST /api/uyap/sync
 * Body: { tcKimlik, password }
 */
exports.triggerSync = async (req, res, next) => {
  try {
    const { tcKimlik, password } = req.body;
    const firmId = req.user.firmId;
    const userId = req.user.id;

    if (!firmId) {
      return res.status(403).json({ success: false, message: 'Büro yetkiniz bulunmuyor.' });
    }

    if (!tcKimlik || !password) {
      return res.status(400).json({
        success: false,
        message: 'TC Kimlik No ve şifre gereklidir.',
      });
    }

    // Sync log kaydı oluştur
    const syncLog = await UyapSyncLog.create({
      firmId,
      userId,
      syncType: 'full',
    });

    // Asenkron olarak senkronizasyonu başlat
    // (Response hemen dönecek, arka planda çalışacak)
    setImmediate(async () => {
      const bot = new UyapBotService();
      let result;

      try {
        console.log(`[UYAP] Senkronizasyon başlatıldı. User: ${userId}, Log: ${syncLog.id}`);
        result = await bot.fullSync(tcKimlik, password);

        // Davaları veritabanına kaydet/güncelle
        let casesSynced = 0;
        for (const caseData of result.cases) {
          try {
            // Esas numarasına göre mevcut dava var mı kontrol et
            const existingCases = await Case.findByFirmId(firmId);
            const existing = existingCases.find(c => c.esas_no === caseData.esasNo);

            if (existing) {
              // Güncelle
              await Case.update(existing.id, firmId, {
                mahkeme: caseData.mahkeme,
                konu: caseData.konu,
                taraf_davaci: caseData.tarafDavaci,
                taraf_davali: caseData.tarafDavali,
                durum: caseData.durum,
              });
            } else {
              // Yeni oluştur
              await Case.create({
                firmId,
                esasNo: caseData.esasNo,
                mahkeme: caseData.mahkeme,
                konu: caseData.konu,
                tarafDavaci: caseData.tarafDavaci,
                tarafDavali: caseData.tarafDavali,
                durum: caseData.durum,
                notlar: 'UYAP senkronizasyonu ile eklendi.',
              });
            }
            casesSynced++;
          } catch (err) {
            console.error(`[UYAP] Dava kaydetme hatası (${caseData.esasNo}):`, err.message);
          }
        }

        // Duruşmaları kaydet
        let hearingsSynced = 0;
        for (const hearing of result.hearings) {
          try {
            // İlgili davayı bul (esas_no ile eşleştir)
            const allCases = await Case.findByFirmId(firmId);
            const relatedCase = allCases.find(c => c.esas_no === hearing.esasNo);

            if (relatedCase) {
              // Tarih parse et (UYAP formatı: "DD.MM.YYYY HH:mm")
              const parsedDate = parseUyapDate(hearing.tarihSaat);
              if (parsedDate) {
                await Hearing.create({
                  caseId: relatedCase.id,
                  firmId,
                  tarihSaat: parsedDate,
                  notlar: hearing.notlar || `UYAP - ${hearing.mahkeme}`,
                });
                hearingsSynced++;
              }
            }
          } catch (err) {
            console.error(`[UYAP] Duruşma kaydetme hatası:`, err.message);
          }
        }

        // Tebligatları kaydet
        let notificationsSynced = 0;
        for (const notif of result.notifications) {
          try {
            const parsedDate = parseUyapDate(notif.date);

            // İlgili davayı bul
            let caseId = null;
            if (notif.caseRef) {
              const allCases = await Case.findByFirmId(firmId);
              const relatedCase = allCases.find(c => c.esas_no === notif.caseRef);
              if (relatedCase) caseId = relatedCase.id;
            }

            await UyapNotification.create({
              firmId,
              caseId,
              uyapId: `${notif.title}_${notif.date}`.replace(/\s/g, '_'),
              title: notif.title,
              content: notif.content,
              notificationType: notif.type,
              notificationDate: parsedDate,
              rawData: notif,
            });
            notificationsSynced++;
          } catch (err) {
            console.error('[UYAP] Tebligat kaydetme hatası:', err.message);
          }
        }

        // Log'u güncelle
        const status = result.errors.length > 0 ? 'partial' : 'success';
        await UyapSyncLog.complete(syncLog.id, {
          status,
          casesSynced,
          hearingsSynced,
          notificationsSynced,
          errorMessage: result.errors.length > 0 ? result.errors.join('; ') : null,
        });

        console.log(`[UYAP] Senkronizasyon tamamlandı. Durum: ${status} | Dava: ${casesSynced}, Duruşma: ${hearingsSynced}, Tebligat: ${notificationsSynced}`);

      } catch (err) {
        console.error('[UYAP] Senkronizasyon hatası:', err.message);
        await UyapSyncLog.complete(syncLog.id, {
          status: 'failed',
          casesSynced: 0,
          hearingsSynced: 0,
          notificationsSynced: 0,
          errorMessage: err.message,
        });
      }
    });

    // Hemen response dön (işlem arka planda devam eder)
    res.status(202).json({
      success: true,
      message: 'UYAP senkronizasyonu başlatıldı. Senkronizasyon Geçmişi sekmesinden durumu takip edebilirsiniz.',
      data: { syncLogId: syncLog.id },
    });

  } catch (error) {
    next(error);
  }
};

/**
 * Senkronizasyon loglarını getir
 * GET /api/uyap/sync/logs
 */
exports.getSyncLogs = async (req, res, next) => {
  try {
    const firmId = req.user.firmId;
    if (!firmId) return res.status(403).json({ success: false, message: 'Yetkisiz erişim.' });

    const limit = parseInt(req.query.limit) || 20;
    const logs = await UyapSyncLog.findByFirmId(firmId, limit);
    res.status(200).json({ success: true, data: logs });
  } catch (error) {
    next(error);
  }
};

/**
 * Son senkronizasyon durumunu getir
 * GET /api/uyap/sync/status
 */
exports.getSyncStatus = async (req, res, next) => {
  try {
    const firmId = req.user.firmId;
    const userId = req.user.id;
    if (!firmId) return res.status(403).json({ success: false, message: 'Yetkisiz erişim.' });

    const latest = await UyapSyncLog.findLatestByUserId(userId, firmId);
    res.status(200).json({ success: true, data: latest });
  } catch (error) {
    next(error);
  }
};

/**
 * Tebligat listesini getir
 * GET /api/uyap/notifications
 * Query: ?unreadOnly=true&limit=50
 */
exports.getNotifications = async (req, res, next) => {
  try {
    const firmId = req.user.firmId;
    if (!firmId) return res.status(403).json({ success: false, message: 'Yetkisiz erişim.' });

    const unreadOnly = req.query.unreadOnly === 'true';
    const limit = parseInt(req.query.limit) || 50;

    const notifications = await UyapNotification.findByFirmId(firmId, { unreadOnly, limit });
    const unreadCount = await UyapNotification.getUnreadCount(firmId);

    res.status(200).json({
      success: true,
      data: notifications,
      meta: { unreadCount },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Tebligatı okundu olarak işaretle
 * PUT /api/uyap/notifications/:id/read
 */
exports.markNotificationRead = async (req, res, next) => {
  try {
    const firmId = req.user.firmId;
    const { id } = req.params;
    if (!firmId) return res.status(403).json({ success: false, message: 'Yetkisiz erişim.' });

    const updated = await UyapNotification.markAsRead(id, firmId);
    if (!updated) return res.status(404).json({ success: false, message: 'Tebligat bulunamadı.' });

    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

/**
 * Tüm tebligatları okundu olarak işaretle
 * PUT /api/uyap/notifications/read-all
 */
exports.markAllNotificationsRead = async (req, res, next) => {
  try {
    const firmId = req.user.firmId;
    if (!firmId) return res.status(403).json({ success: false, message: 'Yetkisiz erişim.' });

    const count = await UyapNotification.markAllAsRead(firmId);
    res.status(200).json({
      success: true,
      message: `${count} tebligat okundu olarak işaretlendi.`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Okunmamış tebligat sayısını getir
 * GET /api/uyap/notifications/unread-count
 */
exports.getUnreadCount = async (req, res, next) => {
  try {
    const firmId = req.user.firmId;
    if (!firmId) return res.status(403).json({ success: false, message: 'Yetkisiz erişim.' });

    const count = await UyapNotification.getUnreadCount(firmId);
    res.status(200).json({ success: true, data: { unreadCount: count } });
  } catch (error) {
    next(error);
  }
};

/**
 * Davaları ve Duruşmaları getir
 * GET /api/uyap/cases
 */
exports.getCases = async (req, res, next) => {
  try {
    const firmId = req.user.firmId;
    if (!firmId) return res.status(403).json({ success: false, message: 'Yetkisiz erişim.' });
    
    // Tüm davaları bul
    const cases = await Case.findByFirmId(firmId);
    
    // Yaklaşan duruşmaları bul
    const { pool } = require('../config/db');
    const { rows: hearings } = await pool.query(
      `SELECT * FROM hearings WHERE firm_id = $1 AND tarih_saat > NOW() ORDER BY tarih_saat ASC`, 
      [firmId]
    );

    const formattedCases = cases.map(c => {
      const nextHearing = hearings.find(h => h.case_id === c.id);
      return {
        id: c.id,
        esas: c.esas_no,
        mahkeme: c.mahkeme,
        taraf: c.taraf_davaci ? `${c.taraf_davaci} / ${c.taraf_davali}` : null,
        durum: c.durum,
        nextHearing: nextHearing ? nextHearing.tarih_saat : null
      };
    });

    res.status(200).json({ success: true, data: formattedCases });
  } catch (error) {
    next(error);
  }
};

/**
 * UYAP Evraklarını getir
 * GET /api/uyap/documents
 */
exports.getDocuments = async (req, res, next) => {
  try {
    const firmId = req.user.firmId;
    if (!firmId) return res.status(403).json({ success: false, message: 'Yetkisiz erişim.' });
    // Gerçek evrak veritabanı bağlandığında buradan dönülecek.
    res.status(200).json({ success: true, data: [] });
  } catch (error) {
    next(error);
  }
};

/**
 * Evrak İndir
 * GET /api/uyap/documents/:id/download
 */
exports.downloadDocument = async (req, res, next) => {
  res.status(404).json({ success: false, message: "Evrak sunucuda bulunamadı." });
};

/**
 * Evrak Yapay Zeka Analizi
 * POST /api/uyap/documents/:id/analyze
 */
exports.analyzeDocument = async (req, res, next) => {
  res.status(404).json({ success: false, message: "Analiz edilecek evrak bulunamadı." });
};

// ---- Yardımcı Fonksiyonlar ----

/**
 * UYAP tarih formatını (DD.MM.YYYY HH:mm) ISO formatına çevirir
 */
function parseUyapDate(dateStr) {
  if (!dateStr) return null;
  try {
    // "15.03.2025 14:30" formatını parse et
    const match = dateStr.match(/(\d{2})\.(\d{2})\.(\d{4})\s*(\d{2})?:?(\d{2})?/);
    if (match) {
      const [, day, month, year, hour = '00', minute = '00'] = match;
      return new Date(`${year}-${month}-${day}T${hour}:${minute}:00`).toISOString();
    }
    // Başka formatları dene
    const parsed = new Date(dateStr);
    return isNaN(parsed.getTime()) ? null : parsed.toISOString();
  } catch {
    return null;
  }
}
