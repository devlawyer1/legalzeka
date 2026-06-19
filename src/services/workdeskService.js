const { pool } = require('../config/db');

async function safeQuery(label, fallback, fn) {
  try {
    return await fn();
  } catch (error) {
    console.error(`[Workdesk] ${label} query failed:`, error.message);
    return fallback;
  }
}

function normalizeRows(result) {
  return result?.rows || [];
}

class WorkdeskService {
  static async getOverview({ firmId, userId }) {
    const [
      cases,
      tasksToday,
      upcomingDeadlines,
      hearings,
      recentDocuments,
      aiRisks,
      recentResearch,
      stats,
    ] = await Promise.all([
      safeQuery('cases', [], async () => normalizeRows(await pool.query(
        `SELECT id, esas_no, mahkeme, konu, taraf_davaci, taraf_davali, durum, updated_at
         FROM cases
         WHERE firm_id = $1 AND is_active = true
         ORDER BY updated_at DESC NULLS LAST, created_at DESC
         LIMIT 8`,
        [firmId]
      ))),
      safeQuery('tasksToday', [], async () => normalizeRows(await pool.query(
        `SELECT t.id, t.case_id, t.baslik, t.aciklama, t.son_tarih, t.oncelik, t.durum,
                c.esas_no, c.mahkeme, c.konu
         FROM tasks t
         LEFT JOIN cases c ON c.id = t.case_id
         WHERE t.firm_id = $1
           AND COALESCE(t.durum, '') NOT IN ('Tamamlandı', 'Tamamlandi', 'completed', 'done')
           AND (
             t.son_tarih::date = CURRENT_DATE
             OR (t.son_tarih IS NULL AND t.created_at >= CURRENT_DATE - INTERVAL '7 days')
           )
         ORDER BY t.son_tarih ASC NULLS LAST, t.created_at DESC
         LIMIT 10`,
        [firmId]
      ))),
      safeQuery('upcomingDeadlines', [], async () => normalizeRows(await pool.query(
        `SELECT da.id, da.case_id, da.title, da.description, da.deadline_date,
                da.alert_type, da.priority, da.source, c.esas_no, c.mahkeme, c.konu
         FROM deadline_alerts da
         LEFT JOIN cases c ON c.id = da.case_id
         WHERE da.firm_id = $1
           AND da.is_acknowledged = false
           AND da.deadline_date >= NOW() - INTERVAL '1 day'
         ORDER BY da.deadline_date ASC
         LIMIT 10`,
        [firmId]
      ))),
      safeQuery('hearings', [], async () => normalizeRows(await pool.query(
        `SELECT h.id, h.case_id, COALESCE(h.hearing_date, h.tarih_saat) AS hearing_date,
                COALESCE(h.notes, h.notlar) AS notes,
                c.esas_no, c.mahkeme, c.konu
         FROM hearings h
         JOIN cases c ON c.id = h.case_id
         WHERE h.firm_id = $1
           AND COALESCE(h.hearing_date, h.tarih_saat) >= NOW() - INTERVAL '1 day'
         ORDER BY COALESCE(h.hearing_date, h.tarih_saat) ASC
         LIMIT 8`,
        [firmId]
      ))),
      safeQuery('recentDocuments', [], async () => normalizeRows(await pool.query(
        `SELECT cd.id, cd.case_id, cd.document_name, cd.file_url, cd.document_type,
                cd.analysis_status, cd.analysis_summary, cd.created_at,
                c.esas_no, c.mahkeme, c.konu
         FROM case_documents cd
         JOIN cases c ON c.id = cd.case_id
         WHERE cd.firm_id = $1
         ORDER BY cd.created_at DESC
         LIMIT 8`,
        [firmId]
      ))),
      safeQuery('aiRisks', [], async () => normalizeRows(await pool.query(
        `SELECT cda.id, cda.case_id, cda.document_id, cda.warnings, cda.completed_at,
                cd.document_name, c.esas_no, c.mahkeme, c.konu
         FROM case_document_analyses cda
         JOIN case_documents cd ON cd.id = cda.document_id
         JOIN cases c ON c.id = cda.case_id
         WHERE cda.firm_id = $1
           AND jsonb_array_length(COALESCE(cda.warnings, '[]'::jsonb)) > 0
         ORDER BY cda.completed_at DESC NULLS LAST, cda.created_at DESC
         LIMIT 8`,
        [firmId]
      ))),
      safeQuery('recentResearch', [], async () => normalizeRows(await pool.query(
        `SELECT id, query, search_type, created_at
         FROM search_history
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 8`,
        [userId]
      ))),
      safeQuery('stats', {
        activeCases: 0,
        tasksDueToday: 0,
        upcomingDeadlines: 0,
        upcomingHearings: 0,
        openRisks: 0,
      }, async () => {
        const { rows } = await pool.query(
          `SELECT
            (SELECT COUNT(*) FROM cases WHERE firm_id = $1 AND is_active = true)::int AS active_cases,
            (SELECT COUNT(*) FROM tasks WHERE firm_id = $1 AND COALESCE(durum, '') NOT IN ('Tamamlandı', 'Tamamlandi', 'completed', 'done') AND son_tarih::date = CURRENT_DATE)::int AS tasks_due_today,
            (SELECT COUNT(*) FROM deadline_alerts WHERE firm_id = $1 AND is_acknowledged = false AND deadline_date <= NOW() + INTERVAL '14 days')::int AS upcoming_deadlines,
            (SELECT COUNT(*) FROM hearings WHERE firm_id = $1 AND COALESCE(hearing_date, tarih_saat) BETWEEN NOW() AND NOW() + INTERVAL '14 days')::int AS upcoming_hearings,
            (SELECT COUNT(*) FROM case_document_analyses WHERE firm_id = $1 AND jsonb_array_length(COALESCE(warnings, '[]'::jsonb)) > 0)::int AS open_risks`,
          [firmId]
        );
        const row = rows[0] || {};
        return {
          activeCases: row.active_cases || 0,
          tasksDueToday: row.tasks_due_today || 0,
          upcomingDeadlines: row.upcoming_deadlines || 0,
          upcomingHearings: row.upcoming_hearings || 0,
          openRisks: row.open_risks || 0,
        };
      }),
    ]);

    return {
      firmId,
      generatedAt: new Date().toISOString(),
      stats,
      cases,
      tasksToday,
      upcomingDeadlines,
      hearings,
      recentDocuments,
      aiRisks,
      recentResearch,
    };
  }
}

module.exports = WorkdeskService;
