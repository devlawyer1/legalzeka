const { pool } = require('../../config/db');
const { DraftVersionService, DEFAULT_SECTIONS, normalizeSections } = require('./DraftVersionService');

function httpError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function organizationIds(context, permission = 'read') {
  if (!context) return [];
  return (context.memberships || [])
    .filter((membership) => permission === 'write' ? membership.canWrite : membership.canRead)
    .map((membership) => membership.lawFirmId);
}

function draftAccessPredicate(context, values, alias = 'draft', permission = 'read') {
  if (context?.isSystemAdmin) return 'TRUE';
  values.push(context?.userId || null);
  const userParam = values.length;
  values.push(organizationIds(context, permission));
  const organizationsParam = values.length;
  return `(
    (${alias}.organization_id IS NULL AND ${alias}.owner_user_id = $${userParam}::uuid)
    OR ${alias}.organization_id = ANY($${organizationsParam}::uuid[])
  )`;
}

function matterAccessPredicate(context, values, alias = 'matter', permission = 'read') {
  if (context?.isSystemAdmin) return 'TRUE';
  values.push(context?.userId || null);
  const userParam = values.length;
  values.push(organizationIds(context, permission));
  const organizationsParam = values.length;
  return `(
    (${alias}.scope_type = 'PERSONAL' AND ${alias}.owner_user_id = $${userParam}::uuid)
    OR (${alias}.scope_type = 'ORGANIZATION' AND ${alias}.law_firm_id = ANY($${organizationsParam}::uuid[]))
  )`;
}

function applyTemplateVariables(content, values) {
  const variables = [...new Set(String(content || '').match(/{{[a-z_]+}}/gi) || [])];
  const missing = [];
  let output = String(content || '');
  for (const token of variables) {
    const key = token.slice(2, -2).toLowerCase();
    const value = values[key];
    if (value === null || value === undefined || String(value).trim() === '') {
      missing.push(token);
      continue;
    }
    output = output.split(token).join(String(value));
  }
  return { content: output, missing };
}

class DraftService {
  constructor({ db = pool, versionService = null } = {}) {
    this.db = db;
    this.versionService = versionService || new DraftVersionService({ db });
  }

  async findMatter(caseId, accessContext, permission = 'read', { db = this.db } = {}) {
    const values = [caseId];
    const access = matterAccessPredicate(accessContext, values, 'matter', permission);
    const { rows } = await db.query(
      `SELECT matter.* FROM cases matter
       WHERE matter.id = $1 AND matter.is_active = TRUE AND ${access}
       LIMIT 1`,
      values
    );
    return rows[0] || null;
  }

  async findAccessibleDraft(draftId, accessContext, permission = 'read', { db = this.db, includeDeleted = false } = {}) {
    const values = [draftId];
    const access = draftAccessPredicate(accessContext, values, 'draft', permission);
    const { rows } = await db.query(
      `SELECT draft.*, matter.konu AS case_title, matter.esas_no, matter.mahkeme,
              matter.legal_domain, matter.scope_type
       FROM legal_drafts draft
       JOIN cases matter ON matter.id = draft.case_id
       WHERE draft.id = $1
         ${includeDeleted ? '' : 'AND draft.deleted_at IS NULL'}
         AND ${access}
       LIMIT 1`,
      values
    );
    return rows[0] || null;
  }

