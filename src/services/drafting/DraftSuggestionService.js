const { performance } = require('node:perf_hooks');
const { pool } = require('../../config/db');
const { httpError } = require('./DraftService');

function applySuggestion(sections, suggestion) {
  return sections.map((section) => {
    if (section.sectionKey !== suggestion.section_key) return section;
    const original = String(suggestion.original_text || '');
    const suggested = String(suggestion.suggested_text || '');
    let content = section.content;
    if (suggestion.suggestion_type === 'ADD' && suggested) {
      content = `${content}${content.trim() ? '\n\n' : ''}${suggested}`;
    } else if (suggestion.suggestion_type === 'REMOVE' && original) {
      content = content.replace(original, '');
    } else if (suggestion.suggestion_type === 'REWRITE' && suggested) {
      content = original && content.includes(original) ? content.replace(original, suggested) : suggested;
    }
    return { ...section, content };
  });
}

class DraftSuggestionService {
  constructor({
    db = pool,
    draftService,
    versionService,
    analyzer,
    generator,
    evidenceMatrixService,
    citationService,
  } = {}) {
    this.db = db;
    this.draftService = draftService;
    this.versionService = versionService;
    this.analyzer = analyzer;
    this.generator = generator;
    this.evidenceMatrixService = evidenceMatrixService;
    this.citationService = citationService;
  }

  async insertSuggestion({ draft, versionId, finding, runId, sourceContext = [], db = this.db }) {
    const sectionExists = await db.query(
      `SELECT id FROM legal_draft_sections
       WHERE draft_version_id = $1 AND section_key = $2`,
      [versionId, finding.sectionKey]
    );
    if (!sectionExists.rows[0]) throw httpError(400, 'Öneri bölümü taslakta bulunmuyor.', 'DRAFT_SECTION_NOT_FOUND');
    const { rows } = await db.query(
      `INSERT INTO draft_ai_suggestions (
         draft_id, draft_version_id, section_key, suggestion_type,
         original_text, suggested_text, reason, source_ids, source_context,
         evidence_ids, severity, text_range, created_by_run_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12::jsonb, $13)
       RETURNING *`,
      [
        draft.id, versionId, finding.sectionKey, finding.type,
        finding.originalText || null, finding.suggestedText || null, finding.message,
        finding.sourceIds || [], JSON.stringify(sourceContext || []), finding.evidenceIds || [],
        finding.severity || 'MEDIUM', finding.textRange ? JSON.stringify(finding.textRange) : null, runId || null,
      ]
    );
    return rows[0];
  }

  async generatePlan(draftId, accessContext) {
    const started = performance.now();
    const detail = await this.draftService.getDetail(draftId, accessContext);
    const matter = await this.draftService.findMatter(detail.case_id, accessContext);
    const context = await this.draftService.loadMatterContext(matter);
    const template = await this.draftService.findAccessibleTemplate(detail.template_id, accessContext);
    const run = await this.draftService.startAiRun(detail, 'PLAN', accessContext);
    try {
      const result = await this.generator.generatePlan({ draft: detail, matterContext: context, sections: detail.sections, template });
      await this.db.query(
        `UPDATE legal_drafts SET metadata = metadata || $2::jsonb, updated_at = now() WHERE id = $1`,
        [draftId, JSON.stringify({ generationPlan: result.plan })]
      );
      await this.draftService.finishAiRun(run.id, { usage: result.usage, durationMs: performance.now() - started });
      return { ...result, runId: run.id };
    } catch (error) {
      await this.draftService.finishAiRun(run.id, {
        usage: error.usage || {}, durationMs: performance.now() - started,
        status: 'FAILED', errorCode: error.code || 'DRAFT_PLAN_FAILED',
      });
      throw error;
    }
  }

