const crypto = require('crypto');

const SOURCE_TYPES = Object.freeze([
  'LEGISLATION',
  'LEGISLATION_VERSION',
  'COURT_DECISION',
  'CONSTITUTIONAL_COURT_DECISION',
  'ADMINISTRATIVE_DECISION',
  'ECHR_DECISION',
]);

const TURKISH_STOP_WORDS = new Set([
  'acaba', 'ama', 'ancak', 'bir', 'bu', 'da', 'daha', 'de', 'en', 'gibi', 'icin',
  'ile', 'ise', 'mi', 'mu', 'mü', 'mı', 'olan', 'olarak', 've', 'veya', 'ya',
]);

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function normalizeTurkish(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase('tr-TR')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeTurkish(value) {
  return normalizeTurkish(value)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 1 && !TURKISH_STOP_WORDS.has(token));
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableValue(value[key])])
  );
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function decisionCanonicalKey(record) {
  const identity = [
    normalizeTurkish(record.court),
    normalizeTurkish(record.chamber),
    normalizeTurkish(record.caseNumber || record.esasNo),
    normalizeTurkish(record.decisionNumber || record.kararNo),
    String(record.decisionDate || '').slice(0, 10),
  ];
  const hasLegalIdentity = identity.slice(2).some(Boolean);
  return sha256(
    hasLegalIdentity
      ? ['decision', ...identity].join('|')
      : ['decision-content', sha256(record.content || record.rawText)].join('|')
  );
}

function legislationCanonicalKey(record) {
  return sha256([
    'legislation',
    normalizeTurkish(record.lawNumber || record.lawNo),
    normalizeTurkish(record.externalId || record.sourceDocumentId || record.title),
  ].join('|'));
}

function sourceTypeForProvider(sourceName, fallback = 'COURT_DECISION') {
  const normalized = normalizeTurkish(sourceName);
  if (normalized.includes('aym')) return 'CONSTITUTIONAL_COURT_DECISION';
  if (normalized.includes('danistay') || normalized.includes('danıştay')) {
    return 'ADMINISTRATIVE_DECISION';
  }
  if (normalized.includes('echr') || normalized.includes('aihm')) return 'ECHR_DECISION';
  return SOURCE_TYPES.includes(fallback) ? fallback : 'COURT_DECISION';
}

module.exports = {
  SOURCE_TYPES,
  decisionCanonicalKey,
  legislationCanonicalKey,
  normalizeTurkish,
  sha256,
  sourceTypeForProvider,
  stableStringify,
  tokenizeTurkish,
};
