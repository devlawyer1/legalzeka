const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { deterministicFindings, analysisSchema } = require('../../src/services/drafting/DraftAnalyzer');
const { safeFilename, citationLabel, DraftExportService } = require('../../src/services/drafting/DraftExportService');
const { assertAllowedIds, assertGroundedLegalText, parseStrict, planSchema } = require('../../src/services/drafting/DraftGenerator');
const { applyTemplateVariables } = require('../../src/services/drafting/DraftService');
const { applySuggestion } = require('../../src/services/drafting/DraftSuggestionService');
const { normalizeSections, plainTextFromSections } = require('../../src/services/drafting/DraftVersionService');

test('draft sections are normalized, bounded and uniquely keyed', () => {
  const sections = normalizeSections([
    { sectionKey: 'facts', title: 'Olaylar', content: 'Bir' },
    { sectionKey: 'facts', title: 'Tekrar', content: 'İki' },
  ]);
  assert.equal(sections[0].sectionKey, 'FACTS');
  assert.equal(sections[1].sectionKey, 'FACTS_2');
  assert.equal(sections[1].sortOrder, 1);
  assert.match(plainTextFromSections(sections), /Olaylar/);
});

test('template variables preserve and report missing Matter values', () => {
  const result = applyTemplateVariables('{{court_name}} - {{case_number}}', { court_name: 'Ankara İş Mahkemesi' });
  assert.equal(result.content, 'Ankara İş Mahkemesi - {{case_number}}');
  assert.deepEqual(result.missing, ['{{case_number}}']);
});

test('strict model parsing rejects markdown-wrapped JSON', () => {
  assert.throws(() => parseStrict('```json\n{}\n```', planSchema, 'INVALID'), /strict JSON/);
});

test('strict plan parsing rejects unknown fields', () => {
  assert.throws(() => parseStrict(JSON.stringify({ sections: [], missingInformation: [], warnings: [], extra: true }), planSchema, 'INVALID'));
});

test('section validation rejects hallucinated source IDs', () => {
  const allowed = crypto.randomUUID();
  const hallucinated = crypto.randomUUID();
  assert.throws(() => assertAllowedIds({ claims: [{ sourceIds: [hallucinated], evidenceIds: [] }] }, [allowed], []), (error) => error.code === 'UNKNOWN_SOURCE_ID');
});

test('section validation rejects evidence outside the Matter', () => {
  assert.throws(() => assertAllowedIds({ claims: [{ sourceIds: [], evidenceIds: [crypto.randomUUID()] }] }, [], []), (error) => error.code === 'UNKNOWN_EVIDENCE_ID');
});

test('AI legal grounds require a supplied source for every claim', () => {
  assert.throws(() => assertGroundedLegalText(
    { text: 'Fesih geçersizdir.', claims: [{ sourceIds: [] }] },
    { sectionKey: 'LEGAL_GROUNDS' }, [], { matter: { esas_no: '2026/42' } }
  ), (error) => error.code === 'UNSUPPORTED_AI_LEGAL_CLAIM');
});

test('AI cannot introduce an unsupplied decision number', () => {
  const sourceId = crypto.randomUUID();
  assert.throws(() => assertGroundedLegalText(
    { text: 'Yargıtay 2025/999 kararında açıklanmıştır.', claims: [{ sourceIds: [sourceId] }] },
    { sectionKey: 'LEGAL_GROUNDS' },
    [{ sourceId, caseNumber: '2024/10', decisionNumber: '2025/20' }],
    { matter: { esas_no: '2026/42' } }
  ), (error) => error.code === 'UNGROUNDED_LEGAL_IDENTITY');
});

test('unsupported legal grounds produce SOURCE_REQUIRED', () => {
  const result = deterministicFindings({
    sections: [{ sectionKey: 'LEGAL_GROUNDS', content: 'HMK hükümleri uygulanır.' }],
    citations: [], matrix: { claims: [] }, effectiveAt: null,
  });
  assert.ok(result.findings.some((item) => item.type === 'SOURCE_REQUIRED'));
});

test('claims without verified evidence produce EVIDENCE_REQUIRED', () => {
  const result = deterministicFindings({ sections: [], citations: [], matrix: { claims: [{ title: 'Fesih geçersizdir', missingEvidence: true, contradictingEvidence: [] }] } });
  assert.ok(result.findings.some((item) => item.type === 'EVIDENCE_REQUIRED'));
});