  async generateSection(draftId, input, accessContext) {
    const started = performance.now();
    const detail = await this.draftService.getDetail(draftId, accessContext);
    const section = detail.sections.find((item) => item.sectionKey === input.sectionKey);
    if (!section) throw httpError(404, 'Taslak bölümü bulunamadı.', 'DRAFT_SECTION_NOT_FOUND');
    const matter = await this.draftService.findMatter(detail.case_id, accessContext);
    const context = await this.draftService.loadMatterContext(matter);
    const matrix = await this.evidenceMatrixService.getMatrix(detail.case_id, accessContext);
    const search = await this.citationService.search(draftId, {
      query: input.query || input.instruction || section.content || detail.case_title,
      effectiveAt: input.effectiveAt,
      limit: Number(process.env.DRAFT_SOURCE_LIMIT || 10),
    }, accessContext);
    const sources = search.results.slice(0, Number(process.env.DRAFT_SOURCE_LIMIT || 10));
    const run = await this.draftService.startAiRun(detail, 'SECTION', accessContext);
    try {
      const result = await this.generator.generateSection({
        draft: detail,
        section,
        instruction: input.instruction,
        matterContext: context,
        sources,
        evidence: matrix.evidence,
      });
      const sourceIds = [...new Set(result.section.claims.flatMap((claim) => claim.sourceIds))];
      const evidenceIds = [...new Set(result.section.claims.flatMap((claim) => claim.evidenceIds))];
      const sourceContext = sources
        .filter((source) => sourceIds.includes(source.sourceId))
        .map((source) => ({
          sourceId: source.sourceId,
          chunkId: source.metadata?.chunkId,
          excerpt: source.excerpt,
          effectiveAt: input.effectiveAt || null,
        }));
      const suggestion = await this.insertSuggestion({
        draft: detail,
        versionId: detail.current_version_id,
        runId: run.id,
        sourceContext,
        finding: {
          type: 'REWRITE', severity: 'MEDIUM', sectionKey: section.sectionKey,
          originalText: section.content, suggestedText: result.section.text,
          message: 'AI tarafından kaynak ve delil bağlamıyla bölüm yeniden yazımı önerildi.',
          sourceIds, evidenceIds,
        },
      });
      await this.draftService.finishAiRun(run.id, { usage: result.usage, durationMs: performance.now() - started });
      return { suggestion, generated: result.section, usage: result.usage, runId: run.id };
    } catch (error) {
      await this.draftService.finishAiRun(run.id, {
        usage: error.usage || {}, durationMs: performance.now() - started,
        status: 'FAILED', errorCode: error.code || 'DRAFT_SECTION_FAILED',
      });
      throw error;
    }
  }

