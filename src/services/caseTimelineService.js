// ============================================================
// Emsal Atlası - Case Timeline Service
// Dava süreç haritası: evrak, duruşma ve tebligatları
// kronolojik bir zaman çizelgesine dönüştürür
// ============================================================

const { pool } = require('../config/db');

class CaseTimelineService {
  /**
   * Bir dava için tüm olayları toplar ve kronolojik sıralar
   */
  static async buildTimeline(caseId) {
    const events = [];

    // 1. Dava bilgisini al
    const caseRes = await pool.query(`SELECT * FROM cases WHERE id = $1`, [caseId]);
    const caseData = caseRes.rows[0];
    if (!caseData) throw new Error('Dava bulunamadı.');

    // Dava açılış olayı
    if (caseData.created_at) {
      events.push({
        date: caseData.created_at,
        title: 'Dava Açılışı',
        description: `${caseData.konu || 'Belirtilmemiş'} - ${caseData.mahkeme || ''}`,
        type: 'case_open',
        severity: 'info',
        icon: 'gavel',
        meta: { esasNo: caseData.esas_no, davaci: caseData.taraf_davaci, davali: caseData.taraf_davali },
      });
    }

    // 2. Dava dokümanları
    try {
      const docsRes = await pool.query(
        `SELECT * FROM case_documents WHERE case_id = $1 AND deleted_at IS NULL ORDER BY created_at ASC`,
        [caseId]
      );
      for (const doc of docsRes.rows) {
        events.push({
          date: doc.uploaded_at || doc.created_at,
          title: `Doküman: ${doc.title || doc.file_name || doc.document_name}`,
          description: doc.description || `${doc.document_type || 'Genel'} türünde doküman yüklendi.`,
          type: 'document',
          severity: 'info',
          icon: 'file',
          meta: { docId: doc.id, fileName: doc.file_name || doc.document_name, analysisStatus: doc.analysis_status },
        });
      }
    } catch (err) {
      // case_documents tablosu yoksa hata vermesin
      console.log('[Timeline] case_documents tablosu yok veya hata:', err.message);
    }

    // 3. Duruşmalar
    try {
      const hearingsRes = await pool.query(
        `SELECT *,
                COALESCE(hearing_date, tarih_saat) AS event_date,
                COALESCE(notes, notlar) AS event_notes
         FROM hearings
         WHERE case_id = $1
         ORDER BY COALESCE(hearing_date, tarih_saat) ASC`,
        [caseId]
      );
      for (const h of hearingsRes.rows) {
        const isPast = new Date(h.event_date) < new Date();
        events.push({
          date: h.event_date,
          title: `Duruşma${h.mahkeme ? ': ' + h.mahkeme : ''}`,
          description: h.event_notes || (isPast ? 'Duruşma gerçekleşti.' : 'Planlanan duruşma.'),
          type: 'hearing',
          severity: isPast ? 'info' : 'warning',
          icon: 'calendar',
          meta: { hearingId: h.id, result: h.result },
        });
      }
    } catch (err) {
      console.log('[Timeline] hearings tablosu yok veya hata:', err.message);
    }

    // 4. UYAP Tebligatlar
    try {
      const notifsRes = await pool.query(
        `SELECT * FROM uyap_notifications
         WHERE case_id = $1
            OR (
              $3::uuid IS NOT NULL
              AND firm_id = $3
              AND (case_ref ILIKE $2 OR content ILIKE $2 OR title ILIKE $2)
            )
         ORDER BY created_at ASC`,
        [
          caseId,
          `%${caseData.esas_no || 'NOMATCH'}%`,
          caseData.scope_type === 'ORGANIZATION' ? caseData.law_firm_id : null,
        ]
      );
      for (const n of notifsRes.rows) {
        events.push({
          date: n.notification_date || n.created_at,
          title: n.title,
          description: n.content,
          type: 'notification',
          severity: n.notification_type === 'tebligat' ? 'critical' : 'info',
          icon: 'bell',
          meta: { notifId: n.id, notifType: n.notification_type },
        });
      }
    } catch (err) {
      console.log('[Timeline] uyap_notifications tablosu yok veya hata:', err.message);
    }

    // 5. Deadline uyarıları
    try {
      const deadlinesRes = await pool.query(
        `SELECT * FROM deadline_alerts WHERE case_id = $1 ORDER BY deadline_date ASC`,
        [caseId]
      );
      for (const d of deadlinesRes.rows) {
        events.push({
          date: d.deadline_date,
          title: `⏰ ${d.title}`,
          description: d.description,
          type: 'deadline',
          severity: d.priority === 'critical' ? 'critical' : 'warning',
          icon: 'clock',
          meta: { deadlineId: d.id, acknowledged: d.is_acknowledged },
        });
      }
    } catch (err) {
      console.log('[Timeline] deadline_alerts tablosu yok veya hata:', err.message);
    }

    // Kronolojik sırala
    events.sort((a, b) => new Date(a.date) - new Date(b.date));

    return {
      caseInfo: caseData,
      events,
      totalEvents: events.length,
    };
  }
}

module.exports = CaseTimelineService;
