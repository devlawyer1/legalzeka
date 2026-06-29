const DEFAULT_SECTIONS = Object.freeze([
  ['COURT', 'Mahkeme'],
  ['PARTIES', 'Taraflar'],
  ['SUBJECT', 'Konu'],
  ['FACTS', 'Açıklamalar ve Vakıalar'],
  ['LEGAL_GROUNDS', 'Hukuki Nedenler'],
  ['EVIDENCE', 'Deliller'],
  ['REQUEST', 'Sonuç ve Talep'],
  ['ATTACHMENTS', 'Ekler'],
]);

function normalizeSectionKey(value, index = 0) {
  const normalized = String(value || `SECTION_${index + 1}`)
    .normalize('NFKC')
    .toLocaleUpperCase('tr-TR')
    .replace(/[^A-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return /^[A-Z]/.test(normalized) ? normalized : `SECTION_${index + 1}`;
}

function normalizeSections(sections) {
  const source = Array.isArray(sections) && sections.length
    ? sections
    : DEFAULT_SECTIONS.map(([sectionKey, title], index) => ({ sectionKey, title, content: '', sortOrder: index }));
  const seen = new Set();
  return source.slice(0, 40).map((section, index) => {
    let sectionKey = normalizeSectionKey(section.sectionKey || section.section_key, index);
    while (seen.has(sectionKey)) sectionKey = `${sectionKey}_${index + 1}`.slice(0, 80);
    seen.add(sectionKey);
    return {
      sectionKey,
      title: String(section.title || sectionKey).trim().slice(0, 300),
      content: String(section.content || '').slice(0, 150000),
      sortOrder: index,
      metadata: section.metadata && typeof section.metadata === 'object' ? section.metadata : {},
    };
  });
}

function plainTextFromSections(sections) {
  return sections
    .map((section) => `${section.title}\n${section.content}`.trim())
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 500000);
}

class DraftVersionService {
  constructor({ db }) {
    this.db = db;
  }

  async createVersion({
    draftId,
    sections,
    createdBy,
    changeSummary,
    copyCitationsFromVersionId = null,
    db = this.db,
  }) {
    const normalized = normalizeSections(sections);
    const current = await db.query(
      `SELECT coalesce(max(version_number), 0)::int AS version_number
       FROM legal_draft_versions WHERE draft_id = $1`,
      [draftId]
    );
    const versionNumber = Number(current.rows[0].version_number) + 1;
    const contentJson = { sections: normalized };
    const version = await db.query(
      `INSERT INTO legal_draft_versions (
         draft_id, version_number, content_json, plain_text, change_summary, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        draftId,
        versionNumber,
        contentJson,
        plainTextFromSections(normalized),
        String(changeSummary || `Versiyon ${versionNumber}`).slice(0, 500),
        createdBy,
      ]
    );

    for (const section of normalized) {
      await db.query(
        `INSERT INTO legal_draft_sections (
           draft_version_id, section_key, title, content, sort_order, metadata
         ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [version.rows[0].id, section.sectionKey, section.title, section.content, section.sortOrder, section.metadata]
      );
    }

    if (copyCitationsFromVersionId) {
      await db.query(
        `INSERT INTO draft_citations (
           draft_id, draft_version_id, section_key, claim_key, source_id,
           chunk_id, citation_order, source_excerpt, support_type
         )
         SELECT citation.draft_id, $2, citation.section_key, citation.claim_key,
                citation.source_id, citation.chunk_id, citation.citation_order,
                citation.source_excerpt, citation.support_type
         FROM draft_citations citation
         WHERE citation.draft_id = $1
           AND citation.draft_version_id = $3
           AND EXISTS (
             SELECT 1 FROM legal_draft_sections section
             WHERE section.draft_version_id = $2
               AND section.section_key = citation.section_key
           )
         ON CONFLICT DO NOTHING`,
        [draftId, version.rows[0].id, copyCitationsFromVersionId]
      );
    }

    await db.query(
      `UPDATE legal_drafts
       SET current_version_id = $2, updated_at = now()
       WHERE id = $1`,
      [draftId, version.rows[0].id]
    );
    return { ...version.rows[0], sections: normalized };
  }

  async getSections(versionId, { db = this.db } = {}) {
    const { rows } = await db.query(
      `SELECT id, section_key, title, content, sort_order, metadata
       FROM legal_draft_sections
       WHERE draft_version_id = $1
       ORDER BY sort_order, id`,
      [versionId]
    );
    return rows.map((section) => ({
      id: section.id,
      sectionKey: section.section_key,
      title: section.title,
      content: section.content,
      sortOrder: section.sort_order,
      metadata: section.metadata || {},
    }));
  }

  async list(draftId) {
    const { rows } = await this.db.query(
      `SELECT id, version_number, change_summary, created_by, created_at,
              char_length(plain_text)::int AS character_count
       FROM legal_draft_versions
       WHERE draft_id = $1
       ORDER BY version_number DESC`,
      [draftId]
    );
    return rows;
  }

  async compare(draftId, leftId, rightId) {
    const { rows } = await this.db.query(
      `SELECT id, version_number, content_json, plain_text, change_summary, created_at
       FROM legal_draft_versions
       WHERE draft_id = $1 AND id = ANY($2::uuid[])
       ORDER BY version_number`,
      [draftId, [leftId, rightId]]
    );
    return rows;
  }
}

module.exports = {
  DEFAULT_SECTIONS,
  DraftVersionService,
  normalizeSections,
  plainTextFromSections,
};
