const crypto = require('crypto');
const { pool } = require('../config/db');
const CaseDocument = require('../models/CaseDocument');
const AuditLogService = require('../services/AuditLogService');
const jobs = require('../services/documentJobService');
const { storage } = require('../services/storage');
const { fileScanner } = require('../services/security');
const { validateTemporaryUpload } = require('../services/security/fileValidationService');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeDownloadName(value) {
  return String(value || 'belge').replace(/[\r\n\\/"]/g, '_').trim().slice(0, 180) || 'belge';
}

function isUuid(value) {
  return UUID_PATTERN.test(String(value || ''));
}

function publicJob(job) {
  if (!job) return null;
  return {
    id: job.id,
    type: job.job_type,
    status: job.status,
    attemptCount: job.attempt_count,
    maxAttempts: job.max_attempts,
    availableAt: job.available_at,
    startedAt: job.started_at,
    completedAt: job.completed_at,
    failedAt: job.failed_at,
    errorCode: job.error_code,
    errorMessage: job.error_message,
  };
}

function publicDocument(document) {
  return {
    id: document.id,
    caseId: document.case_id,
    originalFilename: document.original_filename,
    detectedMimeType: document.detected_mime_type,
    fileExtension: document.file_extension,
    fileSizeBytes: Number(document.file_size_bytes),
    sha256Hash: document.sha256_hash,
    processingStatus: document.processing_status,
    pageCount: document.page_count,
    textExtracted: document.text_extracted,
    ocrRequired: document.ocr_required,
  };
}

async function auditRejected(req, error) {
  await AuditLogService.record({
    req,
    action: 'DOCUMENT_UPLOAD_REJECTED',
    entityType: 'CASE_DOCUMENT',
    caseId: req.params.caseId,
    lawFirmId: req.matter?.law_firm_id,
    success: false,
    metadata: { code: error.code || 'UPLOAD_FAILED' },
  });
}

exports.uploadDocument = async (req, res, next) => {
  let storedKey = null;
  let client = null;
  try {
    if (!req.file) {
      const error = new Error('Lutfen bir dosya yukleyin.');
      error.status = 400;
      error.code = 'FILE_MISSING';
      throw error;
    }

    const metadata = await validateTemporaryUpload(req.file);
    const scan = await fileScanner.scan(req.file.path, metadata);
    if (!scan?.clean) {
      const error = new Error('Dosya guvenlik taramasindan gecemedi.');
      error.status = 422;
      error.code = 'MALWARE_DETECTED';
      throw error;
    }

    const safeFilename = storage.createStorageKey(metadata.extension);
    storedKey = storage.keyForFilename(safeFilename);
    await storage.store({ sourcePath: req.file.path, storageKey: storedKey });

    client = await pool.connect();
    await client.query('BEGIN');
    const duplicate = await client.query(
      `SELECT id FROM case_documents
       WHERE case_id = $1 AND sha256_hash = $2 AND deleted_at IS NULL
       LIMIT 1`,
      [req.params.caseId, metadata.sha256Hash]
    );
    const document = await CaseDocument.createQueued({
      db: client,
      caseId: req.params.caseId,
      firmId: req.matter.law_firm_id || null,
      originalFilename: metadata.originalFilename,
      safeFilename,
      storageKey: storedKey,
      uploadedBy: req.user.id,
      documentType: req.body.documentType || req.body.document_type || 'Genel',
      description: req.body.description || null,
      declaredMimeType: metadata.declaredMimeType,
      detectedMimeType: metadata.detectedMimeType,
      fileExtension: metadata.extension,
      fileSizeBytes: metadata.fileSizeBytes,
      sha256Hash: metadata.sha256Hash,
    });
    const queueJob = await jobs.enqueue({
      db: client,
      document: {
        ...document,
        scope_type: req.matter.scope_type,
        owner_user_id: req.matter.owner_user_id,
        law_firm_id: req.matter.law_firm_id,
      },
    });
    await client.query('COMMIT');

    const warnings = duplicate.rows.length
      ? [{ code: 'DUPLICATE_CONTENT', documentId: duplicate.rows[0].id }]
      : [];
    await AuditLogService.record({
      req,
      action: 'DOCUMENT_UPLOADED',
      entityType: 'CASE_DOCUMENT',
      entityId: document.id,
      caseId: document.case_id,
      documentId: document.id,
      lawFirmId: req.matter.law_firm_id,
      metadata: { mimeType: metadata.detectedMimeType, fileSizeBytes: metadata.fileSizeBytes, scanner: scan.provider, warnings },
    });
    await AuditLogService.record({
      req,
      action: 'DOCUMENT_QUEUED',
      entityType: 'CASE_DOCUMENT',
      entityId: document.id,
      caseId: document.case_id,
      documentId: document.id,
      lawFirmId: req.matter.law_firm_id,
      metadata: { jobId: queueJob.id },
    });
    return res.status(202).json({
      success: true,
      data: document,
      document: publicDocument(document),
      job: publicJob(queueJob),
      warnings,
    });
  } catch (error) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch (_) {}
    }
    if (storedKey) {
      try { await storage.delete(storedKey); } catch (_) {}
    }
    await auditRejected(req, error);
    return next(error);
  } finally {
    if (client) client.release();
    if (req.file?.path) {
      try { await storage.deleteTemporary(req.file.path); } catch (_) {}
    }
  }
};

