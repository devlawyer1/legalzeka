const { pool } = require('../../config/db');
const { canUseOrganization } = require('../accessContext');

function httpError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function accessPredicate(context, values, alias = 'session') {
  if (context?.isSystemAdmin) return 'TRUE';
  values.push(context?.userId || null);
  const userParam = values.length;
  values.push(context?.scopes?.organizationIds || []);
  const organizationsParam = values.length;
  return `(
    (${alias}.organization_id IS NULL AND ${alias}.user_id = $${userParam}::uuid)
    OR ${alias}.organization_id = ANY($${organizationsParam}::uuid[])
  )`;
}

class ResearchSessionService {
  constructor({ db = pool } = {}) {
    this.db = db;
  }

  async findAccessibleById(sessionId, accessContext, { db = this.db, includeDeleted = false } = {}) {
    const values = [sessionId];
    const access = accessPredicate(accessContext, values);
    const { rows } = await db.query(
      `SELECT session.*
       FROM legal_research_sessions session
       WHERE session.id = $1
         ${includeDeleted ? '' : 'AND session.deleted_at IS NULL'}
         AND ${access}
       LIMIT 1`,
      values
    );
    return rows[0] || null;
  }

  async create({ accessContext, title, organizationId, caseContext, effectiveAt, legalDomain }) {
    let scopedOrganizationId = organizationId || null;
    if (caseContext) scopedOrganizationId = caseContext.organizationId || null;
    if (scopedOrganizationId && !canUseOrganization(accessContext, scopedOrganizationId, 'read')) {
      throw httpError(404, 'Organizasyon bulunamadı.', 'ORGANIZATION_NOT_FOUND');
    }
    const { rows } = await this.db.query(
      `INSERT INTO legal_research_sessions (
         user_id, organization_id, case_id, title, effective_at, legal_domain
       ) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        accessContext.userId,
        scopedOrganizationId,
        caseContext?.id || null,
        String(title || 'Yeni hukuk araştırması').trim().slice(0, 300),
        effectiveAt || null,
        legalDomain || caseContext?.legalDomain || null,
      ]
    );
    return rows[0];
  }

  async list({ accessContext, caseId = null, limit = 50 }) {
    const values = [];
    const access = accessPredicate(accessContext, values);
    const filters = ['session.deleted_at IS NULL', access];
    if (caseId) {
      values.push(caseId);
      filters.push(`session.case_id = $${values.length}`);
    }
    values.push(Math.max(1, Math.min(Number(limit) || 50, 100)));
    const { rows } = await this.db.query(
      `SELECT session.*,
              c.konu AS case_title,
              c.esas_no,
              last_answer.summary AS last_answer_summary,
              last_answer.status AS last_answer_status,
              coalesce(message_count.count, 0)::int AS message_count
       FROM legal_research_sessions session
       LEFT JOIN cases c ON c.id = session.case_id
       LEFT JOIN LATERAL (
         SELECT answer.summary, answer.status
         FROM legal_research_answers answer
         WHERE answer.session_id = session.id
         ORDER BY answer.created_at DESC
         LIMIT 1
       ) last_answer ON true
       LEFT JOIN LATERAL (
         SELECT count(*) AS count
         FROM legal_research_messages message
         WHERE message.session_id = session.id
       ) message_count ON true
       WHERE ${filters.join(' AND ')}
       ORDER BY session.updated_at DESC
       LIMIT $${values.length}`,
      values
    );
    return rows;
  }

  async getDetail(sessionId, accessContext) {
    const session = await this.findAccessibleById(sessionId, accessContext);
    if (!session) throw httpError(404, 'Araştırma oturumu bulunamadı.', 'RESEARCH_SESSION_NOT_FOUND');
    const [messages, answers] = await Promise.all([
      this.db.query(
        `SELECT id, role, content, structured_content, created_at
         FROM legal_research_messages
         WHERE session_id = $1
         ORDER BY created_at, id`,
        [sessionId]
      ),
      this.db.query(
        `SELECT * FROM legal_research_answers
         WHERE session_id = $1
         ORDER BY created_at, id`,
        [sessionId]
      ),
    ]);
    const answerIds = answers.rows.map((answer) => answer.id);
    const citations = answerIds.length
      ? await this.db.query(
          `SELECT citation.*,
                  source.source_type, source.title, source.court, source.chamber,
                  source.case_number, source.decision_number, source.decision_date,
                  source.official_source, source.source_url
           FROM legal_research_answer_citations citation
           JOIN legal_sources source ON source.id = citation.source_id
           WHERE citation.answer_id = ANY($1::uuid[])
             AND citation.verification_status <> 'REJECTED'
           ORDER BY citation.answer_id, citation.citation_order`,
          [answerIds]
        )
      : { rows: [] };
    const citationsByAnswer = new Map();
    for (const citation of citations.rows) {
      const collection = citationsByAnswer.get(citation.answer_id) || [];
      collection.push(citation);
      citationsByAnswer.set(citation.answer_id, collection);
    }
    return {
      ...session,
      messages: messages.rows,
      answers: answers.rows.map((answer) => ({
        ...answer,
        citations: citationsByAnswer.get(answer.id) || [],
      })),
    };
  }

  async updateTitle(sessionId, accessContext, title) {
    const session = await this.findAccessibleById(sessionId, accessContext);
    if (!session) throw httpError(404, 'Araştırma oturumu bulunamadı.', 'RESEARCH_SESSION_NOT_FOUND');
    const { rows } = await this.db.query(
      `UPDATE legal_research_sessions
       SET title = $2, updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [sessionId, String(title).trim().slice(0, 300)]
    );
    return rows[0];
  }

