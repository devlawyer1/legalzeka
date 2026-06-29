const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { parseLegalAnswer } = require('../../src/services/legalResearch/ClaimExtractor');
const { LegalAnswerGenerator } = require('../../src/services/legalResearch/LegalAnswerGenerator');
const { CitationVerifier } = require('../../src/services/legalResearch/CitationVerifier');
const {
  assignCitationOrders,
  historicalDifferenceWarnings,
} = require('../../src/services/legalResearch/LegalResearchService');

const sourceId = crypto.randomUUID();
const chunkId = crypto.randomUUID();

function validPayload(overrides = {}) {
  return {
    summary: 'Kısa cevap',
    analysis: [{
      claimKey: 'claim-1',
      text: 'Altı aylık kıdem şartı aranır.',
      sourceIds: [sourceId],
      counterSourceIds: [],
    }],
    counterArguments: [],
    missingInformation: [],
    warnings: [],
    confidence: { level: 'MEDIUM', reason: 'Somut olay ayrıntıları sınırlıdır.' },
    ...overrides,
  };
}

test('strict legal answer accepts only source IDs supplied to the model', () => {
  const parsed = parseLegalAnswer(JSON.stringify(validPayload()), [sourceId]);
  assert.equal(parsed.analysis[0].sourceIds[0], sourceId);
  assert.throws(
    () => parseLegalAnswer(JSON.stringify(validPayload({
      analysis: [{
        claimKey: 'claim-1',
        text: 'Uydurma kaynaklı iddia.',
        sourceIds: [crypto.randomUUID()],
        counterSourceIds: [],
      }],
    })), [sourceId]),
    (error) => error.code === 'UNKNOWN_SOURCE_ID'
  );
});

test('strict legal answer rejects uncited legal claims and markdown-wrapped JSON', () => {
  assert.throws(() => parseLegalAnswer(JSON.stringify(validPayload({
    analysis: [{ claimKey: 'claim-1', text: 'Kaynaksız iddia.', sourceIds: [], counterSourceIds: [] }],
  })), [sourceId]));
  assert.throws(
    () => parseLegalAnswer(`\`\`\`json\n${JSON.stringify(validPayload())}\n\`\`\``, [sourceId]),
    (error) => error.code === 'INVALID_RESEARCH_JSON'
  );
});

test('answer generator rejects hallucinated IDs without a paid provider call', async () => {
  const generator = new LegalAnswerGenerator({
    maxAttempts: 2,
    llm: {
      async chatWithUsage() {
        return {
          text: JSON.stringify(validPayload({
            analysis: [{
              claimKey: 'claim-1',
              text: 'Uydurma iddia.',
              sourceIds: [crypto.randomUUID()],
              counterSourceIds: [],
            }],
          })),
          provider: 'fake',
          model: 'fake-research',
          inputTokens: 10,
          outputTokens: 10,
          estimatedCost: 0,
        };
      },
    },
  });
  await assert.rejects(
    () => generator.generate({
      question: 'Soru',
      sources: [{ sourceId, chunkId, excerpt: 'Kaynak metni', supportHint: 'SUPPORTS' }],
    }),
    (error) => error.code === 'UNKNOWN_SOURCE_ID'
  );
});

test('citation verifier requires accessible source, matching chunk and grounded excerpt', async () => {
  const source = {
    id: sourceId,
    source_type: 'COURT_DECISION',
    title: 'Yargıtay kararı',
    effective_from: null,
    effective_to: null,
    origins: [],
    chunks: [{
      id: chunkId,
      content: 'Altı aylık kıdem şartı iş sözleşmesinin feshi tarihinde değerlendirilir.',
      heading: 'Gerekçe',
      chunk_type: 'REASONING',
    }],
  };
  const verifier = new CitationVerifier({ repository: { async getSource() { return source; } } });
  const verified = await verifier.verify({
    claimKey: 'claim-1',
    claimText: 'Altı aylık kıdem şartı fesih tarihinde değerlendirilir.',
    sourceId,
    supportType: 'SUPPORTS',
    candidate: { chunkId, excerpt: 'Altı aylık kıdem şartı' },
    accessScope: {},
  });
  assert.equal(verified.verificationStatus, 'VERIFIED');
  assert.equal(verified.sourceExcerpt, 'Altı aylık kıdem şartı');

  const wrongChunk = await verifier.verify({
    claimKey: 'claim-1',
    claimText: 'Altı aylık kıdem şartı.',
    sourceId,
    supportType: 'SUPPORTS',
    candidate: { chunkId: crypto.randomUUID(), excerpt: 'Altı aylık kıdem şartı' },
    accessScope: {},
  });
  assert.equal(wrongChunk.reason, 'CHUNK_SOURCE_MISMATCH');

  const fabricatedExcerpt = await verifier.verify({
    claimKey: 'claim-1',
    claimText: 'Altı aylık kıdem şartı.',
    sourceId,
    supportType: 'SUPPORTS',
    candidate: { chunkId, excerpt: 'Kaynakta bulunmayan alıntı' },
    accessScope: {},
  });
  assert.equal(fabricatedExcerpt.reason, 'EXCERPT_NOT_GROUNDED');
});

test('citation verifier rejects legislation outside requested effective date', async () => {
  const verifier = new CitationVerifier({
    repository: {
      async getSource() {
        return {
          id: sourceId,
          source_type: 'LEGISLATION_VERSION',
          title: 'Tarihsel kanun',
          effective_from: '2020-01-01',
          effective_to: '2022-01-01',
          origins: [],
          chunks: [{
            id: chunkId,
            content: 'Tarihsel mevzuat hükmü.',
            chunk_type: 'LEGISLATION_ARTICLE',
            effective_from: '2020-01-01',
            effective_to: '2022-01-01',
          }],
        };
      },
    },
  });
  const result = await verifier.verify({
    claimKey: 'claim-1',
    claimText: 'Tarihsel mevzuat hükmü.',
    sourceId,
    supportType: 'SUPPORTS',
    candidate: { chunkId, excerpt: 'Tarihsel mevzuat hükmü.' },
    accessScope: {},
    effectiveAt: '2023-01-01',
  });
  assert.equal(result.reason, 'VERSION_NOT_EFFECTIVE');
});

test('historical legislation changes produce an explicit warning', () => {
  const warnings = historicalDifferenceWarnings([
    {
      sourceId: 'old',
      sourceType: 'LEGISLATION_VERSION',
      title: 'İş Kanunu',
      articleNumber: '18',
      excerpt: 'Eski metin',
      metadata: { lawNumber: '4857' },
    },
  ], [
    {
      sourceId: 'current',
      sourceType: 'LEGISLATION_VERSION',
      title: 'İş Kanunu',
      articleNumber: '18',
      excerpt: 'Yeni metin',
      metadata: { lawNumber: '4857' },
    },
  ], '2021-01-01');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /güncel metinden farklıdır/);
});

test('citation numbers are stable for repeated source chunks', () => {
  const citations = [
    { sourceId, chunkId, verificationStatus: 'VERIFIED' },
    { sourceId, chunkId, verificationStatus: 'PARTIAL' },
    { sourceId: crypto.randomUUID(), chunkId: crypto.randomUUID(), verificationStatus: 'REJECTED' },
  ];
  const order = assignCitationOrders(citations);
  assert.equal(order.get(`${sourceId}|${chunkId}`), 1);
  assert.equal(citations[0].citationOrder, 1);
  assert.equal(citations[1].citationOrder, 1);
  assert.equal(citations[2].citationOrder, 2);
});
