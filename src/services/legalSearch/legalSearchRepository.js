const { pool } = require('../../config/db');

function vectorLiteral(vector) {
  if (!Array.isArray(vector) || vector.length === 0) return null;
  return `[${vector.map((value) => Number(value).toFixed(8)).join(',')}]`;
}

function addFilter(clauses, params, sql, value) {
  params.push(value);
  clauses.push(sql.replace('?', `$${params.length}`));
}

function buildScopeAndFilters(request, accessScope = {}, startParams = []) {
  const clauses = [];
  const params = [...startParams];
  const organizationIds = accessScope.organizationIds || [];
  const userId = accessScope.userId || null;

  params.push(organizationIds);
  const organizationParam = params.length;
  params.push(userId);
  const userParam = params.length;
  clauses.push(`(
    s.visibility = 'PUBLIC'
    OR (s.visibility = 'ORGANIZATION' AND s.organization_id = ANY($${organizationParam}::uuid[]))
    OR (s.visibility = 'PERSONAL' AND s.owner_user_id = $${userParam}::uuid)
  )`);

  const filters = request.filters || {};
  if (filters.sourceTypes?.length) addFilter(clauses, params, 's.source_type = ANY(?::varchar[])', filters.sourceTypes);
  if (filters.courts?.length) {
    addFilter(
      clauses,
      params,
      `EXISTS (SELECT 1 FROM unnest(?::text[]) AS court_filter
               WHERE s.court ILIKE '%' || court_filter || '%')`,
      filters.courts
    );
  }
  if (filters.chambers?.length) {
    addFilter(
      clauses,
      params,
      `EXISTS (SELECT 1 FROM unnest(?::text[]) AS chamber_filter
               WHERE s.chamber ILIKE '%' || chamber_filter || '%')`,
      filters.chambers
    );
  }
  if (filters.dateFrom) addFilter(clauses, params, 's.decision_date >= ?::date', filters.dateFrom);
  if (filters.dateTo) addFilter(clauses, params, 's.decision_date <= ?::date', filters.dateTo);
  if (filters.caseNumber) addFilter(clauses, params, 's.case_number ILIKE ?', filters.caseNumber);
  if (filters.decisionNumber) addFilter(clauses, params, 's.decision_number ILIKE ?', filters.decisionNumber);
  if (filters.legalDomain) addFilter(clauses, params, 's.legal_domain ILIKE ?', `%${filters.legalDomain}%`);
  if (filters.legislationName) addFilter(clauses, params, 's.title ILIKE ?', `%${filters.legislationName}%`);
  if (filters.articleNumber) {
    params.push(filters.articleNumber);
    const articleParam = params.length;
    clauses.push(`(
      c.article_number = $${articleParam}
      OR EXISTS (
        SELECT 1 FROM legal_source_citations citation
        WHERE citation.source_id = s.id AND citation.article_number = $${articleParam}
      )
    )`);
  }
  if (filters.lawNumber) {
    params.push(filters.lawNumber);
    const lawParam = params.length;
    clauses.push(`(
      s.metadata->>'lawNumber' = $${lawParam}
      OR EXISTS (
        SELECT 1 FROM legal_source_citations citation
        WHERE citation.source_id = s.id AND citation.law_number = $${lawParam}
      )
    )`);
  }

  if (request.effectiveAt) {
    params.push(request.effectiveAt);
    const dateParam = params.length;
    clauses.push(`(
      s.source_type NOT IN ('LEGISLATION', 'LEGISLATION_VERSION')
      OR (
        coalesce(c.effective_from, s.effective_from) IS NULL
        OR coalesce(c.effective_from, s.effective_from) <= $${dateParam}::date
      )
      AND (
        coalesce(c.effective_to, s.effective_to) IS NULL
        OR coalesce(c.effective_to, s.effective_to) > $${dateParam}::date
      )
    )`);
  }
  if (request.versionStatus === 'CURRENT') {
    clauses.push(`(
      s.source_type NOT IN ('LEGISLATION', 'LEGISLATION_VERSION')
      OR (coalesce(c.effective_to, s.effective_to) IS NULL AND s.status = 'ACTIVE')
    )`);
  } else if (request.versionStatus === 'HISTORICAL') {
    clauses.push(`s.source_type = 'LEGISLATION_VERSION' AND coalesce(c.effective_to, s.effective_to) IS NOT NULL`);
  }

  return { clauses, params };
}

