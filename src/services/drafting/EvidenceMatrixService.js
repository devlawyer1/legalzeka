const { pool } = require('../../config/db');
const { httpError } = require('./DraftService');

class EvidenceMatrixService {
  constructor({ db = pool, draftService } = {}) {
    this.db = db;
    this.draftService = draftService;
  }

  async assertMatter(caseId, accessContext, permission = 'read', { db = this.db } = {}) {
    const matter = await this.draftService.findMatter(caseId, accessContext, permission, { db });
    if (!matter) throw httpError(404, 'Dava bulunamadı.', 'MATTER_NOT_FOUND');
    return matter;
  }

  async createClaim(caseId, input, accessContext) {
    await this.assertMatter(caseId, accessContext, 'write');
    if (input.assertedByPartyId) {
      const party = await this.db.query('SELECT id FROM matter_parties WHERE id = $1 AND case_id = $2', [input.assertedByPartyId, caseId]);
      if (!party.rows[0]) throw httpError(400, 'Taraf bu dosyaya ait değil.', 'PARTY_CASE_MISMATCH');
    }
    const verified = input.verified === true;
    const { rows } = await this.db.query(
      `INSERT INTO matter_claims (
         case_id, title, description, claim_type, asserted_by_party_id,
         status, verified_by, verified_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $7::uuid IS NULL THEN NULL ELSE now() END)
       RETURNING *`,
      [
        caseId, input.title, input.description || null, input.claimType || 'FACT',
        input.assertedByPartyId || null, verified ? 'VERIFIED' : 'PROPOSED',
        verified ? accessContext.userId : null,
      ]
    );
    return rows[0];
  }

  async createEvidence(caseId, input, accessContext) {
    await this.assertMatter(caseId, accessContext, 'write');
    if (input.documentId) {
      const document = await this.db.query(
        'SELECT id FROM case_documents WHERE id = $1 AND case_id = $2 AND deleted_at IS NULL',
        [input.documentId, caseId]
      );
      if (!document.rows[0]) throw httpError(400, 'Belge bu dosyaya ait değil.', 'DOCUMENT_CASE_MISMATCH');
    }
    const verified = input.verified === true;
    const { rows } = await this.db.query(
      `INSERT INTO matter_evidence (
         case_id, document_id, title, description, evidence_type, source_page,
         verified, verified_by, verified_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
         CASE WHEN $7 THEN now() ELSE NULL END)
       RETURNING *`,
      [
        caseId, input.documentId || null, input.title, input.description || null,
        input.evidenceType || 'DOCUMENT', input.sourcePage || null, verified,
        verified ? accessContext.userId : null,
      ]
    );
    return rows[0];
  }

  async createRelation(caseId, input, accessContext) {
    await this.assertMatter(caseId, accessContext, 'write');
    const entities = await this.db.query(
      `SELECT claim.id AS claim_id, evidence.id AS evidence_id
       FROM matter_claims claim
       JOIN matter_evidence evidence ON evidence.id = $2
       WHERE claim.id = $1 AND claim.case_id = $3 AND evidence.case_id = $3`,
      [input.claimId, input.evidenceId, caseId]
    );
    if (!entities.rows[0]) throw httpError(400, 'İddia veya delil bu dosyaya ait değil.', 'CLAIM_EVIDENCE_CASE_MISMATCH');
    const suggestedByAi = input.suggestedByAi === true;
    const verified = !suggestedByAi && input.verified !== false;
    const { rows } = await this.db.query(
      `INSERT INTO claim_evidence_relations (
         claim_id, evidence_id, relation_type, confidence, verification_status,
         suggested_by_ai, verified_by, verified_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7,
         CASE WHEN $7::uuid IS NULL THEN NULL ELSE now() END)
       ON CONFLICT (claim_id, evidence_id, relation_type)
       DO UPDATE SET
         confidence = EXCLUDED.confidence,
         verification_status = CASE
           WHEN claim_evidence_relations.verification_status = 'VERIFIED' THEN 'VERIFIED'
           ELSE EXCLUDED.verification_status
         END,
         suggested_by_ai = claim_evidence_relations.suggested_by_ai AND EXCLUDED.suggested_by_ai,
         verified_by = COALESCE(claim_evidence_relations.verified_by, EXCLUDED.verified_by),
         verified_at = COALESCE(claim_evidence_relations.verified_at, EXCLUDED.verified_at)
       RETURNING *`,
      [
        input.claimId, input.evidenceId, input.relationType || 'SUPPORTS',
        input.confidence ?? null, verified ? 'VERIFIED' : 'PENDING', suggestedByAi,
        verified ? accessContext.userId : null,
      ]
    );
    return rows[0];
  }

