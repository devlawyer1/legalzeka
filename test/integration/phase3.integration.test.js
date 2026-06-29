const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const { getTestDatabaseUrl } = require('../helpers/testDatabase');

const databaseUrl = getTestDatabaseUrl();
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = databaseUrl;
process.env.JWT_SECRET = 'phase3-integration-only-secret';
process.env.JWT_EXPIRES_IN = '15m';
process.env.LEGAL_CORPUS_ENABLED = 'true';
process.env.LEGAL_CORPUS_SEMANTIC_ENABLED = 'false';
process.env.DRAFT_AI_RATE_LIMIT_MAX = '200';

const { migrate } = require('../../src/utils/migrate');
const { pool: appPool } = require('../../src/config/db');
const { LegalSearchRepository } = require('../../src/services/legalSearch/legalSearchRepository');
const { createDraftingServices, setDraftingServicesForTests } = require('../../src/services/drafting');
const { deterministicFindings } = require('../../src/services/drafting/DraftAnalyzer');
const app = require('../../src/app');

const adminPool = new Pool({ connectionString: databaseUrl });
const silentLogger = { log() {} };

async function resetDatabase() {
  await adminPool.query('DROP SCHEMA IF EXISTS public CASCADE');
  await adminPool.query('CREATE SCHEMA public');
  await migrate({ dbPool: adminPool, logger: silentLogger });
}

async function seedUser(email) {
  const id = crypto.randomUUID();
  const role = await adminPool.query("SELECT id FROM roles WHERE role_name = 'Users'");
  await adminPool.query(
    `INSERT INTO users (id, role_id, first_name, last_name, email, password_hash, is_active)
     VALUES ($1, $2, 'Phase', 'Three', $3, 'unused', true)`,
    [id, role.rows[0].id, email]
  );
  return id;
}

async function seedFirm(ownerId, name) {
  const id = crypto.randomUUID();
  await adminPool.query('INSERT INTO law_firms (id, name, owner_id, is_active) VALUES ($1, $2, $3, true)', [id, name, ownerId]);
  await adminPool.query("INSERT INTO firm_users (firm_id, user_id, firm_role, is_active) VALUES ($1, $2, 'kurucu', true)", [id, ownerId]);
  return id;
}

async function seedCase({ ownerId = null, firmId = null, title }) {
  const id = crypto.randomUUID();
  if (firmId) {
    await adminPool.query(
      `INSERT INTO cases (id, firm_id, law_firm_id, scope_type, konu, esas_no, mahkeme, legal_domain, is_active)
       VALUES ($1, $2, $2, 'ORGANIZATION', $3, '2026/42', 'Ankara İş Mahkemesi', 'İş Hukuku', true)`,
      [id, firmId, title]
    );
  } else {
    await adminPool.query(
      `INSERT INTO cases (id, scope_type, owner_user_id, konu, esas_no, mahkeme, legal_domain, is_active)
       VALUES ($1, 'PERSONAL', $2, $3, '2026/43', 'Ankara İş Mahkemesi', 'İş Hukuku', true)`,
      [id, ownerId, title]
    );
  }
  return id;
}

async function seedSource({ visibility = 'PUBLIC', organizationId = null, title = 'İş Kanunu', effectiveTo = null }) {
  const sourceId = crypto.randomUUID();
  const chunkId = crypto.randomUUID();
  const content = `${title} uyarınca iş güvencesi ve fesih denetimi uygulanır.`;
  await adminPool.query(
    `INSERT INTO legal_sources (
       id, source_type, title, effective_from, effective_to, content, content_hash,
       canonical_key, visibility, organization_id, official_source
     ) VALUES ($1, 'LEGISLATION_VERSION', $2, '2020-01-01', $3, $4, $5, $6, $7, $8, true)`,
    [sourceId, title, effectiveTo, content, crypto.createHash('sha256').update(content).digest('hex'), crypto.createHash('sha256').update(`${title}-${sourceId}`).digest('hex'), visibility, organizationId]
  );
  await adminPool.query(
    `INSERT INTO legal_source_chunks (
       id, source_id, chunk_type, chunk_index, heading, content, content_hash,
       chunk_fingerprint, article_number, effective_from, effective_to
     ) VALUES ($1, $2, 'LEGISLATION_ARTICLE', 0, 'Madde 18', $3, $4, $5, '18', '2020-01-01', $6)`,
    [chunkId, sourceId, content, crypto.createHash('sha256').update(content).digest('hex'), crypto.createHash('sha256').update(`${sourceId}-0`).digest('hex'), effectiveTo]
  );
  return { sourceId, chunkId, content, title, effectiveTo };
}

