const fs = require('fs');
const { pool } = require('../config/db');
const AuditLogService = require('./AuditLogService');
const { storage } = require('./storage');
const { sha256File } = require('./security/fileValidationService');
const { extractDocumentPages } = require('./documentPageExtractionService');
const { queueExtraction, processExtractionJob } = require('./extraction/extractionService');

function processingError(code, safeMessage) {
  const error = new Error(safeMessage);
  error.code = code;
  error.safeMessage = safeMessage;
  return error;
}

function classifyParseError(error) {
  if (error?.safeMessage) return error;
  const message = String(error?.message || '').toLowerCase();
  if (message.includes('password') || message.includes('encrypted')) {
    return processingError('ENCRYPTED_PDF', 'Encrypted PDF files are not supported.');
  }
  if (message.includes('invalid') || message.includes('format') || message.includes('xref')) {
    return processingError('CORRUPT_DOCUMENT', 'The document is corrupt or malformed.');
  }
  return processingError('PARSER_ERROR', 'Document text extraction failed.');
}

async function loadJobDocument(job, db = pool) {
  const { rows } = await db.query(
    `SELECT cd.*, c.scope_type, c.owner_user_id AS case_owner_user_id,
            c.law_firm_id AS case_law_firm_id
     FROM case_documents cd
     JOIN cases c ON c.id = cd.case_id
     WHERE cd.id = $1 AND cd.case_id = $2
     LIMIT 1`,
    [job.document_id, job.case_id]
  );
  const document = rows[0];
  if (!document) throw processingError('DOCUMENT_NOT_FOUND', 'Document metadata was not found.');
  const scopeMatches = document.scope_type === 'PERSONAL'
    ? !job.organization_id && job.owner_user_id === document.case_owner_user_id
    : !job.owner_user_id && job.organization_id === document.case_law_firm_id;
  if (!scopeMatches) throw processingError('SCOPE_MISMATCH', 'Document job scope validation failed.');
  return document;
}

async function hasStoredPages(documentId, db = pool) {
  const { rows } = await db.query('SELECT EXISTS (SELECT 1 FROM document_pages WHERE document_id = $1) AS found', [documentId]);
  return rows[0].found;
}

async function ensureExtractionQueued(document, db = pool) {
  return queueExtraction({ db, document });
}

