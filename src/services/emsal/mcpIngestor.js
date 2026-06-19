const { pool } = require('../../config/db');
const { generateEmbedding } = require('../../utils/embedding');
const yargiMcpClient = require('./yargiMcpClient');

const inFlightIndexes = new Set();

function parseMaybeJson(value) {
  if (!value || typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return value;
  }
}

function firstText(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function parseYearFromDate(dateText, fallbackYear) {
  if (Number.isInteger(fallbackYear)) return fallbackYear;
  if (!dateText) return new Date().getFullYear();
  const match = String(dateText).match(/(19|20)\d{2}/);
  return match ? parseInt(match[0], 10) : new Date().getFullYear();
}

function truncate(text, maxLength = 1200) {
  if (!text) return '';
  const normalized = String(text).replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
}

function getDocumentToolCall(decision) {
  const source = decision.source;
  const documentId = decision.document_id || decision.id;
  const url = decision.source_url || decision.url || documentId;

  if (!documentId && !url) return null;

  switch (source) {
    case 'bedesten':
    case 'yargitay_bedesten':
    case 'danistay_bedesten':
    case 'yerel_hukuk_bedesten':
    case 'istinaf_hukuk_bedesten':
    case 'kyb_bedesten':
      return { toolName: 'get_bedesten_document_markdown', args: { documentId: String(documentId) } };
    case 'emsal':
      return { toolName: 'get_emsal_document_markdown', args: { id: String(documentId) } };
    case 'kik':
      return { toolName: 'get_kik_v2_document_markdown', args: { gundemMaddesiId: String(documentId) } };
    case 'rekabet':
      return { toolName: 'get_rekabet_kurumu_document', args: { karar_id: String(documentId), page_number: 1 } };
    case 'kvkk':
      return { toolName: 'get_kvkk_document_markdown', args: { decision_url: String(url), page_number: 1 } };
    case 'bddk':
      return { toolName: 'get_bddk_document_markdown', args: { document_id: String(documentId), page_number: 1 } };
    case 'gib':
      return { toolName: 'get_gib_ozelge_document_markdown', args: { ozelge_id: parseInt(documentId, 10), page_number: 1 } };
    case 'sigorta_tahkim':
      return { toolName: 'get_sigorta_tahkim_document_markdown', args: { issue_number: String(documentId), page_number: 1 } };
    case 'sayistay':
      return {
        toolName: 'get_sayistay_document_unified',
        args: {
          decision_id: String(documentId),
          decision_type: decision.decision_type || 'daire',
        },
      };
    case 'anayasa':
      return { toolName: 'get_anayasa_document_unified', args: { document_url: String(url), page_number: 1 } };
    default:
      return null;
  }
}

function extractMarkdownContent(rawDocument) {
  const doc = parseMaybeJson(rawDocument);
  if (!doc) return '';

  if (typeof doc === 'string') return doc;

  return firstText(
    doc.markdown_content,
    doc.markdown_chunk,
    doc.text,
    doc.content,
    doc.document_data?.markdown_content,
    doc.document_data?.text,
    doc.document_data?.content
  );
}

async function fetchDecisionDocument(decision) {
  const toolCall = getDocumentToolCall(decision);
  if (!toolCall) return { text: '', raw: null, fetch_status: 'not_fetchable' };

  const raw = await yargiMcpClient.callTool(toolCall.toolName, toolCall.args);
  const parsed = parseMaybeJson(raw);
  const text = extractMarkdownContent(parsed);

  if (!text || /^ERROR/i.test(text)) {
    return { text: '', raw: parsed, fetch_status: 'fetch_failed' };
  }

  return { text, raw: parsed, fetch_status: 'fetched' };
}

async function insertDecision(decision, fullText, query, rawDocument = null) {
  const kararNo = firstText(decision.karar_no, decision.kararNo, decision.document_id, decision.id);
  const court = firstText(decision.court, decision.mahkeme, decision.source_label, 'Emsal Karar');
  const title = firstText(decision.title, decision.konu, query);
  const summary = truncate(firstText(decision.snippet, decision.ozet, fullText), 700);
  const hukukDali = firstText(decision.hukuk_dali, decision.source_label, court, 'Genel Hukuk');
  const kararYili = parseYearFromDate(decision.date || decision.karar_tarihi, decision.karar_yili);
  const source = firstText(decision.source, 'mcp');
  const sourceDocumentId = firstText(decision.document_id, decision.id, decision.source_url, kararNo);
  const sourceUrl = firstText(decision.source_url, decision.url);

  if (!kararNo || !fullText || !sourceDocumentId) return null;

  const existing = await pool.query(
    `SELECT id FROM emsal_kararlar
     WHERE (source = $1 AND source_document_id = $2)
        OR (karar_no = $3 AND mahkeme = $4)
     LIMIT 1`,
    [source, sourceDocumentId, kararNo, court]
  );
  if (existing.rows.length > 0) return existing.rows[0];

  let embeddingString = null;
  try {
    const embedding = await generateEmbedding(`${title}. ${summary} ${fullText.slice(0, 6000)}`);
    embeddingString = `[${embedding.join(',')}]`;
  } catch (error) {
    console.warn('[MCP Ingest] Embedding uretilemedi:', error.message);
  }

  const result = await pool.query(
    `INSERT INTO emsal_kararlar
      (karar_no, karar_yili, mahkeme, hukuk_dali, konu, ozet, metin, anahtar_kelimeler,
       source, source_document_id, source_url, verification_status, fetched_at, raw_payload, embedding)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'verified', CURRENT_TIMESTAMP, $12::jsonb, $13)
     ON CONFLICT (source, source_document_id) WHERE source_document_id IS NOT NULL
     DO UPDATE SET
       karar_no = EXCLUDED.karar_no,
       karar_yili = EXCLUDED.karar_yili,
       mahkeme = EXCLUDED.mahkeme,
       hukuk_dali = EXCLUDED.hukuk_dali,
       konu = EXCLUDED.konu,
       ozet = EXCLUDED.ozet,
       metin = EXCLUDED.metin,
       verification_status = 'verified',
       fetched_at = CURRENT_TIMESTAMP,
       raw_payload = EXCLUDED.raw_payload,
       embedding = COALESCE(EXCLUDED.embedding, emsal_kararlar.embedding)
     RETURNING id`,
    [
      kararNo,
      kararYili,
      court,
      hukukDali,
      title,
      summary,
      fullText,
      [query].filter(Boolean),
      source,
      sourceDocumentId,
      sourceUrl || null,
      JSON.stringify({ searchResult: decision, document: rawDocument }),
      embeddingString,
    ]
  );

  return result.rows[0] || null;
}

async function indexDecision(decision, query) {
  if (!decision || decision.source === 'local') return null;

  const key = `${decision.source}:${decision.document_id || decision.karar_no || decision.id || decision.title}`;
  if (!key || inFlightIndexes.has(key)) return null;

  inFlightIndexes.add(key);
  try {
    if (decision.metin) {
      return await insertDecision(decision, decision.metin, query, decision.raw || null);
    }

    const document = await fetchDecisionDocument(decision);
    if (!document.text) return null;
    return await insertDecision(decision, document.text, query, document.raw);
  } catch (error) {
    console.warn(`[MCP Ingest] ${key} indekslenemedi:`, error.message);
    return null;
  } finally {
    inFlightIndexes.delete(key);
  }
}

function indexDecisionsInBackground(decisions, query, maxDocuments = 5) {
  const candidates = decisions
    .filter((decision) => (
      decision.source !== 'local'
      && decision.fetch_status !== 'indexed'
      && decision.cache_status !== 'cached_mcp'
    ))
    .slice(0, maxDocuments);

  if (candidates.length === 0) return;

  Promise.allSettled(candidates.map((decision) => indexDecision(decision, query))).catch((error) => {
    console.warn('[MCP Ingest] Arka plan indeksleme hatasi:', error.message);
  });
}

async function hydrateDecisionsForRag(decisions, maxDocuments = 4) {
  const hydrated = [];

  for (const decision of decisions.slice(0, maxDocuments)) {
    if (decision.source === 'local' || decision.metin) {
      hydrated.push(decision);
      continue;
    }

    try {
      const document = await fetchDecisionDocument(decision);
      hydrated.push({
        ...decision,
        metin: document.text || decision.metin,
        fetch_status: document.fetch_status,
      });
    } catch (error) {
      hydrated.push({
        ...decision,
        fetch_status: 'fetch_failed',
        fetch_error: error.message,
      });
    }
  }

  return hydrated;
}

module.exports = {
  fetchDecisionDocument,
  hydrateDecisionsForRag,
  indexDecision,
  indexDecisionsInBackground,
};
