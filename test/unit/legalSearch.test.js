const test = require('node:test');
const assert = require('node:assert/strict');

const {
  decisionCanonicalKey,
  normalizeTurkish,
} = require('../../src/services/legalSearch/normalization');
const {
  extractLegalCitations,
  structuralChunk,
} = require('../../src/services/legalSearch/structuralChunker');
const { LegalSearchCache } = require('../../src/services/legalSearch/searchCache');
const {
  groundedExcerpt,
  mergeWithRrf,
  parseSearchRequest,
} = require('../../src/services/legalSearch/hybridLegalSearchService');

test('legal structural chunking preserves decision sections and legislation articles', () => {
  const chunks = structuralChunk(`OLAYLAR
İşçi 2018 yılında çalışmaya başladı.

GEREKÇE
Fazla çalışma yazılı delillerle ispatlandı.

HÜKÜM
Davanın kabulüne karar verildi.`);

  assert.deepEqual(chunks.map((chunk) => chunk.type), ['FACTS', 'REASONING', 'RULING']);
  assert.equal(chunks[1].content.includes('Fazla çalışma'), true);

  const article = structuralChunk('MADDE 18 - Otuz veya daha fazla işçi çalıştıran işveren...');
  assert.equal(article[0].type, 'LEGISLATION_ARTICLE');
  assert.equal(article[0].articleNumber, '18');
});

test('citation extraction identifies law and article without inventing text', () => {
  const text = 'Uyuşmazlıkta 4857 sayılı İş Kanunu 18. maddesi uygulanır.';
  const citations = extractLegalCitations(text);
  assert.equal(citations.length, 1);
  assert.equal(citations[0].lawNumber, '4857');
  assert.equal(citations[0].articleNumber, '18');
  assert.equal(text.includes(citations[0].citationText), true);
});

test('decision canonical identity ignores provider URL while preserving legal identity', () => {
  const base = {
    court: 'Yargıtay',
    chamber: '9. Hukuk Dairesi',
    caseNumber: '2024/10',
    decisionNumber: '2025/20',
    decisionDate: '2025-01-10',
    content: 'Karar metni',
  };
  assert.equal(
    decisionCanonicalKey({ ...base, sourceUrl: 'https://one.test' }),
    decisionCanonicalKey({ ...base, sourceUrl: 'https://two.test' })
  );
  assert.equal(normalizeTurkish('  İŞE   İADE '), 'işe iade');
});

test('grounded excerpt is an exact substring of source content', () => {
  const content = `${'Başlangıç metni. '.repeat(80)}Altı aylık kıdem şartı somut olayda gerçekleşmiştir.${' Son bölüm.'.repeat(80)}`;
  const excerpt = groundedExcerpt(content, 'altı aylık kıdem şartı', 220);
  assert.equal(content.includes(excerpt), true);
  assert.equal(excerpt.includes('Altı aylık kıdem şartı'), true);
});

test('hybrid RRF exposes measurable keyword, semantic, rerank and final scores', () => {
  const shared = {
    source_id: 'source-a',
    source_type: 'COURT_DECISION',
    title: 'Yargıtay kararı',
    official_source: true,
    chunk_content: 'Fazla çalışma ücretinin ispatı gerekir.',
    chunk_type: 'REASONING',
  };
  const ranked = mergeWithRrf(
    [{ ...shared, chunk_id: 'chunk-a', keyword_score: 0.8 }],
    [{ ...shared, chunk_id: 'chunk-a', semantic_score: 0.9 }],
    (items) => items.map((item) => ({ ...item, rerank_score: 0.85 })),
    { query: 'fazla çalışma ispatı' }
  );
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].keywordScore > 0, true);
  assert.equal(ranked[0].semanticScore, 0.9);
  assert.equal(ranked[0].rerankScore, 0.85);
  assert.equal(ranked[0].finalScore > 0 && ranked[0].finalScore <= 1, true);
});

test('search validation enforces query and pagination limits', () => {
  assert.throws(() => parseSearchRequest({ query: '', pageSize: 20 }));
  assert.throws(() => parseSearchRequest({ query: 'geçerli sorgu', pageSize: 51 }));
  const parsed = parseSearchRequest({ query: '  İşe   iade ', page: 2, pageSize: 10 });
  assert.equal(parsed.normalizedQuery, 'işe iade');
  assert.equal(parsed.page, 2);
});

test('cache keys separate tenants and changing Matter Twin context', () => {
  const cache = new LegalSearchCache();
  const request = parseSearchRequest({ query: 'işe iade', page: 1, pageSize: 20 });
  const common = { request, corpusVersion: 7 };
  const firmA = cache.createKey({
    ...common,
    accessScope: { userId: 'user-a', organizationIds: ['firm-a'] },
    caseContext: { id: 'case-a', legalDomain: 'İş Hukuku', events: [{ title: 'Fesih' }] },
  });
  const firmB = cache.createKey({
    ...common,
    accessScope: { userId: 'user-b', organizationIds: ['firm-b'] },
    caseContext: { id: 'case-b', legalDomain: 'İş Hukuku', events: [{ title: 'Fesih' }] },
  });
  const changedMatter = cache.createKey({
    ...common,
    accessScope: { userId: 'user-a', organizationIds: ['firm-a'] },
    caseContext: { id: 'case-a', legalDomain: 'İş Hukuku', events: [{ title: 'İşe iade talebi' }] },
  });
  assert.notEqual(firmA, firmB);
  assert.notEqual(firmA, changedMatter);
});