  async loadMatterContext(matter, { db = this.db } = {}) {
    const parties = await db.query(
        `SELECT id, name, party_type, role FROM matter_parties
         WHERE case_id = $1 ORDER BY verified_at, id`,
        [matter.id]
      );
    const events = await db.query(
        `SELECT id, title, description, event_date, date_precision FROM matter_events
         WHERE case_id = $1 ORDER BY event_date NULLS LAST, verified_at, id`,
        [matter.id]
      );
    const evidence = await db.query(
        `SELECT id, title, description, evidence_type, document_id, source_page, verified
         FROM matter_evidence WHERE case_id = $1 ORDER BY created_at, id`,
        [matter.id]
      );
    const documents = await db.query(
        `SELECT id, original_filename, document_name, processing_status, page_count
         FROM case_documents WHERE case_id = $1 AND deleted_at IS NULL ORDER BY created_at`,
        [matter.id]
      );
    const research = await db.query(
        `SELECT session.id, session.title, answer.summary
         FROM legal_research_sessions session
         LEFT JOIN LATERAL (
           SELECT summary FROM legal_research_answers
           WHERE session_id = session.id AND status IN ('COMPLETED', 'INSUFFICIENT')
           ORDER BY created_at DESC LIMIT 1
         ) answer ON TRUE
         WHERE session.case_id = $1 AND session.deleted_at IS NULL
         ORDER BY session.updated_at DESC LIMIT 10`,
        [matter.id]
      );
    return {
      matter,
      parties: parties.rows,
      events: events.rows,
      evidence: evidence.rows,
      documents: documents.rows,
      research: research.rows,
    };
  }

  async findAccessibleTemplate(templateId, accessContext, { db = this.db } = {}) {
    if (!templateId) return null;
    const { rows } = await db.query(
      `SELECT * FROM firm_templates template
       WHERE template.id = $1 AND template.deleted_at IS NULL
         AND (
           template.scope_type = 'SYSTEM'
           OR (template.scope_type = 'PERSONAL' AND template.owner_user_id = $2)
           OR (template.scope_type = 'ORGANIZATION' AND template.organization_id = ANY($3::uuid[]))
         )
       LIMIT 1`,
      [templateId, accessContext.userId, organizationIds(accessContext)]
    );
    return rows[0] || null;
  }

  async listTemplates(accessContext, { caseId = null } = {}) {
    if (caseId && !(await this.findMatter(caseId, accessContext))) {
      throw httpError(404, 'Dava bulunamadı.', 'MATTER_NOT_FOUND');
    }
    const { rows } = await this.db.query(
      `SELECT id, title, content, template_type, tags, scope_type,
              organization_id, owner_user_id, is_read_only, variables
       FROM firm_templates template
       WHERE template.deleted_at IS NULL
         AND (
           template.scope_type = 'SYSTEM'
           OR (template.scope_type = 'PERSONAL' AND template.owner_user_id = $1)
           OR (template.scope_type = 'ORGANIZATION' AND template.organization_id = ANY($2::uuid[]))
         )
       ORDER BY CASE template.scope_type WHEN 'SYSTEM' THEN 1 WHEN 'ORGANIZATION' THEN 2 ELSE 3 END,
                template.title`,
      [accessContext.userId, organizationIds(accessContext)]
    );
    return rows;
  }

  async createTemplate(input, accessContext) {
    const scope = input.scopeType || 'PERSONAL';
    let organizationId = null;
    let ownerUserId = null;
    let readOnly = false;
    if (scope === 'SYSTEM') {
      if (!accessContext.isSystemAdmin) throw httpError(403, 'Sistem şablonu oluşturma yetkisi yok.', 'SYSTEM_TEMPLATE_FORBIDDEN');
      readOnly = true;
    } else if (scope === 'ORGANIZATION') {
      organizationId = input.organizationId;
      if (!organizationIds(accessContext, 'write').includes(organizationId)) {
        throw httpError(403, 'Büro şablonu oluşturma yetkisi yok.', 'TEMPLATE_ORGANIZATION_FORBIDDEN');
      }
    } else {
      ownerUserId = accessContext.userId;
    }
    const variables = [...new Set(String(input.content || '').match(/{{[a-z_]+}}/gi) || [])];
    const { rows } = await this.db.query(
      `INSERT INTO firm_templates (
         id, firm_id, organization_id, owner_user_id, scope_type, is_read_only,
         title, content, template_type, tags, variables, created_by
       ) VALUES (
         gen_random_uuid(), $1, $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10
       ) RETURNING *`,
      [
        organizationId, ownerUserId, scope, readOnly, input.title, input.content,
        input.templateType || null, input.tags || [], JSON.stringify(variables), accessContext.userId,
      ]
    );
    return rows[0];
  }