  async softDelete(sessionId, accessContext) {
    const session = await this.findAccessibleById(sessionId, accessContext);
    if (!session) return false;
    await this.db.query(
      `UPDATE legal_research_sessions
       SET deleted_at = coalesce(deleted_at, now()), status = 'ARCHIVED', updated_at = now()
       WHERE id = $1`,
      [sessionId]
    );
    return true;
  }

  async addMessage(sessionId, accessContext, { role = 'USER', content, structuredContent = {} }) {
    const session = await this.findAccessibleById(sessionId, accessContext);
    if (!session) throw httpError(404, 'Araştırma oturumu bulunamadı.', 'RESEARCH_SESSION_NOT_FOUND');
    const { rows } = await this.db.query(
      `INSERT INTO legal_research_messages (session_id, role, content, structured_content)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [sessionId, role, content, structuredContent]
    );
    await this.db.query('UPDATE legal_research_sessions SET updated_at = now() WHERE id = $1', [sessionId]);
    return rows[0];
  }

  async recentContext(sessionId, { messageLimit = 6 } = {}) {
    const { rows } = await this.db.query(
      `SELECT role, content
       FROM legal_research_messages
       WHERE session_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT $2`,
      [sessionId, Math.max(1, Math.min(messageLimit, 10))]
    );
    return rows.reverse().map((row) => ({ role: row.role, content: row.content.slice(0, 2000) }));
  }

  async beginAnswer({ sessionId, accessContext, query, requestHash, idempotencyKey }) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const session = await this.findAccessibleById(sessionId, accessContext, { db: client });
      if (!session) throw httpError(404, 'Araştırma oturumu bulunamadı.', 'RESEARCH_SESSION_NOT_FOUND');
      if (session.status !== 'ACTIVE') throw httpError(409, 'Araştırma oturumu aktif değil.', 'RESEARCH_SESSION_INACTIVE');

      if (idempotencyKey) {
        const existing = await client.query(
          `SELECT id, request_hash FROM legal_research_answers
           WHERE session_id = $1 AND idempotency_key = $2
           LIMIT 1`,
          [sessionId, idempotencyKey]
        );
        if (existing.rows[0]) {
          if (existing.rows[0].request_hash !== requestHash) {
            throw httpError(409, 'Idempotency anahtarı farklı bir istek için kullanılmış.', 'IDEMPOTENCY_CONFLICT');
          }
          await client.query('COMMIT');
          return { existing: true, answerId: existing.rows[0].id, session };
        }
      }

      const message = await client.query(
        `INSERT INTO legal_research_messages (session_id, role, content)
         VALUES ($1, 'USER', $2)
         RETURNING id`,
        [sessionId, query]
      );
      const answer = await client.query(
        `INSERT INTO legal_research_answers (
           session_id, user_message_id, idempotency_key, request_hash, status
         ) VALUES ($1, $2, $3, $4, 'PROCESSING')
         RETURNING id`,
        [sessionId, message.rows[0].id, idempotencyKey || null, requestHash]
      );
      await client.query(
        `UPDATE legal_research_sessions
         SET updated_at = now(),
             title = CASE WHEN title = 'Yeni hukuk araştırması' THEN left($2, 300) ELSE title END
         WHERE id = $1`,
        [sessionId, query]
      );
      await client.query('COMMIT');
      return {
        existing: false,
        answerId: answer.rows[0].id,
        userMessageId: message.rows[0].id,
        session,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      if (error.code === '23505' && idempotencyKey) {
        const existing = await this.db.query(
          `SELECT id, request_hash FROM legal_research_answers
           WHERE session_id = $1 AND idempotency_key = $2 LIMIT 1`,
          [sessionId, idempotencyKey]
        );
        if (existing.rows[0]?.request_hash === requestHash) {
          return { existing: true, answerId: existing.rows[0].id };
        }
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async completeAnswer({ answerId, answerText, structured, usage, metrics, citations, status = 'COMPLETED' }) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const updated = await client.query(
        `UPDATE legal_research_answers
         SET answer = $2,
             summary = $3,
             structured_content = $4,
             confidence_level = $5,
             confidence_reason = $6,
             provider = $7,
             model = $8,
             input_tokens = $9,
             output_tokens = $10,
             estimated_cost = $11,
             search_embedding_cost = $12,
             reranker_cost = $13,
             verifier_cost = $14,
             total_cost = $15,
             search_duration_ms = $16,
             verifier_duration_ms = $17,
             duration_ms = $18,
             search_cache_status = $19,
             status = $20,
             safe_error_code = NULL,
             updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [
          answerId,
          answerText,
          structured.summary,
          structured,
          structured.confidence.level,
          structured.confidence.reason,
          usage.provider || null,
          usage.model || null,
          usage.inputTokens || 0,
          usage.outputTokens || 0,
          usage.estimatedCost || 0,
          metrics.searchEmbeddingCost || 0,
          metrics.rerankerCost || 0,
          metrics.verifierCost || 0,
          metrics.totalCost || 0,
          Math.round(metrics.searchDurationMs || 0),
          Math.round(metrics.verifierDurationMs || 0),
          Math.round(metrics.durationMs || 0),
          metrics.searchCacheStatus || null,
          status,
        ]
      );
      if (!updated.rows[0]) throw httpError(404, 'Araştırma cevabı bulunamadı.', 'RESEARCH_ANSWER_NOT_FOUND');

      let order = 0;
      for (const citation of citations) {
        if (!citation.sourceId || !citation.chunkId) continue;
        order = citation.citationOrder || order + 1;
        await client.query(
          `INSERT INTO legal_research_answer_citations (
             answer_id, source_id, chunk_id, claim_key, source_excerpt,
             source_page_or_section, citation_order, support_type,
             verification_status, overlap_score, verification_reason
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (answer_id, claim_key, source_id, chunk_id, support_type) DO NOTHING`,
          [
            answerId,
            citation.sourceId,
            citation.chunkId,
            citation.claimKey,
            citation.sourceExcerpt || '',
            citation.sourcePageOrSection || null,
            order,
            citation.supportType,
            citation.verificationStatus,
            citation.overlapScore || 0,
            citation.reason || null,
          ]
        );
      }
      await client.query(
        `INSERT INTO legal_research_messages (session_id, role, content, structured_content)
         VALUES ($1, 'ASSISTANT', $2, $3)`,
        [updated.rows[0].session_id, answerText, structured]
      );
      await client.query(
        `UPDATE legal_research_sessions
         SET session_summary = $2, updated_at = now()
         WHERE id = $1`,
        [updated.rows[0].session_id, structured.summary.slice(0, 3000)]
      );
      await client.query('COMMIT');
      return updated.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async failAnswer(answerId, { code = 'LEGAL_RESEARCH_FAILED', usage = {}, durationMs = 0 } = {}) {
    await this.db.query(
      `UPDATE legal_research_answers
       SET status = 'FAILED', safe_error_code = $2,
           provider = $3, model = $4, input_tokens = $5,
           output_tokens = $6, estimated_cost = $7,
           total_cost = $7, duration_ms = $8, updated_at = now()
       WHERE id = $1 AND status = 'PROCESSING'`,
      [
        answerId,
        String(code).slice(0, 80),
        usage.provider || null,
        usage.model || null,
        usage.inputTokens || 0,
        usage.outputTokens || 0,
        usage.estimatedCost || 0,
        Math.round(durationMs || 0),
      ]
    );
  }

  async getAnswerPayload(answerId, accessContext) {
    const { rows } = await this.db.query(
      `SELECT answer.*
       FROM legal_research_answers answer
       JOIN legal_research_sessions session ON session.id = answer.session_id
       WHERE answer.id = $1
         AND session.deleted_at IS NULL
         AND (
           $2::boolean = true
           OR (session.organization_id IS NULL AND session.user_id = $3::uuid)
           OR session.organization_id = ANY($4::uuid[])
         )
       LIMIT 1`,
      [
        answerId,
        accessContext?.isSystemAdmin || false,
        accessContext?.userId || null,
        accessContext?.scopes?.organizationIds || [],
      ]
    );
    if (!rows[0]) throw httpError(404, 'Araştırma cevabı bulunamadı.', 'RESEARCH_ANSWER_NOT_FOUND');
    const citations = await this.db.query(
      `SELECT citation.*,
              source.source_type, source.title, source.court, source.chamber,
              source.case_number, source.decision_number, source.decision_date,
              source.official_source, source.source_url
       FROM legal_research_answer_citations citation
       JOIN legal_sources source ON source.id = citation.source_id
       WHERE citation.answer_id = $1
         AND citation.verification_status <> 'REJECTED'
       ORDER BY citation.citation_order`,
      [answerId]
    );
    const structured = rows[0].structured_content || {};
    return {
      answerId: rows[0].id,
      sessionId: rows[0].session_id,
      status: rows[0].status,
      summary: rows[0].summary,
      analysis: structured.analysis || [],
      counterArguments: structured.counterArguments || [],
      missingInformation: structured.missingInformation || [],
      warnings: structured.warnings || [],
      confidence: structured.confidence || null,
      citations: citations.rows,
      usage: {
        provider: rows[0].provider,
        model: rows[0].model,
        inputTokens: rows[0].input_tokens,
        outputTokens: rows[0].output_tokens,
        estimatedCost: Number(rows[0].estimated_cost || 0),
        totalCost: Number(rows[0].total_cost || 0),
      },
      metrics: {
        searchDurationMs: rows[0].search_duration_ms,
        verifierDurationMs: rows[0].verifier_duration_ms,
        durationMs: rows[0].duration_ms,
        cacheStatus: rows[0].search_cache_status,
      },
    };
  }

  async saveToMatter({ sessionId, answerId, caseId, accessContext, title }) {
    const session = await this.findAccessibleById(sessionId, accessContext);
    if (!session || session.case_id !== caseId) {
      throw httpError(404, 'Dosyaya bağlı araştırma bulunamadı.', 'RESEARCH_SESSION_NOT_FOUND');
    }
    const answer = await this.getAnswerPayload(answerId, accessContext);
    if (answer.sessionId !== sessionId || !['COMPLETED', 'INSUFFICIENT'].includes(answer.status)) {
      throw httpError(409, 'Kaydedilebilir araştırma cevabı bulunamadı.', 'RESEARCH_ANSWER_NOT_READY');
    }
    const content = [
      answer.summary,
      ...(answer.analysis || []).map((claim) => claim.text),
      ...(answer.warnings || []).map((warning) => `Uyarı: ${warning}`),
    ].filter(Boolean).join('\n\n');
    const { rows } = await this.db.query(
      `INSERT INTO matter_research_notes (
         case_id, session_id, answer_id, title, content, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (answer_id) DO UPDATE SET title = EXCLUDED.title
       RETURNING *`,
      [caseId, sessionId, answerId, String(title || session.title).slice(0, 300), content, accessContext.userId]
    );
    return rows[0];
  }
}

module.exports = { ResearchSessionService, accessPredicate, httpError };
