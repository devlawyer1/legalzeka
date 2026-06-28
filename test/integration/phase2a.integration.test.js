const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const { getTestDatabaseUrl } = require('../helpers/testDatabase');

const databaseUrl = getTestDatabaseUrl();
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = databaseUrl;
process.env.JWT_SECRET = 'phase2a-integration-only-secret';
process.env.JWT_EXPIRES_IN = '15m';
process.env.LEGAL_CORPUS_ENABLED = 'true';
process.env.LEGAL_CORPUS_SEMANTIC_ENABLED = 'false';

const { migrate } = require('../../src/utils/migrate');
const { pool: appPool } = require('../../src/config/db');
const app = require('../../src/app');
const { LegalSourceIngestionService } = require('../../src/services/legalSearch/legalSourceIngestionService');
const { LegalSearchRepository } = require('../../src/services/legalSearch/legalSearchRepository');
const { HybridLegalSearchService } = require('../../src/services/legalSearch/hybridLegalSearchService');
const { LegalSearchCache } = require('../../src/services/legalSearch/searchCache');

const adminPool = new Pool({ connectionString: databaseUrl });
const silentLogger = { log() {} };

function vectorAt(index) {
  const vector = Array(1024).fill(0);
  vector[index] = 1;
  return vector;
}

function vectorForText(text) {
  const normalized = String(text).toLocaleLowerCase('tr-TR');
  if (normalized.includes('fazla') || normalized.includes('çalışma')) return vectorAt(0);
  if (normalized.includes('belirsiz') || normalized.includes('zamanaşımı')) return vectorAt(1);
  if (normalized.includes('özel') || normalized.includes('kişisel')) return vectorAt(2);
  return vectorAt(3);
}

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
     VALUES ($1, $2, 'Phase', 'Two', $3, 'unused', true)`,
    [id, role.rows[0].id, email]
  );
  return id;
}

async function seedFirm(ownerId, memberId, name) {
  const id = crypto.randomUUID();
  await adminPool.query(
    `INSERT INTO law_firms (id, name, owner_id, is_active) VALUES ($1, $2, $3, true)`,
    [id, name, ownerId]
  );
  await adminPool.query(
    `INSERT INTO firm_users (firm_id, user_id, firm_role, is_active)
     VALUES ($1, $2, 'kurucu', true)`,
    [id, memberId]
  );
  return id;
}

function authToken(userId) {
  return jwt.sign({ userId, email: `${userId}@example.test`, role: 'Users' }, process.env.JWT_SECRET, {
    expiresIn: '15m',
  });
}

async function api(baseUrl, endpoint, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { response, data: await response.json() };
}

test('Phase 2A normalized ingestion, historical legislation and hybrid legal search', async (t) => {
  let server;
  let baseUrl;
  let userA;
  let userB;
  let firmA;
  let firmB;
  let personalCaseId;
  let legislationId;
  let privateSourceId;
  let embedBatchCalls = 0;

  const fakeEmbedTexts = async (texts) => {
    embedBatchCalls += 1;
    return texts.map(vectorForText);
  };

  t.after(async () => {
    await new Promise((resolve) => {
      if (!server) return resolve();
      server.close(resolve);
    });
    await appPool.end();
    await adminPool.end();
  });

  await resetDatabase();
  userA = await seedUser('phase2a-a@example.test');
  userB = await seedUser('phase2a-b@example.test');
  firmA = await seedFirm(userA, userA, 'Phase 2A Firm A');
  firmB = await seedFirm(userB, userB, 'Phase 2A Firm B');
  personalCaseId = crypto.randomUUID();
  await adminPool.query(
    `INSERT INTO cases (
       id, scope_type, owner_user_id, konu, legal_domain, is_active
     ) VALUES ($1, 'PERSONAL', $2, 'İşe iade uyuşmazlığı', 'İş Hukuku', true)`,
    [personalCaseId, userA]
  );

  const ingestion = new LegalSourceIngestionService({ db: adminPool, embedTexts: fakeEmbedTexts });
  const repository = new LegalSearchRepository({ db: adminPool });

  await t.test('decision identity deduplicates retries and links alternate source origins', async () => {
    const decision = {
      sourceName: 'bedesten_yargitay',
      externalId: 'decision-primary',
      sourceUrl: 'https://official.example/decision-primary',
      officialSource: true,
      court: 'Yargıtay',
      chamber: '9. Hukuk Dairesi',
      caseNumber: '2024/10',
      decisionNumber: '2025/20',
      decisionDate: '2025-01-10',
      legalDomain: 'İş Hukuku',
      content: `OLAYLAR
İşçinin iş sözleşmesi feshedildi.

