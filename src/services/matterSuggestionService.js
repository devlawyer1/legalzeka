const { pool } = require('../config/db');
const AuditLogService = require('./AuditLogService');

function reviewError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

async function getSuggestions(caseId, documentId, { db = pool } = {}) {
  const { rows } = await db.query(
    `SELECT es.*, er.status AS extraction_status, er.provider, er.model,
            cd.original_filename,
            dp.ocr_confidence, dp.text_source
     FROM extraction_suggestions es
     JOIN extraction_runs er ON er.id = es.extraction_run_id
     JOIN case_documents cd ON cd.id = es.document_id AND cd.case_id = es.case_id
     LEFT JOIN document_pages dp ON dp.document_id = es.document_id AND dp.page_number = es.source_page
     WHERE es.case_id = $1 AND es.document_id = $2 AND cd.deleted_at IS NULL
     ORDER BY es.status = 'PENDING' DESC, es.source_page, es.created_at`,
    [caseId, documentId]
  );
  return rows;
}

async function lockSuggestion(client, caseId, suggestionId) {
  const { rows } = await client.query(
    `SELECT es.*, cd.deleted_at
     FROM extraction_suggestions es
     JOIN case_documents cd ON cd.id = es.document_id AND cd.case_id = es.case_id
     WHERE es.id = $1 AND es.case_id = $2
     FOR UPDATE OF es`,
    [suggestionId, caseId]
  );
  const suggestion = rows[0];
  if (!suggestion || suggestion.deleted_at) throw reviewError(404, 'SUGGESTION_NOT_FOUND', 'Öneri bulunamadı.');
  return suggestion;
}

async function createMatterTarget(client, suggestion, userId) {
  const value = suggestion.normalized_value || {};
  if (suggestion.suggestion_type === 'PARTY') {
    const { rows } = await client.query(
      `INSERT INTO matter_parties (
         case_id, name, normalized_name, party_type, role, source_document_id,
         source_page, source_suggestion_id, verified_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (source_suggestion_id)
       DO UPDATE SET source_suggestion_id = EXCLUDED.source_suggestion_id
       RETURNING id`,
      [suggestion.case_id, value.name, value.normalizedName, value.partyType || 'UNKNOWN', value.role,
        suggestion.document_id, suggestion.source_page, suggestion.id, userId]
    );
    return rows[0].id;
  }
  if (suggestion.suggestion_type === 'EVENT' || suggestion.suggestion_type === 'DATE') {
    const isDate = suggestion.suggestion_type === 'DATE';
    const { rows } = await client.query(
      `INSERT INTO matter_events (
         case_id, title, description, event_date, date_precision, source_document_id,
         source_page, source_suggestion_id, verified_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (source_suggestion_id)
       DO UPDATE SET source_suggestion_id = EXCLUDED.source_suggestion_id
       RETURNING id`,
      [suggestion.case_id, isDate ? (value.dateType || 'Belgede geçen tarih') : value.title,
        isDate ? null : value.description || null, isDate ? value.value : value.eventDate,
        isDate ? 'EXACT' : value.datePrecision || 'UNKNOWN', suggestion.document_id,
        suggestion.source_page, suggestion.id, userId]
    );
    return rows[0].id;
  }
  const fieldByType = { CASE_NUMBER: 'esas_no', COURT: 'mahkeme', LEGAL_DOMAIN: 'legal_domain' };
  const field = fieldByType[suggestion.suggestion_type];
  if (!field) throw reviewError(422, 'UNSUPPORTED_SUGGESTION_TYPE', 'Öneri türü kabul edilemiyor.');
  await client.query(`UPDATE cases SET ${field} = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [suggestion.case_id, value.value]);
  return suggestion.case_id;
}

async function acceptLocked(client, suggestion, userId, req) {
  if (suggestion.status === 'ACCEPTED') return { suggestion, idempotent: true };
  if (suggestion.status !== 'PENDING') throw reviewError(409, 'SUGGESTION_ALREADY_REVIEWED', 'Öneri daha önce incelenmiş.');
  const targetEntityId = await createMatterTarget(client, suggestion, userId);
  const { rows } = await client.query(
    `UPDATE extraction_suggestions
     SET status = 'ACCEPTED', reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP,
         rejection_reason = NULL, target_entity_id = $3, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 RETURNING *`,
    [suggestion.id, userId, targetEntityId]
  );
  await AuditLogService.record({
    db: client, strict: true, req, action: 'SUGGESTION_ACCEPTED', entityType: 'EXTRACTION_SUGGESTION',
    entityId: suggestion.id, caseId: suggestion.case_id, documentId: suggestion.document_id,
    metadata: { suggestionType: suggestion.suggestion_type, targetEntityId },
  });
  return { suggestion: rows[0], idempotent: false };
}

async function rejectLocked(client, suggestion, userId, reason, req) {
  if (suggestion.status === 'REJECTED') return { suggestion, idempotent: true };
  if (suggestion.status !== 'PENDING') throw reviewError(409, 'SUGGESTION_ALREADY_REVIEWED', 'Öneri daha önce incelenmiş.');
  const { rows } = await client.query(
    `UPDATE extraction_suggestions
     SET status = 'REJECTED', reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP,
         rejection_reason = $3, target_entity_id = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 RETURNING *`,
    [suggestion.id, userId, reason ? String(reason).slice(0, 500) : null]
  );
  await AuditLogService.record({
    db: client, strict: true, req, action: 'SUGGESTION_REJECTED', entityType: 'EXTRACTION_SUGGESTION',
    entityId: suggestion.id, caseId: suggestion.case_id, documentId: suggestion.document_id,
    metadata: { suggestionType: suggestion.suggestion_type, hasReason: Boolean(reason) },
  });
  return { suggestion: rows[0], idempotent: false };
}

async function reviewOne({ caseId, suggestionId, action, userId, reason = null, req, db = pool }) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const suggestion = await lockSuggestion(client, caseId, suggestionId);
    const result = action === 'accept'
      ? await acceptLocked(client, suggestion, userId, req)
      : await rejectLocked(client, suggestion, userId, reason, req);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function bulkReview({ caseId, acceptIds, rejectItems, userId, req, db = pool }) {
  const accepts = [...new Set(acceptIds || [])];
  const rejects = rejectItems || [];
  const rejectIds = rejects.map((item) => item.id);
  if (new Set([...accepts, ...rejectIds]).size !== accepts.length + rejectIds.length) {
    throw reviewError(400, 'DUPLICATE_REVIEW_TARGET', 'Aynı öneri birden fazla işlemde kullanılamaz.');
  }
  if (accepts.length + rejects.length > 100) throw reviewError(400, 'BULK_LIMIT', 'Tek seferde en fazla 100 öneri incelenebilir.');
  const client = await db.connect();
  const results = [];
  try {
    await client.query('BEGIN');
    for (const id of accepts) {
      const suggestion = await lockSuggestion(client, caseId, id);
      results.push(await acceptLocked(client, suggestion, userId, req));
    }
    for (const item of rejects) {
      const suggestion = await lockSuggestion(client, caseId, item.id);
      results.push(await rejectLocked(client, suggestion, userId, item.reason, req));
    }
    await AuditLogService.record({
      db: client, strict: true, req, action: 'SUGGESTIONS_BULK_REVIEWED', entityType: 'CASE', entityId: caseId,
      caseId, metadata: { accepted: accepts.length, rejected: rejects.length, strategy: 'all_or_nothing' },
    });
    await client.query('COMMIT');
    return results;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  acceptLocked,
  bulkReview,
  getSuggestions,
  lockSuggestion,
  reviewError,
  reviewOne,
};
