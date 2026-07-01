const { pool } = require('../../config/db');
const AuditLogService = require('../AuditLogService');
const { EducationAccessService, educationError } = require('./EducationAccessService');
const { EducationAiService } = require('./EducationAiService');
const { EntitlementService } = require('./EntitlementService');
const { CitationVerifier } = require('../legalResearch/CitationVerifier');
const { LegalSearchRepository } = require('../legalSearch/legalSearchRepository');
const { assertNoInventedIdentifiers } = require('./GroundingPolicy');

const FIELDS = Object.freeze(['facts','legalIssue','holding','reasoning','dissent','significance']);
const REQUIRED_FIELDS = Object.freeze(['facts','legalIssue','holding','reasoning','significance']);

function contentOf(brief, patch = {}) {
  return Object.fromEntries(FIELDS.map((field) => {
    const dbField = field === 'legalIssue' ? 'legal_issue' : field;
    return [field, Object.hasOwn(patch, field) ? patch[field] : brief[dbField]];
  }));
}

class CaseBriefService {
  constructor({ db = pool, access = new EducationAccessService({ db }), ai = new EducationAiService({ db }), entitlements = new EntitlementService({ db }), citationVerifier = new CitationVerifier({ repository: new LegalSearchRepository({ db }) }) } = {}) {
    this.db = db; this.access = access; this.ai = ai; this.entitlements = entitlements; this.citationVerifier = citationVerifier;
  }

  async create(workspaceId, input, context, { req } = {}) {
    await this.entitlements.require(context, 'EDU_CASE_BRIEF');
    await this.access.getWorkspace(workspaceId, context, 'write');
    const source = await this.access.getSource(input.legalSourceId, input.chunkId || null, context);
    if (!['COURT_DECISION','CONSTITUTIONAL_COURT_DECISION','ADMINISTRATIVE_DECISION','ECHR_DECISION'].includes(source.source_type)) {
      throw educationError('Case briefs require a court decision source.', 400, 'CASE_BRIEF_DECISION_REQUIRED');
    }
    if (input.caseNumber && input.caseNumber !== source.case_number) throw educationError('Case number must come from source metadata.', 400, 'SOURCE_METADATA_MISMATCH');
    if (input.decisionNumber && input.decisionNumber !== source.decision_number) throw educationError('Decision number must come from source metadata.', 400, 'SOURCE_METADATA_MISMATCH');
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const brief = await client.query(
        `INSERT INTO case_briefs (
           workspace_id,legal_source_id,title,court,case_number,decision_number,decision_date,created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [workspaceId, source.id, input.title || source.title, source.court, source.case_number,
          source.decision_number, source.decision_date, context.userId]
      );
      const version = await client.query(
        `INSERT INTO case_brief_versions (brief_id,version_number,content,citations,verification_status,created_by)
         VALUES ($1,1,$2::jsonb,'[]'::jsonb,'DRAFT',$3) RETURNING *`,
        [brief.rows[0].id, JSON.stringify(contentOf(brief.rows[0])), context.userId]
      );
      await client.query('UPDATE case_briefs SET current_version_id=$2 WHERE id=$1', [brief.rows[0].id, version.rows[0].id]);
      await AuditLogService.record({ db: client, strict: true, req: req || { user: { id: context.userId } }, action: 'CASE_BRIEF_CREATED', entityType: 'CASE_BRIEF', entityId: brief.rows[0].id, metadata: { workspaceId, sourceId: source.id } });
      await client.query('COMMIT');
      return { ...brief.rows[0], current_version_id: version.rows[0].id };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async get(briefId, context) {
    const { rows } = await this.db.query('SELECT * FROM case_briefs WHERE id=$1', [briefId]);
    if (!rows[0]) throw educationError('Case brief not found.', 404, 'CASE_BRIEF_NOT_FOUND');
    await this.access.getWorkspace(rows[0].workspace_id, context);
    return rows[0];
  }

  async generate(briefId, context, { req } = {}) {
    const brief = await this.get(briefId, context);
    await this.access.getWorkspace(brief.workspace_id, context, 'write');
    const source = await this.access.getSource(brief.legal_source_id, null, context);
    const chunks = await this.db.query(
      'SELECT id,heading,chunk_type,content FROM legal_source_chunks WHERE source_id=$1 ORDER BY chunk_index LIMIT 30', [source.id]
    );
    const result = await this.ai.run({
      operation: 'CASE_BRIEF_GENERATE', workspaceId: brief.workspace_id, userId: context.userId,
      systemPrompt: 'Draft a case brief preview. Return {facts,legalIssue,holding,reasoning,dissent,significance,citations:[{field,sourceId,chunkId,excerpt}]}. Every non-null field needs a citation.',
      payload: {
        source: { sourceId: source.id, title: source.title, court: source.court, caseNumber: source.case_number, decisionNumber: source.decision_number, decisionDate: source.decision_date },
        chunks: chunks.rows.map((item) => ({ chunkId: item.id, heading: item.heading, type: item.chunk_type, content: item.content })),
      },
    });
    const output = result.output;
    for (const key of ['court','caseNumber','decisionNumber','decisionDate']) {
      const expected = { court: source.court, caseNumber: source.case_number, decisionNumber: source.decision_number, decisionDate: source.decision_date }[key];
      if (Object.hasOwn(output, key) && String(output[key] || '') !== String(expected || '')) {
        throw educationError('AI attempted to replace source metadata.', 422, 'AI_SOURCE_METADATA_MISMATCH');
      }
    }
    const citations = Array.isArray(output.citations) ? output.citations : [];
    assertNoInventedIdentifiers(FIELDS.map((field) => output[field]).join('\n'), [source]);
    for (const citation of citations) {
      if (!FIELDS.includes(citation.field) || citation.sourceId !== source.id) throw educationError('AI citation is outside the selected source.', 422, 'AI_SOURCE_OUT_OF_SCOPE');
      await this.access.assertChunk(source.id, citation.chunkId, citation.excerpt, context);
      const verification = await this.citationVerifier.verify({
        claimKey: citation.field,
        claimText: String(output[citation.field] || ''),
        sourceId: source.id,
        supportType: 'SUPPORTS',
        candidate: { chunkId: citation.chunkId, excerpt: citation.excerpt },
        accessScope: { userId: context.userId, organizationIds: context.scopes?.organizationIds || [] },
      });
      if (verification.verificationStatus === 'REJECTED') throw educationError(`Citation does not support ${citation.field}.`, 422, 'CASE_BRIEF_CITATION_REJECTED');
    }
    for (const field of REQUIRED_FIELDS) {
      if (output[field] && !citations.some((citation) => citation.field === field)) {
        throw educationError(`AI field ${field} is not cited.`, 422, 'CASE_BRIEF_CITATION_REQUIRED');
      }
    }
    await this.db.query(
      `UPDATE case_briefs SET pending_suggestion=$2::jsonb,verification_status='AI_SUGGESTED',updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
      [briefId, JSON.stringify({ ...Object.fromEntries(FIELDS.map((field) => [field, output[field] ?? null])), citations, aiUsageId: result.usage.id })]
    );
    await AuditLogService.record({ db: this.db, req: req || { user: { id: context.userId } }, action: 'CASE_BRIEF_GENERATED', entityType: 'CASE_BRIEF', entityId: briefId, metadata: { workspaceId: brief.workspace_id, citationCount: citations.length } });
    return { briefId, status: 'AI_SUGGESTED', suggestion: { ...output, aiUsageId: result.usage.id } };
  }