GEREKÇE
Uyuşmazlıkta 4857 sayılı İş Kanunu 18. maddesi uygulanır. Altı aylık kıdem şartı gerçekleşmiştir.

HÜKÜM
İşe iade talebinin kabulüne karar verildi.`,
    };
    const first = await ingestion.ingestDecision(decision);
    const callsAfterFirst = embedBatchCalls;
    const retry = await ingestion.ingestDecision(decision);
    const alternate = await ingestion.ingestDecision({
      ...decision,
      sourceName: 'secondary_archive',
      externalId: 'decision-secondary',
      sourceUrl: 'https://archive.example/decision-secondary',
      officialSource: false,
    });

    assert.equal(retry.sourceId, first.sourceId);
    assert.equal(alternate.sourceId, first.sourceId);
    assert.equal(embedBatchCalls, callsAfterFirst);
    const sources = await adminPool.query(
      `SELECT count(*)::int AS count FROM legal_sources WHERE decision_number = '2025/20'`
    );
    const origins = await adminPool.query(
      'SELECT count(*)::int AS count FROM legal_source_origins WHERE legal_source_id = $1',
      [first.sourceId]
    );
    const citations = await adminPool.query(
      'SELECT law_number, article_number FROM legal_source_citations WHERE source_id = $1',
      [first.sourceId]
    );
    assert.equal(sources.rows[0].count, 1);
    assert.equal(origins.rows[0].count, 2);
    assert.deepEqual(citations.rows[0], { law_number: '4857', article_number: '18' });
  });

  await t.test('legislation versions resolve by effective date without duplicate embeddings', async () => {
    const oldVersion = await ingestion.ingestLegislation({
      lawName: 'İş Kanunu',
      lawNumber: '4857',
      sourceName: 'mevzuat',
      externalId: 'kanun-4857',
      sourceUrl: 'https://www.mevzuat.gov.tr/4857',
      officialSource: true,
      effectiveFrom: '2020-01-01',
      effectiveTo: '2022-01-01',
      officialGazetteDate: '2020-01-01',
      articles: [{
        number: '18',
        title: 'Feshin geçerli sebebe dayandırılması',
        text: 'Belirsiz alacak davasında eski zamanaşımı kuralı uygulanır.',
      }],
    });
    legislationId = oldVersion.legislationId;
    const current = await ingestion.ingestLegislation({
      lawName: 'İş Kanunu',
      lawNumber: '4857',
      sourceName: 'mevzuat',
      externalId: 'kanun-4857',
      sourceUrl: 'https://www.mevzuat.gov.tr/4857',
      officialSource: true,
      effectiveFrom: '2022-01-01',
      officialGazetteDate: '2022-01-01',
      changeSource: 'Değişiklik Kanunu',
      articles: [{
        number: '18',
        title: 'Feshin geçerli sebebe dayandırılması',
        text: 'Belirsiz alacak davasında yeni zamanaşımı kuralı uygulanır.',
      }],
    });
    const callsBeforeRetry = embedBatchCalls;
    await ingestion.ingestLegislation({
      lawName: 'İş Kanunu',
      lawNumber: '4857',
      sourceName: 'mevzuat',
      externalId: 'kanun-4857',
      sourceUrl: 'https://www.mevzuat.gov.tr/4857',
      officialSource: true,
      effectiveFrom: '2022-01-01',
      officialGazetteDate: '2022-01-01',
      changeSource: 'Değişiklik Kanunu',
      articles: [{
        number: '18',
        title: 'Feshin geçerli sebebe dayandırılması',
        text: 'Belirsiz alacak davasında yeni zamanaşımı kuralı uygulanır.',
      }],
    });
    assert.equal(embedBatchCalls, callsBeforeRetry);
    assert.notEqual(oldVersion.versionSourceId, current.versionSourceId);

    const versions = await repository.getLegislationVersions(legislationId, {
      userId: userA,
      organizationIds: [firmA],
    });
    assert.equal(versions.length, 2);
    assert.equal(versions[0].status, 'CURRENT');
    assert.equal(versions[1].status, 'HISTORICAL');
    assert.equal(versions[0].previous_version_id, versions[1].id);

    const keywordService = new HybridLegalSearchService({
      repository,
      cache: new LegalSearchCache(),
      semanticEnabled: false,
    });
    const historical = await keywordService.search({
      query: 'eski zamanaşımı kuralı',
      sourceTypes: ['LEGISLATION_VERSION'],
      effectiveAt: '2021-06-01',
      page: 1,
      pageSize: 10,
    }, { accessScope: { userId: userA, organizationIds: [firmA] } });
    const currentSearch = await keywordService.search({
      query: 'yeni zamanaşımı kuralı',
      sourceTypes: ['LEGISLATION_VERSION'],
      effectiveAt: '2023-06-01',
      page: 1,
      pageSize: 10,
    }, { accessScope: { userId: userA, organizationIds: [firmA] } });
    assert.equal(historical.results[0].excerpt.includes('eski zamanaşımı'), true);
    assert.equal(currentSearch.results[0].excerpt.includes('yeni zamanaşımı'), true);
  });

  await t.test('keyword, semantic and metadata filters share one grouped hybrid index', async () => {
    const semanticDecision = await ingestion.ingestDecision({
      sourceName: 'bedesten_yargitay',
      externalId: 'fazla-mesai-1',
      officialSource: true,
      sourceUrl: 'https://official.example/fazla-mesai-1',
      court: 'Yargıtay',
      chamber: '9. Hukuk Dairesi',
      caseNumber: '2023/100',
      decisionNumber: '2024/200',
      decisionDate: '2024-02-10',
      legalDomain: 'İş Hukuku',
      content: `OLAYLAR
