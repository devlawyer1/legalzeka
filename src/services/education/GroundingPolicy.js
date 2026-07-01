const { educationError } = require('./EducationAccessService');

const IDENTIFIER_PATTERNS = [
  /\b\d{4}\s*\/\s*\d{1,10}\b/g,
  /\b(?:madde|m\.)\s*\d+[a-zA-Z]?\b/gi,
];

function legalIdentifiers(text) {
  return [...new Set(IDENTIFIER_PATTERNS.flatMap((pattern) => String(text || '').match(pattern) || []).map((value) => value.replace(/\s+/g, '').toLocaleLowerCase('tr-TR')))];
}

function assertNoInventedIdentifiers(text, sources) {
  const corpus = (sources || []).map((source) => [
    source.title, source.court, source.case_number, source.decision_number,
    source.content, source.chunk_content, JSON.stringify(source.metadata || {}),
  ].filter(Boolean).join(' ')).join(' ');
  const allowed = new Set(legalIdentifiers(corpus));
  const invented = legalIdentifiers(text).filter((identifier) => !allowed.has(identifier));
  if (invented.length) {
    throw educationError('Generated content contains a legal identifier that is absent from its sources.', 422, 'UNSUPPORTED_LEGAL_IDENTIFIER');
  }
  return true;
}

module.exports = { assertNoInventedIdentifiers, legalIdentifiers };