  async analyze(draftId, input, accessContext, { emitAgentEvent = true } = {}) {
    const started = performance.now();
    const detail = await this.draftService.getDetail(draftId, accessContext);
    const matter = await this.draftService.findMatter(detail.case_id, accessContext);
    const context = await this.draftService.loadMatterContext(matter);
    const matrix = await this.evidenceMatrixService.getMatrix(detail.case_id, accessContext);
    const run = await this.draftService.startAiRun(detail, 'ANALYSIS', accessContext);
    try {
      const result = await this.analyzer.analyze({
        draft: detail,
        sections: detail.sections,
        citations: detail.citations,
        matrix,
        matterContext: context,
        effectiveAt: input.effectiveAt || null,
      });
      const client = await this.db.connect();
      const suggestions = [];
      try {
        await client.query('BEGIN');
        const locked = await client.query('SELECT current_version_id FROM legal_drafts WHERE id = $1 FOR UPDATE', [draftId]);
        if (locked.rows[0]?.current_version_id !== detail.current_version_id) {
          throw httpError(409, 'Taslak analiz sırasında değişti; analiz yenilenmeli.', 'DRAFT_CHANGED_DURING_ANALYSIS');
        }
        await client.query(
          `UPDATE draft_ai_suggestions SET status = 'SUPERSEDED', reviewed_at = now()
           WHERE draft_id = $1 AND draft_version_id = $2 AND status = 'PENDING'`,
          [draftId, detail.current_version_id]
        );
        for (const finding of result.analysis.findings) {
          suggestions.push(await this.insertSuggestion({
            draft: detail,
            versionId: detail.current_version_id,
            finding,
            runId: run.id,
            db: client,
          }));
        }
        await client.query(
          `UPDATE legal_drafts SET metadata = metadata || $2::jsonb, updated_at = now() WHERE id = $1`,
          [draftId, JSON.stringify({
            lastAnalysis: {
              missingInformation: result.analysis.missingInformation,
              calculationRequired: result.analysis.calculationRequired,
              overallAssessment: result.analysis.overallAssessment,
              runId: run.id,
            },
          })]
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      await this.draftService.finishAiRun(run.id, { usage: result.usage, durationMs: performance.now() - started });
      if (emitAgentEvent) {
        const { emitAgentEvent: emit } = require('../agents/AgentEventService');
        await emit({
          eventType: 'MATTER_UPDATED', eventKey: `draft-analysis:${run.id}`,
          organizationId: detail.organization_id || null, caseId: detail.case_id,
          inputData: { draftId, draftAnalysisRunId: run.id },
        });
      }
      return { ...result.analysis, suggestions, usage: result.usage, runId: run.id };
    } catch (error) {
      await this.draftService.finishAiRun(run.id, {
        usage: error.usage || {}, durationMs: performance.now() - started,
        status: 'FAILED', errorCode: error.code || 'DRAFT_ANALYSIS_FAILED',
      });
      throw error;
    }
  }

  async list(draftId, accessContext) {
    const draft = await this.draftService.findAccessibleDraft(draftId, accessContext);
    if (!draft) throw httpError(404, 'Taslak bulunamadı.', 'DRAFT_NOT_FOUND');
    const { rows } = await this.db.query(
      `SELECT * FROM draft_ai_suggestions
       WHERE draft_id = $1 ORDER BY status = 'PENDING' DESC, created_at DESC`,
      [draftId]
    );
    return rows;
  }

  async attachSuggestionCitations(draft, suggestion, versionId, accessContext, db) {
    for (const source of suggestion.source_context || []) {
      if (!source.sourceId || !source.chunkId) continue;
      await this.citationService.add(draft.id, {
        sectionKey: suggestion.section_key,
        claimKey: `suggestion-${suggestion.id}`,
        sourceId: source.sourceId,
        chunkId: source.chunkId,
        excerpt: source.excerpt,
        effectiveAt: source.effectiveAt,
        supportType: 'SUPPORTS',
      }, accessContext, { db, versionId });
    }
  }

  async accept(draftId, suggestionId, accessContext, { db = null } = {}) {
    const ownsTransaction = !db;
    const client = db || await this.db.connect();
    try {
      if (ownsTransaction) await client.query('BEGIN');
      const draft = await this.draftService.findAccessibleDraft(draftId, accessContext, 'write', { db: client });
      if (!draft) throw httpError(404, 'Taslak bulunamadı.', 'DRAFT_NOT_FOUND');
      await client.query('SELECT id FROM legal_drafts WHERE id = $1 FOR UPDATE', [draftId]);
      const result = await client.query(
        `SELECT * FROM draft_ai_suggestions
         WHERE id = $1 AND draft_id = $2 FOR UPDATE`,
        [suggestionId, draftId]
      );
      const suggestion = result.rows[0];
      if (!suggestion) throw httpError(404, 'Öneri bulunamadı.', 'DRAFT_SUGGESTION_NOT_FOUND');
      if (suggestion.status === 'ACCEPTED') {
        if (ownsTransaction) await client.query('COMMIT');
        return { suggestion, versionId: suggestion.applied_version_id, idempotent: true };
      }
      if (suggestion.status !== 'PENDING') throw httpError(409, 'Öneri artık beklemede değil.', 'DRAFT_SUGGESTION_NOT_PENDING');
      if (suggestion.draft_version_id !== draft.current_version_id) {
        await client.query(
          `UPDATE draft_ai_suggestions SET status = 'SUPERSEDED', reviewed_at = now()
           WHERE id = $1`, [suggestionId]
        );
        throw httpError(409, 'Öneri eski bir taslak versiyonuna ait.', 'DRAFT_SUGGESTION_SUPERSEDED');
      }
      const sections = await this.versionService.getSections(draft.current_version_id, { db: client });
      const updatedSections = applySuggestion(sections, suggestion);
      const version = await this.versionService.createVersion({
        draftId,
        sections: updatedSections,
        createdBy: accessContext.userId,
        changeSummary: `AI önerisi kabul edildi: ${suggestion.suggestion_type}`,
        copyCitationsFromVersionId: draft.current_version_id,
        db: client,
      });
      await this.attachSuggestionCitations(draft, suggestion, version.id, accessContext, client);
      const updated = await client.query(
        `UPDATE draft_ai_suggestions
         SET status = 'ACCEPTED', applied_version_id = $2,
             reviewed_by = $3, reviewed_at = now()
         WHERE id = $1 RETURNING *`,
        [suggestionId, version.id, accessContext.userId]
      );
      if (ownsTransaction) await client.query('COMMIT');
      return { suggestion: updated.rows[0], version, idempotent: false };
    } catch (error) {
      if (ownsTransaction) await client.query('ROLLBACK');
      throw error;
    } finally {
      if (ownsTransaction) client.release();
    }
  }

  async reject(draftId, suggestionId, accessContext) {
    const draft = await this.draftService.findAccessibleDraft(draftId, accessContext, 'write');
    if (!draft) throw httpError(404, 'Taslak bulunamadı.', 'DRAFT_NOT_FOUND');
    const current = await this.db.query(
      `SELECT * FROM draft_ai_suggestions WHERE id = $1 AND draft_id = $2`,
      [suggestionId, draftId]
    );
    if (!current.rows[0]) throw httpError(404, 'Öneri bulunamadı.', 'DRAFT_SUGGESTION_NOT_FOUND');
    if (current.rows[0].status === 'REJECTED') return { suggestion: current.rows[0], idempotent: true };
    if (current.rows[0].status !== 'PENDING') throw httpError(409, 'Öneri artık beklemede değil.', 'DRAFT_SUGGESTION_NOT_PENDING');
    const { rows } = await this.db.query(
      `UPDATE draft_ai_suggestions SET status = 'REJECTED', reviewed_by = $3, reviewed_at = now()
       WHERE id = $1 AND draft_id = $2 AND status = 'PENDING' RETURNING *`,
      [suggestionId, draftId, accessContext.userId]
    );
    return { suggestion: rows[0], idempotent: false };
  }

  async bulkReview(draftId, { accept = [], reject = [] }, accessContext) {
    if (accept.some((id) => reject.includes(id))) {
      throw httpError(400, 'Bir öneri hem kabul hem reddedilemez.', 'INVALID_BULK_REVIEW');
    }
    const ids = [...new Set([...accept, ...reject])];
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const draft = await this.draftService.findAccessibleDraft(draftId, accessContext, 'write', { db: client });
      if (!draft) throw httpError(404, 'Taslak bulunamadı.', 'DRAFT_NOT_FOUND');
      await client.query('SELECT id FROM legal_drafts WHERE id = $1 FOR UPDATE', [draftId]);
      const result = await client.query(
        `SELECT * FROM draft_ai_suggestions WHERE id = ANY($1::uuid[]) FOR UPDATE`,
        [ids]
      );
      if (result.rows.length !== ids.length
        || result.rows.some((item) => item.draft_id !== draftId || item.status !== 'PENDING' || item.draft_version_id !== draft.current_version_id)) {
        throw httpError(409, 'Bulk review geçersiz veya başka taslağa ait öneri içeriyor.', 'INVALID_BULK_REVIEW');
      }
      let version = null;
      if (accept.length) {
        let sections = await this.versionService.getSections(draft.current_version_id, { db: client });
        for (const suggestion of result.rows.filter((item) => accept.includes(item.id))) {
          sections = applySuggestion(sections, suggestion);
        }
        version = await this.versionService.createVersion({
          draftId, sections, createdBy: accessContext.userId,
          changeSummary: `${accept.length} AI önerisi toplu kabul edildi`,
          copyCitationsFromVersionId: draft.current_version_id, db: client,
        });
        for (const suggestion of result.rows.filter((item) => accept.includes(item.id))) {
          await this.attachSuggestionCitations(draft, suggestion, version.id, accessContext, client);
        }
      }
      if (accept.length) {
        await client.query(
          `UPDATE draft_ai_suggestions SET status = 'ACCEPTED', applied_version_id = $2,
             reviewed_by = $3, reviewed_at = now()
           WHERE id = ANY($1::uuid[])`,
          [accept, version.id, accessContext.userId]
        );
      }
      if (reject.length) {
        await client.query(
          `UPDATE draft_ai_suggestions SET status = 'REJECTED', reviewed_by = $2, reviewed_at = now()
           WHERE id = ANY($1::uuid[])`,
          [reject, accessContext.userId]
        );
      }
      await client.query('COMMIT');
      return { accepted: accept.length, rejected: reject.length, version };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = { DraftSuggestionService, applySuggestion };
