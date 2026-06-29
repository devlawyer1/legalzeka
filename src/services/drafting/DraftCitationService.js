const { pool } = require('../../config/db');
const { legalSearchService, repository } = require('../legalSearch');
const { organizationIds, httpError } = require('./DraftService');

class DraftCitationService {
  constructor({ db = pool, draftService, searchService = legalSearchService, sourceRepository = repository } = {}) {
    this.db = db;
    this.draftService = draftService;
    this.searchService = searchService;
    this.sourceRepository = sourceRepository;
  }

  accessScope(accessContext) {
    return { userId: accessContext.userId, organizationIds: organizationIds(accessContext) };
  }

  async search(draftId, input, accessContext) {
    const draft = await this.draftService.findAccessibleDraft(draftId, accessContext);
    if (!draft) throw httpError(404, 'Taslak bulunamadı.', 'DRAFT_NOT_FOUND');
    const query = input.counter
      ? `${input.query} aksi yönde ret uygulanmaz karşı görüş`
      : input.query;
    const result = await this.searchService.search({
      query: String(query).slice(0, 1000),
      mode: 'HYBRID',
      sourceTypes: input.sourceTypes || [],
      effectiveAt: input.effectiveAt || null,
      versionStatus: input.currentOnly ? 'CURRENT' : 'ALL',
      page: 1,
      pageSize: Math.min(Number(input.limit) || 12, 20),
      caseId: draft.case_id,
    }, {
      accessScope: this.accessScope(accessContext),
      caseContext: {
        id: draft.case_id,
        legalDomain: draft.legal_domain,
        organizationId: draft.organization_id,
        ownerUserId: draft.owner_user_id,
        events: [],
      },
      organizationId: draft.organization_id,
    });
    return result;
  }

  async validateSource({ sourceId, chunkId, excerpt, accessContext, effectiveAt = null }) {
    const source = await this.sourceRepository.getSource(sourceId, this.accessScope(accessContext));
    if (!source) throw httpError(404, 'Hukuk kaynağı bulunamadı.', 'LEGAL_SOURCE_NOT_FOUND');
    const chunk = source.chunks.find((item) => item.id === chunkId);
    if (!chunk) throw httpError(400, 'Kaynak parçası bu kaynağa ait değil.', 'CHUNK_SOURCE_MISMATCH');
    const groundedExcerpt = excerpt || chunk.content.slice(0, 700);
    if (!groundedExcerpt || !chunk.content.includes(groundedExcerpt)) {
      throw httpError(400, 'Kaynak alıntısı doğrulanamadı.', 'EXCERPT_NOT_GROUNDED');
    }
    if (effectiveAt && ['LEGISLATION', 'LEGISLATION_VERSION'].includes(source.source_type)) {
      const start = chunk.effective_from || source.effective_from;
      const end = chunk.effective_to || source.effective_to;
      const valid = (!start || String(start).slice(0, 10) <= effectiveAt)
        && (!end || String(end).slice(0, 10) > effectiveAt);
      if (!valid) throw httpError(400, 'Mevzuat sürümü seçilen tarihte yürürlükte değil.', 'VERSION_NOT_EFFECTIVE');
    }
    return { source, chunk, excerpt: groundedExcerpt };
  }

  async add(draftId, input, accessContext, { db = this.db, versionId = null } = {}) {
    if (!versionId) {
      const client = await this.db.connect();
      try {
        await client.query('BEGIN');
        const draft = await this.draftService.findAccessibleDraft(draftId, accessContext, 'write', { db: client });
        if (!draft) throw httpError(404, 'Taslak bulunamadı.', 'DRAFT_NOT_FOUND');
        await client.query('SELECT id FROM legal_drafts WHERE id = $1 FOR UPDATE', [draftId]);
        const sections = await this.draftService.versionService.getSections(draft.current_version_id, { db: client });
        const version = await this.draftService.versionService.createVersion({
          draftId,
          sections,
          createdBy: accessContext.userId,
          changeSummary: 'Kaynak eklendi',
          copyCitationsFromVersionId: draft.current_version_id,
          db: client,
        });
        const citation = await this.add(draftId, input, accessContext, { db: client, versionId: version.id });
        await client.query('COMMIT');
        return { ...citation, created_version_id: version.id, version_number: version.version_number };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
    const draft = await this.draftService.findAccessibleDraft(draftId, accessContext, 'write', { db });
    if (!draft) throw httpError(404, 'Taslak bulunamadı.', 'DRAFT_NOT_FOUND');
    const targetVersionId = versionId || draft.current_version_id;
    const section = await db.query(
      `SELECT id FROM legal_draft_sections
       WHERE draft_version_id = $1 AND section_key = $2 LIMIT 1`,
      [targetVersionId, input.sectionKey]
    );
    if (!section.rows[0]) throw httpError(404, 'Taslak bölümü bulunamadı.', 'DRAFT_SECTION_NOT_FOUND');
    const validated = await this.validateSource({
      sourceId: input.sourceId,
      chunkId: input.chunkId,
      excerpt: input.excerpt,
      accessContext,
      effectiveAt: input.effectiveAt,
    });
    const order = await db.query(
      `SELECT coalesce(max(citation_order), 0)::int + 1 AS next_order
       FROM draft_citations WHERE draft_version_id = $1`,
      [targetVersionId]
    );
    const { rows } = await db.query(
      `INSERT INTO draft_citations (
         draft_id, draft_version_id, section_key, claim_key, source_id,
         chunk_id, citation_order, source_excerpt, support_type
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (draft_version_id, section_key, claim_key, source_id, chunk_id)
       DO UPDATE SET source_excerpt = EXCLUDED.source_excerpt, support_type = EXCLUDED.support_type
       RETURNING *`,
      [
        draftId, targetVersionId, input.sectionKey, input.claimKey || input.sectionKey,
        validated.source.id, validated.chunk.id, order.rows[0].next_order,
        validated.excerpt, input.supportType || 'SUPPORTS',
      ]
    );
    return rows[0];
  }

  async remove(draftId, citationId, accessContext) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const draft = await this.draftService.findAccessibleDraft(draftId, accessContext, 'write', { db: client });
      if (!draft) throw httpError(404, 'Taslak bulunamadı.', 'DRAFT_NOT_FOUND');
      await client.query('SELECT id FROM legal_drafts WHERE id = $1 FOR UPDATE', [draftId]);
      const current = await client.query(
        `SELECT * FROM draft_citations
         WHERE id = $1 AND draft_id = $2 AND draft_version_id = $3
         FOR UPDATE`,
        [citationId, draftId, draft.current_version_id]
      );
      if (!current.rows[0]) throw httpError(404, 'Atıf bulunamadı.', 'DRAFT_CITATION_NOT_FOUND');
      const citation = current.rows[0];
      const sections = await this.draftService.versionService.getSections(draft.current_version_id, { db: client });
      const version = await this.draftService.versionService.createVersion({
        draftId,
        sections,
        createdBy: accessContext.userId,
        changeSummary: 'Kaynak kaldırıldı',
        copyCitationsFromVersionId: draft.current_version_id,
        db: client,
      });
      await client.query(
        `DELETE FROM draft_citations
         WHERE draft_version_id = $1 AND section_key = $2 AND claim_key = $3
           AND source_id = $4 AND chunk_id = $5`,
        [version.id, citation.section_key, citation.claim_key, citation.source_id, citation.chunk_id]
      );
      await client.query('COMMIT');
      return {
        section_key: citation.section_key,
        claim_key: citation.claim_key,
        unsupported: true,
        created_version_id: version.id,
        version_number: version.version_number,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = { DraftCitationService };