const RESULT_COLUMNS = `
  s.id AS source_id,
  s.source_type,
  s.title,
  s.court,
  s.chamber,
  s.case_number,
  s.decision_number,
  s.decision_date,
  s.publication_date,
  s.effective_from AS source_effective_from,
  s.effective_to AS source_effective_to,
  s.legal_domain,
  coalesce(s.source_url, (
    SELECT origin.source_url
    FROM legal_source_origins origin
    WHERE origin.legal_source_id = s.id AND origin.source_url IS NOT NULL
    ORDER BY origin.official_source DESC, origin.trust_score DESC, origin.fetched_at DESC
    LIMIT 1
  )) AS source_url,
  s.official_source,
  s.status,
  s.visibility,
  s.metadata AS source_metadata,
  c.id AS chunk_id,
  c.chunk_type,
  c.chunk_index,
  c.heading,
  c.content AS chunk_content,
  c.article_number,
  c.effective_from AS chunk_effective_from,
  c.effective_to AS chunk_effective_to,
  c.metadata AS chunk_metadata
`;

class LegalSearchRepository {
  constructor({ db = pool } = {}) {
    this.db = db;
  }

  async getCorpusVersion() {
    const { rows } = await this.db.query(
      'SELECT corpus_version FROM legal_corpus_state WHERE singleton = true'
    );
    return Number(rows[0]?.corpus_version || 1);
  }

  async keywordSearch(query, request, accessScope, limit) {
    const scoped = buildScopeAndFilters(request, accessScope, [query]);
    scoped.params.push(limit);
    const limitParam = scoped.params.length;
    const { rows } = await this.db.query(
      `SELECT ${RESULT_COLUMNS},
              ts_rank_cd(c.search_vector, websearch_to_tsquery('turkish', $1), 32) AS keyword_score,
              NULL::double precision AS semantic_score
       FROM legal_source_chunks c
       JOIN legal_sources s ON s.id = c.source_id
       WHERE c.search_vector @@ websearch_to_tsquery('turkish', $1)
         AND NOT (
           s.source_type = 'LEGISLATION'
           AND EXISTS (
             SELECT 1
             FROM legislation legislation_row
             JOIN legislation_versions version ON version.legislation_id = legislation_row.id
             WHERE legislation_row.legal_source_id = s.id
               AND version.legal_source_id <> s.id
           )
         )
         AND ${scoped.clauses.join(' AND ')}
       ORDER BY keyword_score DESC, s.official_source DESC, s.decision_date DESC NULLS LAST
       LIMIT $${limitParam}`,
      scoped.params
    );
    return rows;
  }

  async semanticSearch(vector, request, accessScope, limit) {
    const literal = vectorLiteral(vector);
    if (!literal) return [];
    const scoped = buildScopeAndFilters(request, accessScope, [literal]);
    scoped.params.push(limit);
    const limitParam = scoped.params.length;
    const { rows } = await this.db.query(
      `SELECT ${RESULT_COLUMNS},
              NULL::double precision AS keyword_score,
              1 - (c.embedding <=> $1::vector) AS semantic_score
       FROM legal_source_chunks c
       JOIN legal_sources s ON s.id = c.source_id
       WHERE c.embedding IS NOT NULL
         AND NOT (
           s.source_type = 'LEGISLATION'
           AND EXISTS (
             SELECT 1
             FROM legislation legislation_row
             JOIN legislation_versions version ON version.legislation_id = legislation_row.id
             WHERE legislation_row.legal_source_id = s.id
               AND version.legal_source_id <> s.id
           )
         )
         AND ${scoped.clauses.join(' AND ')}
       ORDER BY c.embedding <=> $1::vector, s.official_source DESC
       LIMIT $${limitParam}`,
      scoped.params
    );
    return rows;
  }

