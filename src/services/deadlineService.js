// ============================================================
// Emsal Atlası - Deadline Service
// Tebligat tipine göre otomatik süre hesaplama ve uyarı oluşturma
// ============================================================

const DeadlineAlert = require('../models/DeadlineAlert');

function lowerTr(value) {
  return String(value || '').toLocaleLowerCase('tr-TR');
}

function getCalendarWarnings(deadlineDate) {
  const warnings = [];
  const date = new Date(deadlineDate);
  if (Number.isNaN(date.getTime())) return warnings;

  const day = date.getDay();
  const month = date.getMonth() + 1;
  const monthDay = `${String(month).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const fixedHolidays = new Set(['01-01', '04-23', '05-01', '05-19', '07-15', '08-30', '10-29']);

  if (day === 0 || day === 6) {
    warnings.push('Son gün hafta sonuna denk geliyor; süre uzaması avukat tarafından kontrol edilmeli.');
  }

  if (fixedHolidays.has(monthDay)) {
    warnings.push('Son gün sabit resmi tatil günlerinden birine denk geliyor; resmi tatil takvimi kontrol edilmeli.');
  }

  if ((month === 7 && date.getDate() >= 20) || month === 8) {
    warnings.push('Son gün adli tatil aralığına denk gelebilir; süre türüne göre adli tatil etkisi kontrol edilmeli.');
  }

  return warnings;
}

function buildDeadlineDescription(rule, sourceTitle, warnings = []) {
  const warningText = warnings.length ? `\n\nTakvim uyarıları:\n- ${warnings.join('\n- ')}` : '';
  return `${rule.description}\n\nKaynak belge: ${sourceTitle || 'Belge analizi'}${warningText}\n\nBu çıktı insan onayı gerektirir; sistem kendiliğinden UYAP işlemi yapmaz.`;
}

/**
 * Tebligat tipine göre yasal süreleri belirler
 */
const DEADLINE_RULES = {
  'Gerekçeli Karar Tebliği': {
    days: 14,
    title: 'İstinaf başvuru süresi',
    description: 'Gerekçeli karar tebliğ edildi. İstinaf için 2 haftalık süreniz başladı.',
    priority: 'critical',
    alertType: 'istinaf',
  },
  'Temyiz': {
    days: 30,
    title: 'Temyiz başvuru süresi',
    description: 'Temyiz hakkınız başladı. 30 gün içinde başvurmanız gerekmektedir.',
    priority: 'critical',
    alertType: 'temyiz',
  },
  'Cevap Dilekçesi': {
    days: 14,
    title: 'Cevap dilekçesi süresi',
    description: 'Karşı tarafın davasına cevap dilekçesi verme süreniz başladı.',
    priority: 'high',
    alertType: 'cevap',
  },
  'Dava Dilekçesi Tebliği': {
    days: 14,
    title: 'Cevap dilekçesi süresi',
    description: 'Dava dilekçesi tebliğ edildi. 2 hafta içinde cevap dilekçesi verilmelidir.',
    priority: 'high',
    alertType: 'cevap',
  },
  'Bilirkişi Raporu': {
    days: 14,
    title: 'Bilirkişi raporu itiraz süresi',
    description: 'Bilirkişi raporu tebliğ edildi. İtiraz için 2 haftalık süreniz başladı.',
    priority: 'high',
    alertType: 'itiraz',
  },
  'İcra Emri': {
    days: 7,
    title: 'İcra emrine itiraz süresi',
    description: 'İcra emri tebliğ edildi. 7 gün içinde itiraz edebilirsiniz.',
    priority: 'critical',
    alertType: 'icra',
  },
  'Ödeme Emri': {
    days: 7,
    title: 'Ödeme emrine itiraz süresi',
    description: 'Ödeme emri tebliğ edildi. 7 gün içinde itiraz edebilirsiniz.',
    priority: 'critical',
    alertType: 'icra',
  },
  'Duruşma': {
    days: 0, // Duruşma tarihine göre hesaplanır
    title: 'Duruşma günü',
    description: 'Planlanan duruşma tarihi.',
    priority: 'normal',
    alertType: 'durusma',
  },
};

class DeadlineService {
  /**
   * Tebligattan otomatik deadline oluşturur
   * @param {object} notification - UYAP tebligat verisi
   * @param {string} firmId - Büro ID
   * @param {string|null} caseId - Dava ID (varsa)
   */
  static async processNotification(notification, firmId, caseId = null) {
    const deadlines = [];

    // Tebligat tipini tanımaya çalış
    for (const [keyword, rule] of Object.entries(DEADLINE_RULES)) {
      const titleLower = lowerTr(notification.title);
      const contentLower = lowerTr(notification.content);
      const typeLower = lowerTr(notification.type);

      if (
        titleLower.includes(lowerTr(keyword)) ||
        contentLower.includes(lowerTr(keyword)) ||
        typeLower.includes(lowerTr(keyword))
      ) {
        const deadlineDate = new Date(notification.date || Date.now());
        deadlineDate.setDate(deadlineDate.getDate() + rule.days);
        const calendarWarnings = getCalendarWarnings(deadlineDate);

        try {
          const alert = await DeadlineAlert.create({
            firmId,
            caseId,
            title: rule.title,
            description: buildDeadlineDescription(rule, notification.title, calendarWarnings),
            deadlineDate,
            alertType: rule.alertType,
            priority: rule.priority,
            source: 'uyap',
            sourceRef: notification.id || notification.title,
          });
          deadlines.push(alert);
          console.log(`[Deadline] Oluşturuldu: ${rule.title} → ${deadlineDate.toLocaleDateString('tr-TR')}`);
        } catch (err) {
          console.error(`[Deadline] Oluşturma hatası:`, err.message);
        }
        break; // İlk eşleşen kural yeterli
      }
    }

    return deadlines;
  }

  static async processDocumentAnalysis({ document, text, analysis }, firmId, caseId = null, createdBy = null) {
    const deadlines = [];
    const haystack = lowerTr([
      document?.document_name,
      document?.file_name,
      document?.title,
      document?.document_type,
      analysis?.summary,
      String(text || '').slice(0, 3000),
    ].filter(Boolean).join(' '));

    for (const [keyword, rule] of Object.entries(DEADLINE_RULES)) {
      if (!haystack.includes(lowerTr(keyword))) continue;

      const sourceRef = `${document?.id}:${keyword}`;
      const existing = await DeadlineAlert.findBySource({
        firmId,
        caseId,
        source: 'document_analysis',
        sourceRef,
      });
      if (existing) break;

      const deadlineDate = new Date();
      deadlineDate.setDate(deadlineDate.getDate() + rule.days);
      const calendarWarnings = getCalendarWarnings(deadlineDate);

      const alert = await DeadlineAlert.create({
        firmId,
        caseId,
        title: rule.title,
        description: buildDeadlineDescription(rule, document?.document_name || keyword, calendarWarnings),
        deadlineDate,
        alertType: rule.alertType,
        priority: rule.priority,
        source: 'document_analysis',
        sourceRef,
        createdBy,
      });
      deadlines.push(alert);
      break;
    }

    return deadlines;
  }

  /**
   * Duruşmadan deadline oluşturur
   */
  static async processHearing(hearing, firmId, caseId = null) {
    if (!hearing.tarihSaat) return null;

    try {
      const hearingDate = new Date(hearing.tarihSaat);
      // Geçmiş tarih ise oluşturma
      if (hearingDate < new Date()) return null;

      const alert = await DeadlineAlert.create({
        firmId,
        caseId,
        title: `Duruşma: ${hearing.mahkeme || 'Bilinmiyor'}`,
        description: `Esas No: ${hearing.esasNo || 'Bilinmiyor'}\nMahkeme: ${hearing.mahkeme || 'Bilinmiyor'}\nNotlar: ${hearing.notlar || ''}`,
        deadlineDate: hearingDate,
        alertType: 'durusma',
        priority: 'normal',
        source: 'uyap',
        sourceRef: hearing.esasNo,
      });
      return alert;
    } catch (err) {
      console.error(`[Deadline] Duruşma deadline hatası:`, err.message);
      return null;
    }
  }

  /**
   * UYAP senkronizasyon sonrası tüm verileri işler
   */
  static async processUyapSyncResult(syncResult, firmId) {
    const allDeadlines = [];

    // Tebligatları işle
    for (const notif of (syncResult.notifications || [])) {
      const deadlines = await this.processNotification(notif, firmId);
      allDeadlines.push(...deadlines);
    }

    // Duruşmaları işle
    for (const hearing of (syncResult.hearings || [])) {
      const deadline = await this.processHearing(hearing, firmId);
      if (deadline) allDeadlines.push(deadline);
    }

    console.log(`[Deadline] UYAP sync sonrası ${allDeadlines.length} deadline oluşturuldu.`);
    return allDeadlines;
  }
}

module.exports = DeadlineService;