function context(userId, organizations = []) {
  return {
    userId,
    isSystemAdmin: false,
    memberships: organizations.map((lawFirmId) => ({ lawFirmId, canRead: true, canWrite: true, canAdmin: true })),
  };
}

function token(userId) {
  return jwt.sign({ userId, role: 'Users' }, process.env.JWT_SECRET, { expiresIn: '15m' });
}

async function api(baseUrl, endpoint, { auth, method = 'GET', body } = {}) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers: {
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : Buffer.from(await response.arrayBuffer());
  return { response, data };
}

async function insertSuggestion(draft, values = {}) {
  const { rows } = await adminPool.query(
    `INSERT INTO draft_ai_suggestions (
       draft_id, draft_version_id, section_key, suggestion_type, original_text,
       suggested_text, reason, source_ids, evidence_ids
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [
      draft.id, draft.current_version_id, values.sectionKey || 'FACTS', values.type || 'REWRITE',
      values.originalText ?? 'İlk olay metni', values.suggestedText ?? 'Güncellenmiş olay metni',
      values.reason || 'Test önerisi', values.sourceIds || [], values.evidenceIds || [],
    ]
  );
  return rows[0];
}

test('Phase 3 immutable Draft Studio, grounded citations and evidence matrix', async (t) => {
  let server;
  let baseUrl;
  let services;
  let userA;
  let userB;
  let firmA;
  let firmB;
  let caseA;
  let caseB;
  let personalA;
  let personalB;
  let publicSource;
  let privateSourceB;
  let oldSource;
  let personalDraft;
  let organizationDraft;
  let otherDraft;
  let evidenceA;
  let evidenceB;
  let claimA;

  t.after(async () => {
    setDraftingServicesForTests(null);
    await new Promise((resolve) => server?.close(resolve) || resolve());
    await appPool.end();
    await adminPool.end();
  });

  await resetDatabase();
  userA = await seedUser('phase3-a@example.test');
  userB = await seedUser('phase3-b@example.test');
  firmA = await seedFirm(userA, 'Phase 3 Firm A');
  firmB = await seedFirm(userB, 'Phase 3 Firm B');
  caseA = await seedCase({ firmId: firmA, title: 'İşe iade dosyası' });
  caseB = await seedCase({ firmId: firmB, title: 'Başka büro dosyası' });
  personalA = await seedCase({ ownerId: userA, title: 'A kişisel dosyası' });
  personalB = await seedCase({ ownerId: userB, title: 'B kişisel dosyası' });
  publicSource = await seedSource({ title: '4857 sayılı İş Kanunu' });
  privateSourceB = await seedSource({ title: 'B Bürosu İç Kaynağı', visibility: 'ORGANIZATION', organizationId: firmB });
  oldSource = await seedSource({ title: 'Eski İş Kanunu Sürümü', effectiveTo: '2024-01-01' });

  const fakeLlm = {
    async chatWithUsage({ systemPrompt, userMessage }) {
      const payload = JSON.parse(userMessage);
      let output;
      if (systemPrompt.includes('drafting planner')) {
        output = { sections: [{ sectionKey: 'FACTS', purpose: 'Olayları kronolojik açıkla', requiredClaims: [], requiredEvidence: [] }], missingInformation: [], warnings: [] };
      } else if (systemPrompt.includes('section generator')) {
        output = {
          sectionKey: payload.sectionKey,
          text: 'İş sözleşmesinin feshi dosya kapsamına göre açıklanmıştır.',
          claims: payload.SOURCE_DATA.length ? [{ claimKey: 'legal-1', text: 'Fesih denetime tabidir.', sourceIds: [payload.SOURCE_DATA[0].sourceId], evidenceIds: payload.EVIDENCE_DATA[0] ? [payload.EVIDENCE_DATA[0].evidenceId] : [] }] : [],
          warnings: [],
        };
      } else {
        output = { findings: [], missingInformation: [], calculationRequired: [], overallAssessment: { level: 'READY', reason: 'Yapısal kontroller tamamlandı.' } };
      }
      return { text: JSON.stringify(output), provider: 'fake', model: 'fake-phase3', inputTokens: 120, outputTokens: 45, estimatedCost: 0.0012 };
    },
  };
  const repository = new LegalSearchRepository({ db: appPool });
  const fakeSearch = {
    async search() {
      return {
        results: [{
          sourceId: publicSource.sourceId, sourceType: 'LEGISLATION_VERSION', title: publicSource.title,
          excerpt: publicSource.content, score: 1, metadata: { chunkId: publicSource.chunkId },
        }],
        diagnostics: { usage: {} },
      };
    },
  };
  services = createDraftingServices({ db: appPool, llm: fakeLlm, searchService: fakeSearch, sourceRepository: repository });
  setDraftingServicesForTests(services);
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  await t.test('personal draft is visible only to its owner', async () => {
    personalDraft = await services.draftService.create({ caseId: personalA, title: 'Kişisel Taslak', draftType: 'PETITION' }, context(userA));
    assert.ok(await services.draftService.findAccessibleDraft(personalDraft.id, context(userA)));
    assert.equal(await services.draftService.findAccessibleDraft(personalDraft.id, context(userB)), null);
  });

  await t.test('organization draft is isolated from another tenant', async () => {
    organizationDraft = await services.draftService.create({ caseId: caseA, title: 'Kurumsal Taslak', draftType: 'RESPONSE' }, context(userA, [firmA]));
    assert.ok(await services.draftService.findAccessibleDraft(organizationDraft.id, context(userA, [firmA])));
    assert.equal(await services.draftService.findAccessibleDraft(organizationDraft.id, context(userB, [firmB])), null);
    otherDraft = await services.draftService.create({ caseId: caseB, title: 'Diğer Taslak', draftType: 'PETITION' }, context(userB, [firmB]));
  });

  await t.test('legacy petition API writes only to the canonical immutable draft model', async () => {
    const created = await api(baseUrl, `/api/cases/${caseA}/petitions`, {
      auth: token(userA), method: 'POST',
      body: { title: 'Legacy Uyum Taslağı', type: 'Cevap Dilekçesi', content: 'İlk legacy metin.' },
    });
    assert.equal(created.response.status, 201);
    assert.ok(created.data.data.draft_id);
    const legacyRows = await adminPool.query('SELECT count(*)::int AS count FROM petitions WHERE case_id = $1', [caseA]);
    assert.equal(legacyRows.rows[0].count, 0);
    const canonicalRows = await adminPool.query('SELECT draft_type FROM legal_drafts WHERE id = $1', [created.data.data.draft_id]);
    assert.equal(canonicalRows.rows[0].draft_type, 'RESPONSE');
    const updated = await api(baseUrl, `/api/cases/${caseA}/petitions/${created.data.data.id}`, {
      auth: token(userA), method: 'PUT', body: { content: 'İkinci immutable legacy metin.' },
    });
    assert.equal(updated.response.status, 200);
    assert.equal(updated.data.data.version, 2);
    const versions = await adminPool.query('SELECT plain_text FROM legal_draft_versions WHERE draft_id = $1 ORDER BY version_number', [created.data.data.draft_id]);
    assert.equal(versions.rows.length, 2);
    assert.match(versions.rows[0].plain_text, /İlk legacy metin/);
    assert.match(versions.rows[1].plain_text, /İkinci immutable legacy metin/);
  });

  await t.test('draft creation produces the first immutable version', async () => {
    const versions = await services.versionService.list(organizationDraft.id);
    assert.equal(versions.length, 1);
    assert.equal(versions[0].version_number, 1);
  });

  await t.test('saving creates a new version without changing the old one', async () => {
    const originalVersionId = organizationDraft.current_version_id;
    const original = await adminPool.query('SELECT plain_text FROM legal_draft_versions WHERE id = $1', [originalVersionId]);
    const detail = await services.draftService.getDetail(organizationDraft.id, context(userA, [firmA]));
    const updatedSections = detail.sections.map((item) => item.sectionKey === 'FACTS' ? { ...item, content: 'İlk olay metni' } : item);
    await services.draftService.update(organizationDraft.id, { sections: updatedSections, changeSummary: 'Kullanıcı kaydı' }, context(userA, [firmA]));
    organizationDraft = await services.draftService.findAccessibleDraft(organizationDraft.id, context(userA, [firmA]));
    const unchanged = await adminPool.query('SELECT plain_text FROM legal_draft_versions WHERE id = $1', [originalVersionId]);
    assert.equal(original.rows[0].plain_text.includes('İlk olay metni'), false);
    assert.equal(unchanged.rows[0].plain_text, original.rows[0].plain_text);
    assert.equal((await services.versionService.list(organizationDraft.id)).length, 2);
  });

  await t.test('accepting the same suggestion twice does not duplicate a version', async () => {
    const suggestion = await insertSuggestion(organizationDraft);
    const first = await services.suggestionService.accept(organizationDraft.id, suggestion.id, context(userA, [firmA]));
    const countAfterFirst = (await services.versionService.list(organizationDraft.id)).length;
    const second = await services.suggestionService.accept(organizationDraft.id, suggestion.id, context(userA, [firmA]));
    assert.equal(second.idempotent, true);
    assert.equal(second.versionId, first.version.id);
    assert.equal((await services.versionService.list(organizationDraft.id)).length, countAfterFirst);
    organizationDraft = await services.draftService.findAccessibleDraft(organizationDraft.id, context(userA, [firmA]));
  });

  await t.test('rejecting a suggestion does not change draft content or version', async () => {
    const before = await services.draftService.getDetail(organizationDraft.id, context(userA, [firmA]));
    const suggestion = await insertSuggestion(organizationDraft, { suggestedText: 'Bu metin uygulanmamalı' });
    await services.suggestionService.reject(organizationDraft.id, suggestion.id, context(userA, [firmA]));
    const after = await services.draftService.getDetail(organizationDraft.id, context(userA, [firmA]));
    assert.equal(after.current_version_id, before.current_version_id);
    assert.deepEqual(after.sections, before.sections);
  });

  await t.test('bulk review fully rolls back when another draft suggestion is included', async () => {
    const valid = await insertSuggestion(organizationDraft, { reason: 'Valid bulk' });
    const invalid = await insertSuggestion(otherDraft, { reason: 'Foreign bulk' });
    const before = (await services.versionService.list(organizationDraft.id)).length;
    await assert.rejects(
      services.suggestionService.bulkReview(organizationDraft.id, { accept: [valid.id, invalid.id], reject: [] }, context(userA, [firmA])),
      (error) => error.code === 'INVALID_BULK_REVIEW'
    );
    const statuses = await adminPool.query('SELECT status FROM draft_ai_suggestions WHERE id = ANY($1::uuid[]) ORDER BY id', [[valid.id, invalid.id]]);
    assert.ok(statuses.rows.every((item) => item.status === 'PENDING'));
    assert.equal((await services.versionService.list(organizationDraft.id)).length, before);
  });

  await t.test('evidence from another case cannot be related', async () => {
    evidenceA = await services.evidenceMatrixService.createEvidence(caseA, { title: 'Fesih bildirimi', verified: true }, context(userA, [firmA]));
    evidenceB = await services.evidenceMatrixService.createEvidence(caseB, { title: 'Başka dosya belgesi', verified: true }, context(userB, [firmB]));
    claimA = await services.evidenceMatrixService.createClaim(caseA, { title: 'Fesih geçersizdir', verified: true }, context(userA, [firmA]));
    await assert.rejects(
      services.evidenceMatrixService.createRelation(caseA, { claimId: claimA.id, evidenceId: evidenceB.id, relationType: 'SUPPORTS' }, context(userA, [firmA])),
      (error) => error.code === 'CLAIM_EVIDENCE_CASE_MISMATCH'
    );
  });

  await t.test('source from another tenant is rejected', async () => {
    await assert.rejects(
      services.citationService.add(organizationDraft.id, { sectionKey: 'LEGAL_GROUNDS', claimKey: 'tenant', sourceId: privateSourceB.sourceId, chunkId: privateSourceB.chunkId, excerpt: privateSourceB.content }, context(userA, [firmA])),
      (error) => error.code === 'LEGAL_SOURCE_NOT_FOUND'
    );
  });

  await t.test('fabricated source ID is rejected', async () => {
    await assert.rejects(
      services.citationService.add(organizationDraft.id, { sectionKey: 'LEGAL_GROUNDS', claimKey: 'fake', sourceId: crypto.randomUUID(), chunkId: crypto.randomUUID(), excerpt: 'Sahte' }, context(userA, [firmA])),
      (error) => error.code === 'LEGAL_SOURCE_NOT_FOUND'
    );
  });

  await t.test('grounded citation can be added and removal marks the claim unsupported', async () => {
    const citation = await services.citationService.add(organizationDraft.id, { sectionKey: 'LEGAL_GROUNDS', claimKey: 'fesih', sourceId: publicSource.sourceId, chunkId: publicSource.chunkId, excerpt: publicSource.content }, context(userA, [firmA]));
    const removed = await services.citationService.remove(organizationDraft.id, citation.id, context(userA, [firmA]));
    assert.equal(removed.unsupported, true);
    const historical = await adminPool.query('SELECT count(*)::int AS count FROM draft_citations WHERE id = $1 AND draft_version_id = $2', [citation.id, citation.created_version_id]);
    const currentDraft = await services.draftService.findAccessibleDraft(organizationDraft.id, context(userA, [firmA]));
    const current = await adminPool.query('SELECT count(*)::int AS count FROM draft_citations WHERE draft_version_id = $1 AND source_id = $2', [currentDraft.current_version_id, publicSource.sourceId]);
    assert.equal(historical.rows[0].count, 1);
    assert.equal(current.rows[0].count, 0);
  });

  await t.test('unsupported legal claim produces a warning', () => {
    const result = deterministicFindings({ sections: [{ sectionKey: 'LEGAL_GROUNDS', content: 'Fesih geçersizdir.' }], citations: [], matrix: { claims: [] } });
    assert.ok(result.findings.some((item) => item.type === 'SOURCE_REQUIRED'));
  });

  await t.test('claim without verified evidence produces EVIDENCE_REQUIRED', async () => {
    const matrix = await services.evidenceMatrixService.getMatrix(caseA, context(userA, [firmA]));
    const result = deterministicFindings({ sections: [], citations: [], matrix });
    assert.ok(result.findings.some((item) => item.type === 'EVIDENCE_REQUIRED'));
  });

  await t.test('contradicting evidence is visible in the matrix', async () => {
    await services.evidenceMatrixService.createRelation(caseA, { claimId: claimA.id, evidenceId: evidenceA.id, relationType: 'CONTRADICTS', verified: true }, context(userA, [firmA]));
    const matrix = await services.evidenceMatrixService.getMatrix(caseA, context(userA, [firmA]));
    assert.equal(matrix.claims.find((item) => item.id === claimA.id).contradictingEvidence.length, 1);
  });

  await t.test('AI evidence relation stays pending until user verification', async () => {
    const secondEvidence = await services.evidenceMatrixService.createEvidence(caseA, { title: 'Tanık beyanı' }, context(userA, [firmA]));
    const relation = await services.evidenceMatrixService.createRelation(caseA, { claimId: claimA.id, evidenceId: secondEvidence.id, relationType: 'SUPPORTS', suggestedByAi: true, verified: true }, context(userA, [firmA]));
    assert.equal(relation.verification_status, 'PENDING');
    assert.equal(relation.verified_by, null);
    const reviewed = await services.evidenceMatrixService.reviewRelation(caseA, relation.id, 'VERIFIED', context(userA, [firmA]));
    assert.equal(reviewed.verification_status, 'VERIFIED');
  });

  await t.test('outdated legislation produces a current-version warning', () => {
    const result = deterministicFindings({
      sections: [], matrix: { claims: [] }, effectiveAt: '2026-01-01',
      citations: [{ section_key: 'LEGAL_GROUNDS', source_id: oldSource.sourceId, effective_to: oldSource.effectiveTo }],
    });
    assert.ok(result.findings.some((item) => item.sourceIds?.includes(oldSource.sourceId)));
  });

  await t.test('calculation_required is emitted without final deadline calculation', () => {
    const result = deterministicFindings({ sections: [{ sectionKey: 'FACTS', content: 'Tebliğ süresi ve zamanaşımı kontrol edilmelidir.' }], citations: [], matrix: { claims: [] } });
    assert.ok(result.calculationRequired.length >= 2);
    assert.ok(result.calculationRequired.every((item) => !Object.hasOwn(item, 'result')));
  });

  await t.test('DOCX export is an openable ZIP document', async () => {
    const result = await services.exportService.toDocx(organizationDraft.id, context(userA, [firmA]));
    assert.equal(result.buffer.subarray(0, 2).toString(), 'PK');
    assert.ok(result.buffer.length > 1000);
  });

  await t.test('PDF export has a valid PDF signature', async () => {
    const result = await services.exportService.toPdf(organizationDraft.id, context(userA, [firmA]));
    assert.equal(result.buffer.subarray(0, 4).toString(), '%PDF');
    assert.ok(result.buffer.length > 1000);
  });

  await t.test('another tenant cannot export the draft', async () => {
    await assert.rejects(services.exportService.toPdf(organizationDraft.id, context(userB, [firmB])), (error) => error.code === 'DRAFT_NOT_FOUND');
    const result = await api(baseUrl, `/api/v1/drafts/${organizationDraft.id}/export/pdf`, { auth: token(userB) });
    assert.equal(result.response.status, 404);
  });

  await t.test('structured AI creates pending suggestions and usage records', async () => {
    const plan = await services.suggestionService.generatePlan(organizationDraft.id, context(userA, [firmA]));
    assert.equal(plan.plan.sections[0].sectionKey, 'FACTS');
    const generated = await services.suggestionService.generateSection(organizationDraft.id, { sectionKey: 'LEGAL_GROUNDS', query: 'iş güvencesi' }, context(userA, [firmA]));
    assert.equal(generated.suggestion.status, 'PENDING');
    const analysis = await services.suggestionService.analyze(organizationDraft.id, {}, context(userA, [firmA]));
    assert.ok(Array.isArray(analysis.findings));
    const runs = await adminPool.query("SELECT provider, model, input_tokens, output_tokens, estimated_cost, status FROM draft_ai_runs WHERE draft_id = $1", [organizationDraft.id]);
    assert.equal(runs.rows.length, 3);
    assert.ok(runs.rows.every((item) => item.provider === 'fake' && item.status === 'COMPLETED' && item.input_tokens > 0));
  });

  await t.test('HTTP create, suggestion review and export write content-free audit records', async () => {
    const created = await api(baseUrl, '/api/v1/drafts', {
      auth: token(userA), method: 'POST', body: { caseId: caseA, title: 'Audit Taslağı', draftType: 'PETITION' },
    });
    assert.equal(created.response.status, 201);
    const suggestion = await insertSuggestion(created.data.data);
    const accepted = await api(baseUrl, `/api/v1/drafts/${created.data.data.id}/suggestions/${suggestion.id}/accept`, { auth: token(userA), method: 'POST', body: {} });
    assert.equal(accepted.response.status, 200);
    const exported = await api(baseUrl, `/api/v1/drafts/${created.data.data.id}/export/docx`, { auth: token(userA) });
    assert.equal(exported.response.status, 200);
    const logs = await adminPool.query('SELECT action, metadata::text AS metadata FROM audit_logs WHERE entity_id = $1 ORDER BY created_at', [created.data.data.id]);
    assert.ok(logs.rows.some((item) => item.action === 'DRAFT_CREATED'));
    assert.ok(logs.rows.some((item) => item.action === 'DRAFT_SUGGESTION_ACCEPTED'));
    assert.ok(logs.rows.some((item) => item.action === 'DRAFT_EXPORTED'));
    assert.ok(logs.rows.every((item) => !/prompt|document_text|content/i.test(item.metadata)));
  });

  await t.test('template scopes are isolated and missing variables remain visible', async () => {
    const ownTemplate = await services.draftService.createTemplate({
      scopeType: 'ORGANIZATION', organizationId: firmA, title: 'A Şablonu',
      content: '{{court_name}} {{claim_amount}}', templateType: 'PETITION', tags: ['iş'],
    }, context(userA, [firmA]));
    const foreignTemplate = await services.draftService.createTemplate({
      scopeType: 'ORGANIZATION', organizationId: firmB, title: 'B Şablonu', content: 'Gizli',
    }, context(userB, [firmB]));
    const personalTemplate = await services.draftService.createTemplate({
      scopeType: 'PERSONAL', title: 'Kişisel Şablon', content: '{{case_number}}',
    }, context(userA, [firmA]));
    const systemTemplate = crypto.randomUUID();
    await adminPool.query(
      `INSERT INTO firm_templates (id, scope_type, is_read_only, title, content, created_by)
       VALUES ($1, 'SYSTEM', true, 'Sistem Şablonu', '{{case_number}}', $2)`,
      [systemTemplate, userA]
    );
    const templates = await services.draftService.listTemplates(context(userA, [firmA]), { caseId: caseA });
    assert.ok(templates.some((item) => item.id === ownTemplate.id));
    assert.ok(templates.some((item) => item.id === systemTemplate));
    assert.ok(templates.some((item) => item.id === personalTemplate.id));
    assert.ok(!templates.some((item) => item.id === foreignTemplate.id));
    await assert.rejects(
      services.draftService.createTemplate({ scopeType: 'SYSTEM', title: 'Yasak', content: 'Yasak' }, context(userA, [firmA])),
      (error) => error.code === 'SYSTEM_TEMPLATE_FORBIDDEN'
    );
    const created = await services.draftService.create({ caseId: caseA, title: 'Şablonlu', templateId: ownTemplate.id }, context(userA, [firmA]));
    assert.ok(created.sections.find((item) => item.sectionKey === 'FACTS').content.includes('{{claim_amount}}'));
  });

  await t.test('migration 006 is recorded and remains idempotent', async () => {
    const row = await adminPool.query("SELECT checksum FROM schema_migrations WHERE version = '20260628_006_phase3_drafting_evidence'");
    assert.equal(row.rows[0].checksum.length, 64);
    assert.equal((await migrate({ dbPool: adminPool, logger: silentLogger })).applied, 0);
  });
});