test('contradicting evidence is surfaced', () => {
  const evidenceId = crypto.randomUUID();
  const result = deterministicFindings({ sections: [], citations: [], matrix: { claims: [{ title: 'Ödeme yapılmadı', missingEvidence: false, contradictingEvidence: [{ evidence_id: evidenceId }] }] } });
  const finding = result.findings.find((item) => item.type === 'CONTRADICTION');
  assert.deepEqual(finding.evidenceIds, [evidenceId]);
});

test('deadline risks create structured calculation requirements without a result', () => {
  const result = deterministicFindings({ sections: [{ sectionKey: 'FACTS', content: 'Tebliğ süresi ve zamanaşımı incelenmelidir.' }], citations: [], matrix: { claims: [] } });
  assert.ok(result.calculationRequired.some((item) => item.kind === 'LIMITATION'));
  assert.ok(result.calculationRequired.some((item) => item.kind === 'DEADLINE'));
  assert.ok(result.calculationRequired.every((item) => !Object.hasOwn(item, 'result')));
});

test('historical legislation produces an outdated-source warning', () => {
  const sourceId = crypto.randomUUID();
  const result = deterministicFindings({
    sections: [], matrix: { claims: [] }, effectiveAt: '2026-01-01',
    citations: [{ section_key: 'LEGAL_GROUNDS', source_id: sourceId, effective_to: '2025-01-01' }],
  });
  assert.ok(result.findings.some((item) => item.sourceIds?.includes(sourceId)));
});

test('suggestions apply add, rewrite and remove deterministically', () => {
  const base = [{ sectionKey: 'FACTS', content: 'Eski metin' }];
  const rewritten = applySuggestion(base, { section_key: 'FACTS', suggestion_type: 'REWRITE', original_text: 'Eski', suggested_text: 'Yeni' });
  assert.equal(rewritten[0].content, 'Yeni metin');
  const added = applySuggestion(rewritten, { section_key: 'FACTS', suggestion_type: 'ADD', suggested_text: 'Ek' });
  assert.match(added[0].content, /Ek/);
  const removed = applySuggestion(added, { section_key: 'FACTS', suggestion_type: 'REMOVE', original_text: 'Ek' });
  assert.doesNotMatch(removed[0].content, /Ek/);
});

test('analysis schema rejects final calculation fields', () => {
  const value = {
    findings: [], missingInformation: [],
    calculationRequired: [{ kind: 'DEADLINE', sectionKey: 'FACTS', reason: 'Kontrol', knownInputs: {}, result: '14 gün' }],
    overallAssessment: { level: 'NEEDS_REVIEW', reason: 'Kontrol gerekli.' },
  };
  assert.equal(analysisSchema.safeParse(value).success, false);
});

test('export filenames and citation labels omit internal IDs', () => {
  assert.equal(safeFilename('Dava: 2026/1?', 'pdf'), 'Dava- 2026-1-.pdf');
  const label = citationLabel({ source_title: 'İş Kanunu', source_excerpt: 'Madde metni', id: crypto.randomUUID() }, 0);
  assert.doesNotMatch(label, /[0-9a-f]{8}-[0-9a-f-]{27}/i);
});

test('DOCX and PDF exporters produce valid signatures with Turkish text', async () => {
  const detail = {
    id: crypto.randomUUID(), title: 'İşe İade Dilekçesi', current_version_id: crypto.randomUUID(),
    sections: [{ sectionKey: 'FACTS', title: 'Açıklamalar', content: 'İşçi ölçülü bir açıklama sundu.' }],
    citations: [{ source_title: 'İş Kanunu', source_excerpt: 'Türkçe kaynak metni' }],
  };
  const service = new DraftExportService({ draftService: { async getDetail() { return detail; } } });
  const docx = await service.toDocx(detail.id, {});
  const pdf = await service.toPdf(detail.id, {});
  assert.equal(docx.buffer.subarray(0, 2).toString(), 'PK');
  assert.equal(pdf.buffer.subarray(0, 4).toString(), '%PDF');
  assert.ok(docx.buffer.length > 1000);
  assert.ok(pdf.buffer.length > 1000);
});