  async update(briefId, input, context) {
    const brief = await this.get(briefId, context);
    await this.access.getWorkspace(brief.workspace_id, context, 'write');
    const patch = input.acceptSuggestion ? (brief.pending_suggestion || {}) : input;
    const content = contentOf(brief, patch);
    const citations = input.citations || patch.citations || [];
    for (const citation of citations) {
      if (!FIELDS.includes(citation.field) || citation.sourceId !== brief.legal_source_id) throw educationError('Citation is outside brief source.', 400, 'CITATION_SOURCE_MISMATCH');
      await this.access.assertChunk(brief.legal_source_id, citation.chunkId, citation.excerpt, context);
      const verification = await this.citationVerifier.verify({
        claimKey: citation.field,
        claimText: String(content[citation.field] || ''), sourceId: brief.legal_source_id, supportType: 'SUPPORTS',
        candidate: { chunkId: citation.chunkId, excerpt: citation.excerpt },
        accessScope: { userId: context.userId, organizationIds: context.scopes?.organizationIds || [] },
      });
      if (verification.verificationStatus === 'REJECTED') throw educationError(`Citation does not support ${citation.field}.`, 422, 'CASE_BRIEF_CITATION_REJECTED');
    }
    const verified = REQUIRED_FIELDS.every((field) => Boolean(content[field]) && citations.some((citation) => citation.field === field));
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const next = (await client.query('SELECT coalesce(max(version_number),0)+1 AS value FROM case_brief_versions WHERE brief_id=$1', [briefId])).rows[0].value;
      const version = await client.query(
        `INSERT INTO case_brief_versions (brief_id,version_number,content,citations,verification_status,created_by)
         VALUES ($1,$2,$3::jsonb,$4::jsonb,$5,$6) RETURNING *`,
        [briefId, next, JSON.stringify(content), JSON.stringify(citations), verified ? 'VERIFIED' : 'DRAFT', context.userId]
      );
      await client.query('DELETE FROM case_brief_citations WHERE brief_id=$1', [briefId]);
      for (const citation of citations) {
        await client.query(
          `INSERT INTO case_brief_citations (brief_id,field_name,legal_source_id,chunk_id,excerpt)
           VALUES ($1,$2,$3,$4,$5)`, [briefId, citation.field, brief.legal_source_id, citation.chunkId, citation.excerpt]
        );
      }
      const updated = await client.query(
        `UPDATE case_briefs SET facts=$2,legal_issue=$3,holding=$4,reasoning=$5,dissent=$6,significance=$7,
           verification_status=$8,pending_suggestion=NULL,current_version_id=$9,updated_at=CURRENT_TIMESTAMP
         WHERE id=$1 RETURNING *`,
        [briefId, content.facts, content.legalIssue, content.holding, content.reasoning, content.dissent,
          content.significance, verified ? 'VERIFIED' : 'DRAFT', version.rows[0].id]
      );
      await client.query('COMMIT');
      return updated.rows[0];
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
}

module.exports = { CaseBriefService, FIELDS };
