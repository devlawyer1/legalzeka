const { pool } = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { FIRM_READ_ROLES, FIRM_WRITE_ROLES } = require('../services/accessContext');

function documentAccessPredicate(context, permission, values) {
  const adminParam = values.push(Boolean(context?.isSystemAdmin));
  const userParam = values.push(context?.userId || null);
  const rolesParam = values.push(permission === 'write' ? FIRM_WRITE_ROLES : FIRM_READ_ROLES);
  return `(
    $${adminParam}::boolean = true
    OR (c.scope_type = 'PERSONAL' AND c.owner_user_id = $${userParam})
    OR (
      c.scope_type = 'ORGANIZATION'
      AND EXISTS (
        SELECT 1 FROM firm_users fu
        JOIN law_firms lf ON lf.id = fu.firm_id
        WHERE fu.firm_id = c.law_firm_id
          AND fu.user_id = $${userParam}
          AND fu.is_active = true
          AND lf.is_active = true
          AND fu.firm_role = ANY($${rolesParam}::text[])
      )
    )
  )`;
}

const JOB_SELECT = `
  LEFT JOIN LATERAL (
    SELECT id, status, job_type, attempt_count, max_attempts, available_at,
           started_at, completed_at, failed_at, error_code, error_message, created_at
    FROM document_processing_jobs
    WHERE document_id = cd.id
    ORDER BY created_at DESC
    LIMIT 1
  ) job ON true`;

const PAGE_SUMMARY_SELECT = `
  LEFT JOIN LATERAL (
    SELECT MIN(ocr_confidence) FILTER (WHERE text_source = 'OCR') AS min_ocr_confidence,
           BOOL_OR(text_source = 'OCR') AS has_ocr_pages
    FROM document_pages
    WHERE document_id = cd.id
  ) page_summary ON true`;

class CaseDocument {
  static async createQueued({
    db = pool,
    caseId,
    firmId = null,
    originalFilename,
    safeFilename,
    storageKey,
    uploadedBy,
    documentType = 'Genel',
    description = null,
    declaredMimeType,
    detectedMimeType,
    fileExtension,
    fileSizeBytes,
    sha256Hash,
  }) {
    const id = uuidv4();
    const { rows } = await db.query(
      `INSERT INTO case_documents (
         id, case_id, firm_id, document_name, file_name, title, file_url,
         uploaded_by, document_type, description, analysis_status, uploaded_at,
         original_filename, safe_filename, storage_key, storage_provider,
         declared_mime_type, detected_mime_type, file_extension, file_size_bytes,
         sha256_hash, processing_status, processing_version, processing_attempts
       ) VALUES (
         $1, $2, $3, $4, $5, $4, $6, $7, $8, $9, 'pending', CURRENT_TIMESTAMP,
         $4, $5, $6, 'LOCAL', $10, $11, $12, $13, $14, 'QUEUED', 1, 0
       )
       RETURNING *`,
      [
        id, caseId, firmId, originalFilename, safeFilename, storageKey, uploadedBy,
        documentType, description, declaredMimeType, detectedMimeType, fileExtension,
        fileSizeBytes, sha256Hash,
      ]
    );
    return rows[0];
  }

  static async findByCaseIdAccessible(caseId, context) {
    const values = [caseId];
    const accessSql = documentAccessPredicate(context, 'read', values);
    const { rows } = await pool.query(
      `SELECT cd.*, u.first_name, u.last_name,
              job.id AS latest_job_id, job.status AS latest_job_status,
              job.attempt_count AS latest_job_attempt_count,
              job.max_attempts AS latest_job_max_attempts,
              job.error_code AS latest_job_error_code,
              job.error_message AS latest_job_error_message,
              page_summary.min_ocr_confidence, page_summary.has_ocr_pages
       FROM case_documents cd
       JOIN cases c ON c.id = cd.case_id
       LEFT JOIN users u ON cd.uploaded_by = u.id
       ${JOB_SELECT}
       ${PAGE_SUMMARY_SELECT}
       WHERE cd.case_id = $1 AND cd.deleted_at IS NULL AND c.is_active = true AND ${accessSql}
       ORDER BY cd.created_at DESC`,
      values
    );
    return rows;
  }

  static async findAccessibleDocument(id, caseId, context, permission = 'read', { includeDeleted = false } = {}) {
    const values = [id, caseId];
    const accessSql = documentAccessPredicate(context, permission, values);
    const { rows } = await pool.query(
      `SELECT cd.*, c.scope_type, c.owner_user_id, c.law_firm_id,
              c.esas_no, c.mahkeme, c.konu,
              row_to_json(job) AS latest_job
       FROM case_documents cd
       JOIN cases c ON c.id = cd.case_id
       ${JOB_SELECT}
       WHERE cd.id = $1 AND cd.case_id = $2
         ${includeDeleted ? '' : 'AND cd.deleted_at IS NULL'}
         AND c.is_active = true AND ${accessSql}
       LIMIT 1`,
      values
    );
    return rows[0] || null;
  }

  static async markSoftDeleted({ db = pool, id, caseId }) {
    const { rows } = await db.query(
      `UPDATE case_documents
       SET deleted_at = COALESCE(deleted_at, CURRENT_TIMESTAMP), processing_status = 'CANCELLED'
       WHERE id = $1 AND case_id = $2
       RETURNING *`,
      [id, caseId]
    );
    return rows[0] || null;
  }
}

module.exports = CaseDocument;
