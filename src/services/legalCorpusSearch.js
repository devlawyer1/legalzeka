const axios = require('axios');
const { pool } = require('../config/db');

const LEGAL_CORPUS_ENABLED = process.env.LEGAL_CORPUS_ENABLED !== 'false';
const LEGAL_CORPUS_SEMANTIC_ENABLED = process.env.LEGAL_CORPUS_SEMANTIC_ENABLED === 'true';
const LEGAL_CORPUS_EMBEDDING_URL = process.env.LEGAL_CORPUS_EMBEDDING_URL || 'http://embedding:80';

function normalizeForMatch(value) {
  return String(value || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, ' ')
    .trim();
}

function parsePositiveInt(value, fallback, maxValue = 100) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maxValue);
}

function truncate(text, maxLength = 900) {
  if (!text) return '';
  const normalized = String(text).replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
}

function dateToYear(dateValue) {
  if (!dateValue) return null;
  const match = String(dateValue).match(/(19|20)\d{2}/);
  return match ? parseInt(match[0], 10) : null;
}

function isoDate(dateValue) {
  if (!dateValue) return null;
  if (dateValue instanceof Date) return dateValue.toISOString().slice(0, 10);
  return String(dateValue).slice(0, 10);
}

function vectorLiteral(vector) {
  return `[${vector.map((value) => Number(value).toFixed(8)).join(',')}]`;
}

async function embedQuery(query) {
  const response = await axios.post(
    `${LEGAL_CORPUS_EMBEDDING_URL.replace(/\/$/, '')}/embed`,
    { inputs: [`query: ${query}`] },
    { timeout: 60000 }
  );

  let payload = response.data;
  if (payload && !Array.isArray(payload)) {
    payload = payload.embeddings || payload.data || [];
  }
  const first = Array.isArray(payload) ? payload[0] : null;
  const embedding = first && !Array.isArray(first) ? first.embedding : first;
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error('Legal corpus embedding response is empty.');
  }
  return embedding;
}

function buildDecisionFilter(filters = {}, startParam = 2) {
  const clauses = [];
  const params = [];
  let index = startParam;

  if (filters.mahkeme) {
    const courtPattern = `%${filters.mahkeme}%`;
    clauses.push(`(d.court ILIKE $${index} OR d.chamber ILIKE $${index})`);
    params.push(courtPattern);
    index += 1;
  }
  if (filters.yilMin) {
    clauses.push(`d.decision_date >= $${index}`);
    params.push(`${parseInt(filters.yilMin, 10)}-01-01`);
    index += 1;
  }
  if (filters.yilMax) {
    clauses.push(`d.decision_date <= $${index}`);
    params.push(`${parseInt(filters.yilMax, 10)}-12-31`);
    index += 1;
  }

  return { clauses, params, nextParam: index };
}

function shouldIncludeLegislation(filters = {}) {
  if (!filters.mahkeme) return true;
  const normalized = normalizeForMatch(filters.mahkeme);
  return ['mevzuat', 'kanun', 'yasa'].some((term) => normalized.includes(term));
}

function normalizeCorpusRow(row, retrievalType, query) {
  const score = Number(row.score || 0);
  const isLegislation = row.result_type === 'legislation';
  const snippet = truncate(row.chunk_text, 900);
  const documentId = isLegislation
    ? `${row.source_doc_id || row.doc_id}#madde-${row.madde_no || row.karar_no || 'full'}`
    : (row.source_doc_id || row.doc_id);
  const source = isLegislation ? 'mevzuat' : (row.source || 'legal_corpus');
  const sourceLabel = isLegislation ? 'Mevzuat' : (row.source_label || row.source || 'Legal Corpus');
  const court = isLegislation ? row.law_name : row.court;
  const chamber = isLegislation ? row.law_no : row.chamber;
  const title = isLegislation
    ? `${row.law_name || 'Mevzuat'}${row.madde_no ? ` m. ${row.madde_no}` : ''}`
    : [row.court, row.chamber, row.esas_no, row.karar_no].filter(Boolean).join(' ');

  return {
    id: documentId,
    type: row.result_type,
    source,
    source_label: sourceLabel,
    court,
    mahkeme: court,
    chamber,
    hukuk_dali: isLegislation ? 'Mevzuat' : (row.source_label || row.source || 'Ictihat'),
    konu: title || query,
    ozet: snippet,
    snippet,
    metin: row.chunk_text || '',
    date: isoDate(row.decision_date || row.rg_date),
    karar_yili: dateToYear(row.decision_date || row.rg_date),
    esas_no: row.esas_no || null,
    karar_no: isLegislation ? (row.madde_no || null) : (row.karar_no || null),
    document_id: documentId,
    source_document_id: row.source_doc_id || null,
    source_url: null,
    fetch_status: 'indexed',
    cache_status: 'legal_corpus',
    relevance_verified: true,
    confidence: Math.min(0.95, Math.max(0.55, score || 0.62)),
    score,
    score_breakdown: {
      [retrievalType]: score,
    },
    highlights: {},
  };
}