  async updateTemplate(templateId, input, accessContext) {
    const current = await this.findAccessibleTemplate(templateId, accessContext);
    if (!current) throw httpError(404, 'Şablon bulunamadı.', 'TEMPLATE_NOT_FOUND');
    const allowed = current.scope_type === 'PERSONAL'
      ? current.owner_user_id === accessContext.userId
      : current.scope_type === 'ORGANIZATION'
        ? organizationIds(accessContext, 'write').includes(current.organization_id)
        : accessContext.isSystemAdmin;
    if (!allowed) throw httpError(403, 'Şablonu değiştirme yetkisi yok.', 'TEMPLATE_WRITE_FORBIDDEN');
    const content = input.content ?? current.content;
    const variables = [...new Set(String(content).match(/{{[a-z_]+}}/gi) || [])];
    const { rows } = await this.db.query(
      `UPDATE firm_templates SET
         title = COALESCE($2, title), content = COALESCE($3, content),
         template_type = COALESCE($4, template_type), tags = COALESCE($5, tags),
         variables = $6::jsonb, updated_at = now()
       WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [templateId, input.title || null, input.content ?? null, input.templateType || null, input.tags || null, JSON.stringify(variables)]
    );
    return rows[0];
  }

  async deleteTemplate(templateId, accessContext) {
    const current = await this.findAccessibleTemplate(templateId, accessContext);
    if (!current) throw httpError(404, 'Şablon bulunamadı.', 'TEMPLATE_NOT_FOUND');
    const allowed = current.scope_type === 'PERSONAL'
      ? current.owner_user_id === accessContext.userId
      : current.scope_type === 'ORGANIZATION'
        ? organizationIds(accessContext, 'write').includes(current.organization_id)
        : accessContext.isSystemAdmin;
    if (!allowed) throw httpError(403, 'Şablonu silme yetkisi yok.', 'TEMPLATE_WRITE_FORBIDDEN');
    await this.db.query('UPDATE firm_templates SET deleted_at = COALESCE(deleted_at, now()), updated_at = now() WHERE id = $1', [templateId]);
    return true;
  }

  buildInitialSections(context, { importedText = '', template = null } = {}) {
    const { matter, parties, events, evidence, documents } = context;
    const claimant = parties.find((party) => /davac|başvuran|alacaklı/i.test(party.role))?.name || matter.taraf_davaci;
    const defendant = parties.find((party) => /daval|karşı|borçlu/i.test(party.role))?.name || matter.taraf_davali;
    const values = {
      court_name: matter.mahkeme,
      case_number: matter.esas_no,
      plaintiff_name: claimant,
      defendant_name: defendant,
      subject: matter.konu,
      event_date: events[0]?.event_date ? String(events[0].event_date).slice(0, 10) : null,
      claim_amount: matter.metadata?.claimAmount || null,
    };
    const eventText = events.map((event) => {
      const date = event.event_date ? `${String(event.event_date).slice(0, 10)} - ` : '';
      return `${date}${event.title}${event.description ? `: ${event.description}` : ''}`;
    }).join('\n');
    const partyText = parties.length
      ? parties.map((party) => `${party.role}: ${party.name}`).join('\n')
      : [`Davacı: ${claimant || '{{plaintiff_name}}'}`, `Davalı: ${defendant || '{{defendant_name}}'}`].join('\n');
    const templateResult = template ? applyTemplateVariables(template.content, values) : { content: '', missing: [] };
    const baseContent = importedText || templateResult.content || eventText;
    const contentByKey = {
      COURT: matter.mahkeme || '{{court_name}}',
      PARTIES: partyText,
      SUBJECT: matter.konu || '{{subject}}',
      FACTS: baseContent,
      LEGAL_GROUNDS: '',
      EVIDENCE: evidence.map((item) => item.title).join('\n'),
      REQUEST: '',
      ATTACHMENTS: documents.map((document) => document.original_filename || document.document_name).join('\n'),
    };
    return {
      sections: DEFAULT_SECTIONS.map(([sectionKey, title], index) => ({
        sectionKey,
        title,
        content: contentByKey[sectionKey] || '',
        sortOrder: index,
      })),
      missingTemplateVariables: templateResult.missing,
    };
  }

  async importDocumentText(documentId, caseId, { db = this.db } = {}) {
    if (!documentId) return '';
    const document = await db.query(
      `SELECT id FROM case_documents
       WHERE id = $1 AND case_id = $2 AND deleted_at IS NULL LIMIT 1`,
      [documentId, caseId]
    );
    if (!document.rows[0]) throw httpError(404, 'Belge bulunamadı.', 'DOCUMENT_NOT_FOUND');
    const pages = await db.query(
      `SELECT extracted_text FROM document_pages
       WHERE document_id = $1 ORDER BY page_number`,
      [documentId]
    );
    return pages.rows.map((page) => page.extracted_text).join('\n\n').slice(0, 400000);
  }

  async create(input, accessContext, { db = null } = {}) {
    const ownsTransaction = !db;
    const client = db || await this.db.connect();
    try {
      if (ownsTransaction) await client.query('BEGIN');
      const matter = await this.findMatter(input.caseId, accessContext, 'write', { db: client });
      if (!matter) throw httpError(404, 'Dava bulunamadı.', 'MATTER_NOT_FOUND');
      const template = input.templateId
        ? await this.findAccessibleTemplate(input.templateId, accessContext, { db: client })
        : null;
      if (input.templateId && !template) throw httpError(404, 'Şablon bulunamadı.', 'TEMPLATE_NOT_FOUND');
      const context = await this.loadMatterContext(matter, { db: client });
      const importedText = await this.importDocumentText(input.documentId, matter.id, { db: client });
      const initial = this.buildInitialSections(context, { importedText, template });
      const sections = input.sections?.length ? normalizeSections(input.sections) : initial.sections;
      const draft = await client.query(
        `INSERT INTO legal_drafts (
           case_id, organization_id, owner_user_id, title, draft_type, status,
           template_id, metadata, created_by
         ) VALUES ($1, $2, $3, $4, $5, 'DRAFT', $6, $7, $8)
         RETURNING *`,
        [
          matter.id,
          matter.scope_type === 'ORGANIZATION' ? matter.law_firm_id : null,
          matter.scope_type === 'PERSONAL' ? matter.owner_user_id : null,
          String(input.title || `${matter.konu || 'Dosya'} Dilekçe Taslağı`).slice(0, 300),
          input.draftType || 'PETITION',
          template?.id || null,
          { missingTemplateVariables: initial.missingTemplateVariables, importedDocumentId: input.documentId || null },
          accessContext.userId,
        ]
      );
      const version = await this.versionService.createVersion({
        draftId: draft.rows[0].id,
        sections,
        createdBy: accessContext.userId,
        changeSummary: input.documentId ? 'Belgeden içe aktarılan ilk versiyon' : 'İlk taslak',
        db: client,
      });
      if (ownsTransaction) await client.query('COMMIT');
      return { ...draft.rows[0], current_version_id: version.id, sections: version.sections };
    } catch (error) {
      if (ownsTransaction) await client.query('ROLLBACK');
      throw error;
    } finally {
      if (ownsTransaction) client.release();
    }
  }

  async list({ accessContext, caseId = null, limit = 100 }) {
    const values = [];
    const access = draftAccessPredicate(accessContext, values);
    const filters = ['draft.deleted_at IS NULL', access];
    if (caseId) {
      values.push(caseId);
      filters.push(`draft.case_id = $${values.length}`);
    }
    values.push(Math.max(1, Math.min(Number(limit) || 100, 200)));
    const { rows } = await this.db.query(
      `SELECT draft.*, version.version_number, version.change_summary,
              matter.konu AS case_title, matter.esas_no, template.title AS template_title
       FROM legal_drafts draft
       JOIN cases matter ON matter.id = draft.case_id
       LEFT JOIN legal_draft_versions version ON version.id = draft.current_version_id
       LEFT JOIN firm_templates template ON template.id = draft.template_id
       WHERE ${filters.join(' AND ')}
       ORDER BY draft.updated_at DESC
       LIMIT $${values.length}`,
      values
    );
    return rows;
  }

  async getDetail(draftId, accessContext) {
    const draft = await this.findAccessibleDraft(draftId, accessContext);
    if (!draft) throw httpError(404, 'Taslak bulunamadı.', 'DRAFT_NOT_FOUND');
    const [sections, versions, citations, suggestions] = await Promise.all([
      this.versionService.getSections(draft.current_version_id),
      this.versionService.list(draft.id),
      this.db.query(
        `SELECT citation.*, source.source_type, source.title AS source_title,
                source.court, source.chamber, source.case_number, source.decision_number,
                source.decision_date, source.source_url, source.effective_from, source.effective_to
         FROM draft_citations citation
         JOIN legal_sources source ON source.id = citation.source_id
         WHERE citation.draft_id = $1 AND citation.draft_version_id = $2
         ORDER BY citation.citation_order`,
        [draft.id, draft.current_version_id]
      ),
      this.db.query(
        `SELECT * FROM draft_ai_suggestions
         WHERE draft_id = $1 AND draft_version_id = $2
         ORDER BY status = 'PENDING' DESC, created_at DESC`,
        [draft.id, draft.current_version_id]
      ),
    ]);
    return { ...draft, sections, versions, citations: citations.rows, suggestions: suggestions.rows };
  }

  async update(draftId, input, accessContext) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const draft = await this.findAccessibleDraft(draftId, accessContext, 'write', { db: client });
      if (!draft) throw httpError(404, 'Taslak bulunamadı.', 'DRAFT_NOT_FOUND');
      await client.query('SELECT id FROM legal_drafts WHERE id = $1 FOR UPDATE', [draftId]);
      if (input.title !== undefined || input.status !== undefined) {
        await client.query(
          `UPDATE legal_drafts SET
             title = coalesce($2, title), status = coalesce($3, status), updated_at = now()
           WHERE id = $1`,
          [draftId, input.title || null, input.status || null]
        );
      }
      let version = null;
      if (input.sections) {
        version = await this.versionService.createVersion({
          draftId,
          sections: input.sections,
          createdBy: accessContext.userId,
          changeSummary: input.changeSummary || 'Kullanıcı düzenlemesi',
          copyCitationsFromVersionId: draft.current_version_id,
          db: client,
        });
      }
      await client.query('COMMIT');
      return version || this.findAccessibleDraft(draftId, accessContext);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async softDelete(draftId, accessContext) {
    const draft = await this.findAccessibleDraft(draftId, accessContext, 'write');
    if (!draft) return false;
    await this.db.query(
      `UPDATE legal_drafts SET deleted_at = coalesce(deleted_at, now()),
         status = 'ARCHIVED', updated_at = now() WHERE id = $1`,
      [draftId]
    );
    return true;
  }

  async startAiRun(draft, operation, accessContext) {
    const { rows } = await this.db.query(
      `INSERT INTO draft_ai_runs (
         draft_id, case_id, organization_id, owner_user_id, operation, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [draft.id, draft.case_id, draft.organization_id, draft.owner_user_id, operation, accessContext.userId]
    );
    return rows[0];
  }

  async finishAiRun(runId, { usage = {}, durationMs = 0, status = 'COMPLETED', errorCode = null } = {}) {
    const { rows } = await this.db.query(
      `UPDATE draft_ai_runs SET status = $2, provider = $3, model = $4,
         input_tokens = $5, output_tokens = $6, estimated_cost = $7,
         duration_ms = $8, safe_error_code = $9, completed_at = now()
       WHERE id = $1 RETURNING *`,
      [
        runId, status, usage.provider || null, usage.model || null,
        usage.inputTokens || 0, usage.outputTokens || 0, usage.estimatedCost || 0,
        Math.max(0, Math.round(durationMs || 0)), errorCode,
      ]
    );
    return rows[0];
  }
}

module.exports = {
  DraftService,
  applyTemplateVariables,
  draftAccessPredicate,
  httpError,
  matterAccessPredicate,
  organizationIds,
};