async function processDocument(job, {
  db = pool,
  storageProvider = storage,
  ocrProvider,
  lockedBy = null,
} = {}) {
  const document = await loadJobDocument(job, db);
  if (document.deleted_at) return { skipped: true, reason: 'deleted' };
  if (
    document.processing_status === 'COMPLETED'
    && Number(job.payload?.processingVersion || document.processing_version) === document.processing_version
    && await hasStoredPages(document.id, db)
  ) {
    const queued = await ensureExtractionQueued(document, db);
    return {
      alreadyCompleted: true,
      pageCount: document.page_count,
      textExtracted: document.text_extracted,
      ocrRequired: document.ocr_required,
      extractionRunId: queued.run.id,
    };
  }

  await db.query(
    `UPDATE case_documents
     SET processing_status = 'PROCESSING', processing_started_at = CURRENT_TIMESTAMP,
         processing_attempts = $2, processing_error_code = NULL, processing_error_message = NULL
     WHERE id = $1 AND deleted_at IS NULL`,
    [document.id, job.attempt_count]
  );
  await AuditLogService.record({
    action: 'DOCUMENT_PROCESSING_STARTED', entityType: 'CASE_DOCUMENT', entityId: document.id,
    caseId: document.case_id, documentId: document.id, lawFirmId: document.case_law_firm_id,
    metadata: { jobId: job.id, attemptNumber: job.attempt_count },
  });

  let metadata;
  try {
    metadata = await storageProvider.getMetadata(document.storage_key);
  } catch (error) {
    if (error.code === 'STORAGE_NOT_FOUND') throw processingError('FILE_NOT_FOUND', 'Stored document file was not found.');
    throw processingError('STORAGE_ERROR', 'Stored document metadata could not be read.');
  }
  if (document.file_size_bytes && Number(document.file_size_bytes) !== metadata.size) {
    throw processingError('FILE_SIZE_MISMATCH', 'Stored document size validation failed.');
  }

  const filePath = storageProvider.resolvePath(document.storage_key);
  if (document.sha256_hash && await sha256File(filePath) !== document.sha256_hash) {
    throw processingError('HASH_MISMATCH', 'Stored document integrity validation failed.');
  }

  let buffer;
  try {
    buffer = await fs.promises.readFile(filePath);
  } catch (error) {
    throw processingError('STORAGE_ERROR', 'Stored document could not be read.');
  }

  let pages;
  try {
    pages = await extractDocumentPages({
      buffer,
      mimeType: document.detected_mime_type,
      context: {
        documentId: document.id,
        caseId: document.case_id,
        organizationId: document.case_law_firm_id,
        ownerUserId: document.case_owner_user_id,
      },
      ...(ocrProvider ? { ocrProvider } : {}),
    });
  } catch (error) {
    throw classifyParseError(error);
  }
  if (!pages.length) throw processingError('PARSER_ERROR', 'Document processing produced no pages.');

  const maxChars = Number.parseInt(process.env.DOCUMENT_MAX_EXTRACTED_TEXT_CHARS || '2000000', 10);
  const aggregateText = pages.map((page) => page.extractedText).join('\n\f\n').slice(0, maxChars);
  const usedOcr = pages.some((page) => page.textSource === 'OCR');
  const lowConfidencePages = pages
    .filter((page) => page.ocrConfidence !== null && page.ocrConfidence < Number(process.env.OCR_MIN_CONFIDENCE || 0.65))
    .map((page) => page.pageNumber);

  const client = await db.connect();
  let extraction;
  try {
    await client.query('BEGIN');
    const lease = await client.query(
      `SELECT 1 FROM document_processing_jobs
       WHERE id = $1 AND status = 'RUNNING' AND ($2::text IS NULL OR locked_by = $2)`,
      [job.id, lockedBy]
    );
    if (!lease.rows.length) {
      await client.query('ROLLBACK');
      return { skipped: true, reason: 'lease-lost' };
    }
    for (const page of pages) {
      await client.query(
        `INSERT INTO document_pages (
           document_id, case_id, page_number, extracted_text, text_source,
           ocr_confidence, width, height, metadata
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
         ON CONFLICT (document_id, page_number)
         DO UPDATE SET extracted_text = EXCLUDED.extracted_text, text_source = EXCLUDED.text_source,
           ocr_confidence = EXCLUDED.ocr_confidence, width = EXCLUDED.width,
           height = EXCLUDED.height, metadata = EXCLUDED.metadata, updated_at = CURRENT_TIMESTAMP`,
        [document.id, document.case_id, page.pageNumber, page.extractedText, page.textSource,
          page.ocrConfidence, page.width, page.height, JSON.stringify(page.metadata || {})]
      );
    }
    const update = await client.query(
      `UPDATE case_documents
       SET extracted_text = $2, page_count = $3, text_extracted = $4, ocr_required = $5,
           processing_status = 'COMPLETED', processing_completed_at = CURRENT_TIMESTAMP,
           processing_failed_at = NULL, processing_error_code = NULL, processing_error_message = NULL
       WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [document.id, aggregateText || null, pages.length, Boolean(aggregateText.trim()), usedOcr]
    );
    if (!update.rows.length) {
      await client.query('ROLLBACK');
      return { skipped: true, reason: 'deleted-during-processing' };
    }
    extraction = await queueExtraction({ db: client, document: { ...document, ...update.rows[0] } });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  await AuditLogService.record({
    action: 'DOCUMENT_PROCESSING_COMPLETED', entityType: 'CASE_DOCUMENT', entityId: document.id,
    caseId: document.case_id, documentId: document.id, lawFirmId: document.case_law_firm_id,
    metadata: {
      mimeType: document.detected_mime_type, pageCount: pages.length,
      textExtracted: Boolean(aggregateText.trim()), usedOcr, lowConfidencePages,
      extractionRunId: extraction.run.id,
    },
  });
  return {
    pageCount: pages.length,
    textExtracted: Boolean(aggregateText.trim()),
    ocrRequired: usedOcr,
    lowConfidencePages,
    extractionRunId: extraction.run.id,
  };
}

async function deleteDocumentFile(job, { db = pool, storageProvider = storage } = {}) {
  const document = await loadJobDocument(job, db);
  const removed = await storageProvider.delete(document.storage_key);
  await AuditLogService.record({
    action: 'DOCUMENT_PHYSICAL_DELETE_COMPLETED', entityType: 'CASE_DOCUMENT', entityId: document.id,
    caseId: document.case_id, documentId: document.id, lawFirmId: document.case_law_firm_id,
    metadata: { removed },
  });
  return { removed };
}

async function processJob(job, options = {}) {
  if (job.job_type === 'PROCESS_DOCUMENT') return processDocument(job, options);
  if (job.job_type === 'DELETE_DOCUMENT') return deleteDocumentFile(job, options);
  if (job.job_type === 'EXTRACT_MATTER_DATA') return processExtractionJob(job, options);
  throw processingError('UNSUPPORTED_JOB_TYPE', 'Document job type is not supported.');
}

module.exports = {
  classifyParseError,
  ensureExtractionQueued,
  hasStoredPages,
  loadJobDocument,
  processDocument,
  processJob,
  processingError,
};