async function corpusKeywordSearch(query, filters, limit) {
  const decisionFilter = buildDecisionFilter(filters, 2);
  const includeLegislation = shouldIncludeLegislation(filters);
  const params = [query, ...decisionFilter.params];
  const nextParam = decisionFilter.nextParam;
  const decisionWhere = [`c.tsv @@ websearch_to_tsquery('turkish', $1)`, ...decisionFilter.clauses].join(' AND ');

  const legislationSql = includeLegislation ? `
    UNION ALL
    SELECT 'legislation' AS result_type,
           l.id::text AS doc_id,
           'mevzuat' AS source,
           'Mevzuat' AS source_label,
           l.law_name,
           l.law_no,
           l.rg_date,
           NULL AS court,
           NULL AS chamber,
           NULL AS esas_no,
           NULL AS karar_no,
           a.madde_no,
           a.madde_text AS chunk_text,
           l.source_doc_id,
           ts_rank(a.tsv, websearch_to_tsquery('turkish', $1)) AS score
    FROM legislation_articles a
    JOIN legislation l ON l.id = a.legislation_id
    WHERE a.tsv @@ websearch_to_tsquery('turkish', $1)
  ` : '';

  const result = await pool.query(
    `
    SELECT *
    FROM (
      SELECT 'decision' AS result_type,
             d.id::text AS doc_id,
             d.source,
             d.source AS source_label,
             NULL AS law_name,
             NULL AS law_no,
             NULL AS rg_date,
             d.court,
             d.chamber,
             d.esas_no,
             d.karar_no,
             NULL AS madde_no,
             c.chunk_text,
             d.source_doc_id,
             ts_rank(c.tsv, websearch_to_tsquery('turkish', $1)) AS score
      FROM decision_chunks c
      JOIN decisions d ON d.id = c.decision_id
      WHERE ${decisionWhere}
      ${legislationSql}
    ) corpus
    ORDER BY score DESC
    LIMIT $${nextParam}
    `,
    [...params, limit]
  );

  return result.rows.map((row) => normalizeCorpusRow(row, 'legal_corpus_fts', query));
}

async function corpusVectorSearch(query, filters, limit) {
  if (!LEGAL_CORPUS_SEMANTIC_ENABLED) return [];

  const queryVector = vectorLiteral(await embedQuery(query));
  const decisionFilter = buildDecisionFilter(filters, 2);
  const includeLegislation = shouldIncludeLegislation(filters);
  const params = [queryVector, ...decisionFilter.params];
  const nextParam = decisionFilter.nextParam;
  const decisionWhere = [`c.embedding IS NOT NULL`, ...decisionFilter.clauses].join(' AND ');

  const legislationSql = includeLegislation ? `
    UNION ALL
    SELECT 'legislation' AS result_type,
           l.id::text AS doc_id,
           'mevzuat' AS source,
           'Mevzuat' AS source_label,
           l.law_name,
           l.law_no,
           l.rg_date,
           NULL AS court,
           NULL AS chamber,
           NULL AS esas_no,
           NULL AS karar_no,
           a.madde_no,
           a.madde_text AS chunk_text,
           l.source_doc_id,
           1 - (a.embedding <=> $1::vector) AS score
    FROM legislation_articles a
    JOIN legislation l ON l.id = a.legislation_id
    WHERE a.embedding IS NOT NULL
  ` : '';

  const result = await pool.query(
    `
    SELECT *
    FROM (
      SELECT 'decision' AS result_type,
             d.id::text AS doc_id,
             d.source,
             d.source AS source_label,
             NULL AS law_name,
             NULL AS law_no,
             NULL AS rg_date,
             d.court,
             d.chamber,
             d.esas_no,
             d.karar_no,
             NULL AS madde_no,
             c.chunk_text,
             d.source_doc_id,
             1 - (c.embedding <=> $1::vector) AS score
      FROM decision_chunks c
      JOIN decisions d ON d.id = c.decision_id
      WHERE ${decisionWhere}
      ${legislationSql}
    ) corpus
    ORDER BY score DESC
    LIMIT $${nextParam}
    `,
    [...params, limit]
  );

  return result.rows.map((row) => normalizeCorpusRow(row, 'legal_corpus_vector', query));
}

async function searchLegalCorpus({
  query,
  mode = 'keyword',
  filters = {},
  limit = 30,
} = {}) {
  if (!LEGAL_CORPUS_ENABLED) {
    return { results: [], diagnostics: { enabled: false } };
  }

  const safeLimit = parsePositiveInt(limit, 30, 200);
  const [keywordResult, vectorResult] = await Promise.allSettled([
    corpusKeywordSearch(query, filters, safeLimit),
    mode === 'keyword' ? Promise.resolve([]) : corpusVectorSearch(query, filters, safeLimit),
  ]);

  const keyword = keywordResult.status === 'fulfilled' ? keywordResult.value : [];
  const vector = vectorResult.status === 'fulfilled' ? vectorResult.value : [];

  return {
    results: [...keyword, ...vector],
    diagnostics: {
      enabled: true,
      keyword_count: keyword.length,
      vector_count: vector.length,
      keyword_error: keywordResult.status === 'rejected' ? keywordResult.reason.message : null,
      vector_error: vectorResult.status === 'rejected' ? vectorResult.reason.message : null,
      semantic_enabled: LEGAL_CORPUS_SEMANTIC_ENABLED,
    },
  };
}

module.exports = {
  searchLegalCorpus,
};