  async reviewRelation(caseId, relationId, status, accessContext) {
    await this.assertMatter(caseId, accessContext, 'write');
    const { rows } = await this.db.query(
      `UPDATE claim_evidence_relations relation
       SET verification_status = $3::varchar, verified_by = $4,
           verified_at = CASE WHEN $3::varchar = 'VERIFIED' THEN now() ELSE NULL END
       FROM matter_claims claim, matter_evidence evidence
       WHERE relation.id = $1
         AND claim.id = relation.claim_id AND evidence.id = relation.evidence_id
         AND claim.case_id = $2 AND evidence.case_id = $2
       RETURNING relation.*`,
      [relationId, caseId, status, accessContext.userId]
    );
    if (!rows[0]) throw httpError(404, 'Delil ilişkisi bulunamadı.', 'EVIDENCE_RELATION_NOT_FOUND');
    return rows[0];
  }

  async linkDraftClaim(draftId, input, accessContext) {
    const draft = await this.draftService.findAccessibleDraft(draftId, accessContext, 'write');
    if (!draft) throw httpError(404, 'Taslak bulunamadı.', 'DRAFT_NOT_FOUND');
    const valid = await this.db.query(
      `SELECT section.id AS section_id, claim.id AS claim_id
       FROM legal_draft_sections section
       JOIN matter_claims claim ON claim.id = $2
       WHERE section.id = $1 AND section.draft_version_id = $3
         AND claim.case_id = $4`,
      [input.sectionId, input.claimId, draft.current_version_id, draft.case_id]
    );
    if (!valid.rows[0]) throw httpError(400, 'Bölüm veya iddia bu taslağa ait değil.', 'DRAFT_CLAIM_MISMATCH');
    const { rows } = await this.db.query(
      `INSERT INTO draft_claim_relations (draft_id, draft_section_id, claim_id)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING *`,
      [draftId, input.sectionId, input.claimId]
    );
    return rows[0] || { draft_id: draftId, draft_section_id: input.sectionId, claim_id: input.claimId };
  }

  async getMatrix(caseId, accessContext) {
    await this.assertMatter(caseId, accessContext);
    const [claims, evidence, relations] = await Promise.all([
      this.db.query(
        `SELECT claim.*, party.name AS asserted_by_party
         FROM matter_claims claim
         LEFT JOIN matter_parties party ON party.id = claim.asserted_by_party_id
         WHERE claim.case_id = $1 ORDER BY claim.created_at, claim.id`,
        [caseId]
      ),
      this.db.query(
        `SELECT evidence.*, document.original_filename
         FROM matter_evidence evidence
         LEFT JOIN case_documents document ON document.id = evidence.document_id
         WHERE evidence.case_id = $1 ORDER BY evidence.created_at, evidence.id`,
        [caseId]
      ),
      this.db.query(
        `SELECT relation.*
         FROM claim_evidence_relations relation
         JOIN matter_claims claim ON claim.id = relation.claim_id
         JOIN matter_evidence evidence ON evidence.id = relation.evidence_id
         WHERE claim.case_id = $1 AND evidence.case_id = $1
         ORDER BY relation.created_at, relation.id`,
        [caseId]
      ),
    ]);
    const evidenceById = new Map(evidence.rows.map((item) => [item.id, item]));
    return {
      claims: claims.rows.map((claim) => {
        const claimRelations = relations.rows.filter((relation) => relation.claim_id === claim.id);
        const byType = (type) => claimRelations
          .filter((relation) => relation.relation_type === type)
          .map((relation) => ({ ...relation, evidence: evidenceById.get(relation.evidence_id) }));
        return {
          ...claim,
          supportingEvidence: byType('SUPPORTS'),
          contradictingEvidence: byType('CONTRADICTS'),
          backgroundEvidence: byType('BACKGROUND'),
          missingEvidence: claimRelations.filter((relation) => relation.verification_status === 'VERIFIED').length === 0,
        };
      }),
      evidence: evidence.rows,
      relations: relations.rows,
    };
  }
}

module.exports = { EvidenceMatrixService };
