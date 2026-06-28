// Embeddings run in the isolated TEI service. The vulnerable in-process
// transformers runtime is intentionally excluded from the backend image.

function embeddingBaseUrl() {
  return String(
    process.env.EMBEDDING_BASE_URL
      || process.env.LEGAL_CORPUS_EMBEDDING_URL
      || 'http://localhost:8080'
  ).replace(/\/$/, '');
}

async function generateEmbedding(text) {
  const value = String(text || '').trim();
  if (!value) throw new Error('Embedding text cannot be empty.');

  const response = await fetch(`${embeddingBaseUrl()}/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs: [value.slice(0, 8000)] }),
    signal: AbortSignal.timeout(Number(process.env.EMBEDDING_TIMEOUT_MS || 30000)),
  });
  if (!response.ok) throw new Error(`Embedding service unavailable (${response.status}).`);
  const payload = await response.json();
  const first = Array.isArray(payload) ? payload[0] : payload?.embeddings?.[0] || payload?.data?.[0];
  const vector = Array.isArray(first) ? first : first?.embedding;
  if (!Array.isArray(vector) || vector.length === 0 || vector.some((item) => !Number.isFinite(Number(item)))) {
    throw new Error('Embedding service returned an invalid vector.');
  }
  return vector.map(Number);
}

async function shutdownEmbeddingWorker() {
  // Kept for backward compatibility; there is no in-process worker anymore.
}

module.exports = { generateEmbedding, shutdownEmbeddingWorker };