  async getSource(sourceId, accessScope) {
    const scoped = buildScopeAndFilters({ filters: {} }, accessScope, [sourceId]);
    const { rows } = await this.db.query(
      `SELECT s.*
       FROM legal_sources s
       JOIN LATERAL (
         SELECT NULL::varchar AS article_number, NULL::date AS effective_from, NULL::date AS effective_to
       ) c ON true
       WHERE s.id = $1 AND ${scoped.clauses.join(' AND ')}
       LIMIT 1`,
      scoped.params
    );
    if (!rows[0]) return null;

    const [origins, chunks, citations] = await Promise.all([
      this.db.query(
        `SELECT source_name, external_id, source_url, official_source, trust_score, metadata, fetched_at
         FROM legal_source_origins WHERE legal_source_id = $1
         ORDER BY official_source DESC, trust_score DESC, fetched_at DESC`,
        [sourceId]
      ),
      this.db.query(
        `SELECT id, chunk_type, chunk_index, heading, content, article_number,
                effective_from, effective_to, metadata
         FROM legal_source_chunks WHERE source_id = $1 ORDER BY chunk_index LIMIT 100`,
        [sourceId]
      ),
      this.db.query(
        `SELECT law_name, law_number, article_number, citation_text, target_source_id, metadata
         FROM legal_source_citations WHERE source_id = $1 ORDER BY created_at`,
        [sourceId]
      ),
    ]);
    return { ...rows[0], origins: origins.rows, chunks: chunks.rows, citations: citations.rows };
  }

  async getSourceChunk(sourceId, chunkId, accessScope) {
    const scoped = buildScopeAndFilters({ filters: {} }, accessScope, [sourceId, chunkId]);
    const { rows } = await this.db.query(
      `SELECT to_jsonb(s) AS source, to_jsonb(c) AS chunk
       FROM legal_sources s
       JOIN legal_source_chunks c ON c.source_id = s.id AND c.id = $2
       WHERE s.id = $1 AND ${scoped.clauses.join(' AND ')}
       LIMIT 1`,
      scoped.params
    );
    if (!rows[0]) return null;
    return {
      source: { ...rows[0].source, origins: [] },
      chunk: rows[0].chunk,
    };
  }

  async getRelated(sourceId, accessScope, limit = 20) {
    const scoped = buildScopeAndFilters({ filters: {} }, accessScope, [sourceId]);
    scoped.params.push(limit);
    const limitParam = scoped.params.length;
    const { rows } = await this.db.query(
      `WITH requested AS (
         SELECT id, court, chamber, legal_domain FROM legal_sources WHERE id = $1
       ), candidates AS (
         SELECT r.related_source_id AS id, r.relation_type, 3 AS priority
         FROM legal_source_relations r WHERE r.source_id = $1
         UNION ALL
         SELECT citation.target_source_id AS id, 'CITES'::varchar AS relation_type, 2 AS priority
         FROM legal_source_citations citation
         WHERE citation.source_id = $1 AND citation.target_source_id IS NOT NULL
         UNION ALL
         SELECT other.id, 'RELATED'::varchar AS relation_type, 1 AS priority
         FROM legal_sources other
         CROSS JOIN requested
         WHERE other.id <> requested.id
           AND (
             (requested.legal_domain IS NOT NULL AND other.legal_domain = requested.legal_domain)
             OR (requested.court IS NOT NULL AND other.court = requested.court AND other.chamber IS NOT DISTINCT FROM requested.chamber)
           )
       )
       SELECT DISTINCT ON (s.id)
              s.id AS source_id, s.source_type, s.title, s.court, s.chamber,
              s.case_number, s.decision_number, s.decision_date,
              s.official_source, s.source_url, candidates.relation_type
       FROM candidates
       JOIN legal_sources s ON s.id = candidates.id
       JOIN LATERAL (
         SELECT NULL::varchar AS article_number, NULL::date AS effective_from, NULL::date AS effective_to
       ) c ON true
       WHERE ${scoped.clauses.join(' AND ')}
       ORDER BY s.id, candidates.priority DESC, s.official_source DESC
       LIMIT $${limitParam}`,
      scoped.params
    );
    return rows;
  }