Davacı uzun süre çalışmıştır.

GEREKÇE
Fazla mesai ve fazla çalışma ücretinin tanık beyanıyla ispatı mümkündür.

HÜKÜM
Alacağın kabulüne karar verilmiştir.`,
    });
    await ingestion.ingestDecision({
      sourceName: 'bedesten_bam',
      externalId: 'regional-1',
      officialSource: true,
      court: 'Bölge Adliye Mahkemesi',
      chamber: '10. Hukuk Dairesi',
      caseNumber: '2023/300',
      decisionNumber: '2024/400',
      decisionDate: '2024-03-10',
      legalDomain: 'İş Hukuku',
      content: 'GEREKÇE\nFazla mesai talebi bordro kayıtları nedeniyle reddedilmiştir.',
    });

    const hybrid = new HybridLegalSearchService({
      repository,
      cache: new LegalSearchCache(),
      embedQuery: async () => vectorAt(0),
      reranker: (items) => items.map((item) => ({
        ...item,
        rerank_score: item.source_id === semanticDecision.sourceId ? 0.95 : 0.2,
      })),
      semanticEnabled: true,
    });
    const result = await hybrid.search({
      query: 'fazla çalışma ücretinin ispatı',
      sourceTypes: ['COURT_DECISION'],
      courts: ['Yargıtay'],
      dateFrom: '2024-01-01',
      dateTo: '2024-12-31',
      page: 1,
      pageSize: 10,
    }, {
      accessScope: { userId: userA, organizationIds: [firmA] },
    });
    assert.equal(result.results[0].sourceId, semanticDecision.sourceId);
    assert.equal(result.results.every((item) => item.court === 'Yargıtay'), true);
    assert.equal(result.results.filter((item) => item.sourceId === semanticDecision.sourceId).length, 1);
    assert.equal(result.results[0].scoreBreakdown.semanticScore > 0, true);
    assert.equal(result.results[0].scoreBreakdown.keywordScore > 0, true);
    assert.equal(result.results[0].scoreBreakdown.rerankScore, 0.95);

    const source = await repository.getSource(semanticDecision.sourceId, {
      userId: userA,
      organizationIds: [firmA],
    });
    assert.equal(source.chunks.some((chunk) => chunk.content.includes(result.results[0].excerpt)), true);

    const citations = await hybrid.search({
      query: 'İş Kanunu',
      lawNumber: '4857',
      articleNumber: '18',
      sourceTypes: ['COURT_DECISION'],
      page: 1,
      pageSize: 10,
    }, { accessScope: { userId: userA, organizationIds: [firmA] } });
    assert.equal(citations.results.some((item) => item.decisionNumber === '2025/20'), true);

    const excluded = await hybrid.search({
      query: 'fazla mesai',
      courts: ['Danıştay'],
      page: 1,
      pageSize: 10,
    }, { accessScope: { userId: userA, organizationIds: [firmA] } });
    assert.equal(excluded.results.length, 0);
  });

  await t.test('tenant visibility, personal Matter context and cache remain isolated', async () => {
    const privateSource = await ingestion.ingestDecision({
      sourceName: 'firm_curated',
      externalId: 'firm-a-private-1',
      court: 'Yargıtay',
      chamber: '9. Hukuk Dairesi',
      caseNumber: '2022/900',
      decisionNumber: '2023/901',
      decisionDate: '2023-04-01',
      legalDomain: 'İş Hukuku',
      visibility: 'ORGANIZATION',
      organizationId: firmA,
      content: 'GEREKÇE\nÖzel büro emsal notu yalnızca yetkili organizasyona açıktır.',
    });
    privateSourceId = privateSource.sourceId;
    await ingestion.ingestDecision({
      sourceName: 'personal_curated',
      externalId: 'personal-a-1',
      court: 'Yargıtay',
      caseNumber: '2021/800',
      decisionNumber: '2022/801',
      decisionDate: '2022-04-01',
      visibility: 'PERSONAL',
      ownerUserId: userA,
      content: 'GEREKÇE\nKişisel hukuk araştırması yalnızca sahibine açıktır.',
    });

    const scopedService = new HybridLegalSearchService({
      repository,
      cache: new LegalSearchCache(),
      semanticEnabled: false,
    });
    const firmAResult = await scopedService.search({
      query: 'özel büro emsal notu', page: 1, pageSize: 10,
    }, { accessScope: { userId: userA, organizationIds: [firmA] }, organizationId: firmA });
    const firmARepeat = await scopedService.search({
      query: 'özel büro emsal notu', page: 1, pageSize: 10,
    }, { accessScope: { userId: userA, organizationIds: [firmA] }, organizationId: firmA });
    const firmBResult = await scopedService.search({
      query: 'özel büro emsal notu', page: 1, pageSize: 10,
    }, { accessScope: { userId: userB, organizationIds: [firmB] }, organizationId: firmB });
    assert.equal(firmAResult.results.some((item) => item.sourceId === privateSource.sourceId), true);
    assert.equal(firmARepeat.diagnostics.cacheStatus, 'HIT');
    assert.equal(firmBResult.results.some((item) => item.sourceId === privateSource.sourceId), false);

    const personalForOwner = await scopedService.search({
      query: 'kişisel hukuk araştırması', page: 1, pageSize: 10,
    }, { accessScope: { userId: userA, organizationIds: [firmA] } });
    const personalForOther = await scopedService.search({
      query: 'kişisel hukuk araştırması', page: 1, pageSize: 10,
    }, { accessScope: { userId: userB, organizationIds: [firmB] } });
    assert.equal(personalForOwner.results.length, 1);
    assert.equal(personalForOther.results.length, 0);

    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    const ownerSearch = await api(baseUrl, '/api/v1/legal-search', {
      token: authToken(userA),
      method: 'POST',
      body: { query: 'fazla mesai', caseId: personalCaseId, page: 1, pageSize: 10 },
    });
    const deniedSearch = await api(baseUrl, '/api/v1/legal-search', {
      token: authToken(userB),
      method: 'POST',
      body: { query: 'fazla mesai', caseId: personalCaseId, page: 1, pageSize: 10 },
    });
    assert.equal(ownerSearch.response.status, 200);
    assert.equal(deniedSearch.response.status, 404);

    const privateForOwner = await api(baseUrl, `/api/v1/legal-sources/${privateSourceId}`, {
      token: authToken(userA),
    });
    const privateForOther = await api(baseUrl, `/api/v1/legal-sources/${privateSourceId}`, {
      token: authToken(userB),
    });
    assert.equal(privateForOwner.response.status, 200);
    assert.equal(privateForOther.response.status, 404);
  });

  await t.test('API validation, historical endpoint, SQL injection and metrics are safe', async () => {
    const oversized = await api(baseUrl, '/api/v1/legal-search', {
      token: authToken(userA),
      method: 'POST',
      body: { query: 'işe iade', page: 1, pageSize: 51 },
    });
    assert.equal(oversized.response.status, 400);

    const injection = await api(baseUrl, '/api/v1/legal-search', {
      token: authToken(userA),
      method: 'POST',
      body: { query: "' OR 1=1; DROP TABLE legal_sources; --", page: 1, pageSize: 10 },
    });
    assert.equal(injection.response.status, 200);
    const table = await adminPool.query("SELECT to_regclass('public.legal_sources') AS table_name");
    assert.equal(table.rows[0].table_name, 'legal_sources');

    const versions = await api(baseUrl, `/api/v1/legislation/${legislationId}/versions`, {
      token: authToken(userA),
    });
    assert.equal(versions.response.status, 200);
    assert.equal(versions.data.data.length, 2);

    const metrics = await adminPool.query(
      `SELECT query_hash, query_length, duration_ms, full_text_ms, vector_search_ms,
              rerank_ms, result_count, cache_status, user_id, organization_id,
              case_id, embedding_provider, embedding_model
       FROM legal_search_metrics
       ORDER BY created_at DESC`
    );
    assert.equal(metrics.rows.length > 0, true);
    assert.equal(metrics.rows.every((row) => row.query_hash.length === 64), true);
    assert.equal(metrics.rows.some((row) => row.cache_status === 'HIT'), true);
    const rawQueryColumn = await adminPool.query(
      `SELECT count(*)::int AS count
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'legal_search_metrics'
         AND column_name IN ('query', 'raw_query', 'query_text')`
    );
    assert.equal(rawQueryColumn.rows[0].count, 0);
  });
});