exports.getDocuments = async (req, res, next) => {
  try {
    const documents = await CaseDocument.findByCaseIdAccessible(req.params.caseId, req.accessContext);
    await AuditLogService.record({
      req,
      action: 'DOCUMENT_LISTED',
      entityType: 'CASE_DOCUMENT',
      caseId: req.params.caseId,
      lawFirmId: req.matter.law_firm_id,
      metadata: { count: documents.length },
    });
    res.status(200).json({ success: true, data: documents });
  } catch (error) {
    next(error);
  }
};

exports.getDocument = async (req, res, next) => {
  try {
    if (!isUuid(req.params.documentId)) return res.status(404).json({ success: false, message: 'Belge bulunamadi.' });
    const document = await CaseDocument.findAccessibleDocument(
      req.params.documentId, req.params.caseId, req.accessContext, 'read'
    );
    if (!document) return res.status(404).json({ success: false, message: 'Belge bulunamadi.' });
    res.json({ success: true, data: document, document: publicDocument(document), job: publicJob(document.latest_job) });
  } catch (error) {
    next(error);
  }
};

exports.getDocumentStatus = async (req, res, next) => {
  try {
    if (!isUuid(req.params.documentId)) return res.status(404).json({ success: false, message: 'Belge bulunamadi.' });
    const document = await CaseDocument.findAccessibleDocument(
      req.params.documentId, req.params.caseId, req.accessContext, 'read'
    );
    if (!document) return res.status(404).json({ success: false, message: 'Belge bulunamadi.' });
    res.json({
      success: true,
      data: {
        documentId: document.id,
        processingStatus: document.processing_status,
        processingAttempts: document.processing_attempts,
        status: document.processing_status,
        attempts: document.processing_attempts,
        pageCount: document.page_count,
        textExtracted: document.text_extracted,
        ocrRequired: document.ocr_required,
        errorCode: document.processing_error_code,
        errorMessage: document.processing_error_message,
        job: publicJob(document.latest_job),
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.retryDocument = async (req, res, next) => {
  try {
    const documentId = req.params.documentId || req.params.docId;
    if (!isUuid(documentId)) return res.status(404).json({ success: false, message: 'Belge bulunamadi.' });
    const document = await CaseDocument.findAccessibleDocument(
      documentId, req.params.caseId, req.accessContext, 'write'
    );
    if (!document) return res.status(404).json({ success: false, message: 'Belge bulunamadi.' });
    const previous = document.latest_job || await jobs.latestForDocument(document.id);
    if (previous && jobs.ACTIVE_STATUSES.includes(previous.status)) {
      return res.status(409).json({ success: false, message: 'Belge zaten kuyrukta veya isleniyor.', job: publicJob(previous) });
    }
    if (document.processing_status !== 'FAILED' && previous?.status !== 'DEAD_LETTER' && previous?.status !== 'FAILED') {
      return res.status(409).json({ success: false, message: 'Yalnizca basarisiz belge islemleri yeniden denenebilir.' });
    }

    const client = await pool.connect();
    let queueJob;
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE case_documents SET processing_status = 'QUEUED', processing_error_code = NULL,
         processing_error_message = NULL, processing_failed_at = NULL WHERE id = $1`,
        [document.id]
      );
      queueJob = await jobs.retry(document, previous, { db: client });
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    await AuditLogService.record({
      req, action: 'DOCUMENT_RETRY_REQUESTED', entityType: 'CASE_DOCUMENT', entityId: document.id,
      caseId: document.case_id, documentId: document.id, lawFirmId: document.law_firm_id,
      metadata: { jobId: queueJob.id, previousJobId: previous?.id || null },
    });
    res.status(202).json({ success: true, job: publicJob(queueJob) });
  } catch (error) {
    next(error);
  }
};

exports.analyzeDocument = exports.retryDocument;

exports.downloadDocument = async (req, res, next) => {
  try {
    const { caseId, documentId } = req.params;
    if (!isUuid(documentId)) return res.status(404).json({ success: false, message: 'Belge bulunamadi.' });
    const document = await CaseDocument.findAccessibleDocument(documentId, caseId, req.accessContext, 'read');
    if (!document) return res.status(404).json({ success: false, message: 'Belge bulunamadi.' });
    let file;
    try {
      file = await storage.openReadStream(document.storage_key || document.file_url);
    } catch (error) {
      return res.status(404).json({ success: false, message: 'Belge dosyasi bulunamadi.' });
    }
    await AuditLogService.record({
      req, action: 'DOCUMENT_DOWNLOADED', entityType: 'CASE_DOCUMENT', entityId: documentId,
      caseId, documentId, lawFirmId: req.matter.law_firm_id,
    });
    res.attachment(safeDownloadName(document.original_filename || document.document_name));
    res.setHeader('Content-Type', document.detected_mime_type || 'application/octet-stream');
    res.setHeader('Content-Length', String(file.size));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    file.stream.on('error', (error) => (res.headersSent ? res.destroy(error) : next(error)));
    file.stream.pipe(res);
  } catch (error) {
    next(error);
  }
};

exports.deleteDocument = async (req, res, next) => {
  try {
    const documentId = req.params.documentId || req.params.docId;
    if (!isUuid(documentId)) return res.status(404).json({ success: false, message: 'Belge bulunamadi.' });
    const document = await CaseDocument.findAccessibleDocument(
      documentId, req.params.caseId, req.accessContext, 'write'
    );
    if (!document) return res.status(404).json({ success: false, message: 'Belge bulunamadi.' });

    const client = await pool.connect();
    let deleteJob;
    try {
      await client.query('BEGIN');
      const deleted = await CaseDocument.markSoftDeleted({ db: client, id: document.id, caseId: document.case_id });
      await jobs.cancelActive(document.id, { db: client });
      await client.query(
        `UPDATE extraction_runs SET status = 'CANCELLED'
         WHERE document_id = $1 AND status IN ('QUEUED', 'RUNNING')`,
        [document.id]
      );
      deleteJob = await jobs.enqueue({
        db: client,
        document: { ...deleted, scope_type: document.scope_type, owner_user_id: document.owner_user_id, law_firm_id: document.law_firm_id },
        jobType: 'DELETE_DOCUMENT',
        idempotencyKey: `DELETE_DOCUMENT:${document.id}:${crypto.randomUUID()}`,
      });
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    await AuditLogService.record({
      req, action: 'DOCUMENT_DELETED', entityType: 'CASE_DOCUMENT', entityId: document.id,
      caseId: document.case_id, documentId: document.id, lawFirmId: document.law_firm_id,
      metadata: { jobId: deleteJob.id },
    });
    res.status(202).json({ success: true, message: 'Belge silme kuyruguna alindi.', job: publicJob(deleteJob) });
  } catch (error) {
    next(error);
  }
};