  async getLegislationVersions(id, accessScope) {
    const organizationIds = accessScope.organizationIds || [];
    const userId = accessScope.userId || null;
    const { rows } = await this.db.query(
      `SELECT lv.id, lv.legislation_id, lv.legal_source_id, lv.version_label,
              lv.effective_from, lv.effective_to, lv.change_source,
              lv.official_gazette_date, lv.official_gazette_number,
              lv.source_url, lv.official_source, lv.previous_version_id,
              lv.next_version_id, lv.date_precision, lv.status, lv.metadata,
              l.law_name, l.law_no,
              coalesce(jsonb_agg(
                jsonb_build_object(
                  'id', av.id,
                  'articleNumber', av.article_number,
                  'articleTitle', av.article_title,
                  'articleText', av.article_text,
                  'effectiveFrom', av.effective_from,
                  'effectiveTo', av.effective_to,
                  'previousVersionId', av.previous_version_id,
                  'nextVersionId', av.next_version_id
                ) ORDER BY av.article_number
              ) FILTER (WHERE av.id IS NOT NULL), '[]'::jsonb) AS articles
       FROM legislation_versions lv
       JOIN legislation l ON l.id = lv.legislation_id
       JOIN legal_sources s ON s.id = lv.legal_source_id
       LEFT JOIN legislation_article_versions av ON av.legislation_version_id = lv.id
       WHERE (l.id = $1::uuid OR l.legal_source_id = $1::uuid)
         AND (
           s.visibility = 'PUBLIC'
           OR (s.visibility = 'ORGANIZATION' AND s.organization_id = ANY($2::uuid[]))
           OR (s.visibility = 'PERSONAL' AND s.owner_user_id = $3::uuid)
         )
       GROUP BY lv.id, l.id
       ORDER BY lv.effective_from DESC NULLS LAST, lv.created_at DESC`,
      [id, organizationIds, userId]
    );
    return rows;
  }

  async recordMetric(metric) {
    await this.db.query(
      `INSERT INTO legal_search_metrics (
         request_id, query_hash, query_length, normalized_term_count,
         duration_ms, full_text_ms, vector_search_ms, rerank_ms, result_count,
         embedding_provider, embedding_model, embedding_input_tokens,
         embedding_estimated_cost, cache_status, user_id, organization_id,
         case_id, corpus_version, success, safe_error_code
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
       )`,
      [
        metric.requestId || null,
        metric.queryHash,
        metric.queryLength,
        metric.normalizedTermCount,
        Math.round(metric.durationMs || 0),
        Math.round(metric.fullTextMs || 0),
        Math.round(metric.vectorSearchMs || 0),
        Math.round(metric.rerankMs || 0),
        metric.resultCount || 0,
        metric.embeddingProvider || null,
        metric.embeddingModel || null,
        metric.embeddingInputTokens || 0,
        metric.embeddingEstimatedCost || 0,
        metric.cacheStatus || 'BYPASS',
        metric.userId || null,
        metric.organizationId || null,
        metric.caseId || null,
        metric.corpusVersion || 1,
        metric.success !== false,
        metric.safeErrorCode || null,
      ]
    );
  }
}

module.exports = { LegalSearchRepository, buildScopeAndFilters, vectorLiteral };
