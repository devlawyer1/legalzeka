const { z } = require('zod');
const { pool } = require('../../config/db');
const { PracticeManagementService } = require('../practice/PracticeManagementService');

function contextError(message, code = 'AGENT_CONTEXT_ERROR', status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

class AgentContextBuilder {
  constructor({ db = pool, practiceService = new PracticeManagementService({ db }) } = {}) {
    this.db = db;
    this.practiceService = practiceService;
  }

  async matter(caseId, accessContext, permission = 'read') {
    return this.practiceService.matter(caseId, accessContext, permission, this.db);
  }

  async getMatterSummary(caseId, accessContext) {
    const matter = await this.matter(caseId, accessContext);
    return {
      caseId: matter.id,
      scopeType: matter.scope_type,
      organizationId: matter.law_firm_id || null,
      subject: matter.konu || null,
      caseNumber: matter.esas_no || null,
      court: matter.mahkeme || null,
      legalDomain: matter.legal_domain || null,
      status: matter.durum || null,
    };
  }

  async getVerifiedEvents(caseId, accessContext) {
    await this.matter(caseId, accessContext);
    const { rows } = await this.db.query(
      `SELECT id, title, description, event_date, date_precision, source_document_id, source_page
       FROM matter_events
       WHERE case_id = $1 AND verified_at IS NOT NULL
       ORDER BY event_date DESC NULLS LAST, verified_at DESC
       LIMIT 100`,
      [caseId]
    );
    return rows;
  }

  async getVerifiedParties(caseId, accessContext) {
    await this.matter(caseId, accessContext);
    const { rows } = await this.db.query(
      `SELECT id, name, party_type, role, source_document_id, source_page
       FROM matter_parties
       WHERE case_id = $1 AND verified_at IS NOT NULL
       ORDER BY verified_at DESC
       LIMIT 100`,
      [caseId]
    );
    return rows;
  }

  async assertDocument(caseId, documentId, accessContext) {
    await this.matter(caseId, accessContext);
    const { rows } = await this.db.query(
      `SELECT id, case_id, processing_status, detected_mime_type, page_count,
              original_filename, document_name, deleted_at
       FROM case_documents
       WHERE id = $1 AND case_id = $2 AND deleted_at IS NULL
       LIMIT 1`,
      [documentId, caseId]
    );
    if (!rows[0]) throw contextError('Document does not belong to this Matter.', 'DOCUMENT_CASE_MISMATCH', 404);
    return rows[0];
  }

  async getDocumentPages(caseId, documentId, accessContext, pageNumbers = []) {
    await this.assertDocument(caseId, documentId, accessContext);
    const requested = z.array(z.number().int().positive()).max(20).parse(pageNumbers || []);
    const params = [documentId];
    const pageFilter = requested.length ? 'AND page_number = ANY($2::int[])' : '';
    if (requested.length) params.push(requested);
    const { rows } = await this.db.query(
      `SELECT id, page_number, LEFT(extracted_text, 30000) AS extracted_text,
              text_source, ocr_confidence
       FROM document_pages
       WHERE document_id = $1 ${pageFilter}
       ORDER BY page_number
       LIMIT 20`,
      params
    );
    return rows;
  }

  async getDocumentStatus(caseId, documentId, accessContext) {
    const document = await this.assertDocument(caseId, documentId, accessContext);
    return {
      documentId: document.id,
      processingStatus: document.processing_status,
      pageCount: document.page_count,
      mimeType: document.detected_mime_type,
    };
  }

  async listDocumentSuggestions(caseId, documentId, accessContext) {
    await this.assertDocument(caseId, documentId, accessContext);
    const { rows } = await this.db.query(
      `SELECT id, suggestion_type, status, confidence, source_page,
              LEFT(display_value, 1000) AS value_summary
       FROM extraction_suggestions
       WHERE case_id = $1 AND document_id = $2
       ORDER BY created_at DESC
       LIMIT 100`,
      [caseId, documentId]
    );
    return rows;
  }

  async listClientVisibleUpdates(caseId, accessContext) {
    await this.matter(caseId, accessContext);
    const { rows } = await this.db.query(
      `SELECT id, title, LEFT(content, 5000) AS content, created_at
       FROM matter_updates
       WHERE case_id = $1 AND visibility = 'CLIENT_VISIBLE'
       ORDER BY created_at DESC
       LIMIT 50`,
      [caseId]
    );
    return rows;
  }

  async build(caseId, accessContext, scopes = [], input = {}) {
    if (!caseId) throw contextError('Matter selection is required.', 'MATTER_REQUIRED');
    const result = {};
    for (const scope of [...new Set(scopes)]) {
      if (scope === 'MATTER_SUMMARY') result.matter = await this.getMatterSummary(caseId, accessContext);
      else if (scope === 'VERIFIED_EVENTS') result.events = await this.getVerifiedEvents(caseId, accessContext);
      else if (scope === 'VERIFIED_PARTIES') result.parties = await this.getVerifiedParties(caseId, accessContext);
      else if (scope === 'DOCUMENT_PAGES') {
        if (!input.documentId) throw contextError('Document selection is required.', 'DOCUMENT_REQUIRED');
        result.documentPages = await this.getDocumentPages(caseId, input.documentId, accessContext, input.pageNumbers || []);
      } else if (scope === 'DOCUMENT_STATUS') {
        if (!input.documentId) throw contextError('Document selection is required.', 'DOCUMENT_REQUIRED');
        result.documentStatus = await this.getDocumentStatus(caseId, input.documentId, accessContext);
      } else if (scope === 'CLIENT_VISIBLE_UPDATES') {
        result.clientUpdates = await this.listClientVisibleUpdates(caseId, accessContext);
      }
    }
    return result;
  }
}

module.exports = { AgentContextBuilder, contextError };
