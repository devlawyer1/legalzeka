const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const { getTestDatabaseUrl } = require('../helpers/testDatabase');

const databaseUrl = getTestDatabaseUrl();
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = databaseUrl;
process.env.JWT_SECRET = 'phase2b-integration-only-secret';
process.env.JWT_EXPIRES_IN = '15m';
process.env.LEGAL_CORPUS_ENABLED = 'true';
process.env.LEGAL_CORPUS_SEMANTIC_ENABLED = 'false';
process.env.LEGAL_RESEARCH_SUPPORT_SOURCE_LIMIT = '1';
process.env.LEGAL_RESEARCH_COUNTER_SOURCE_LIMIT = '2';
process.env.LEGAL_RESEARCH_RATE_LIMIT_MAX = '5';
process.env.LEGAL_RESEARCH_RATE_LIMIT_WINDOW_MS = '60000';

const { migrate } = require('../../src/utils/migrate');
const { pool: appPool } = require('../../src/config/db');
const app = require('../../src/app');
const { LegalSourceIngestionService } = require('../../src/services/legalSearch/legalSourceIngestionService');
const { LegalSearchRepository } = require('../../src/services/legalSearch/legalSearchRepository');
const { HybridLegalSearchService } = require('../../src/services/legalSearch/hybridLegalSearchService');
const { LegalSearchCache } = require('../../src/services/legalSearch/searchCache');
const { CitationVerifier } = require('../../src/services/legalResearch/CitationVerifier');
const { LegalAnswerGenerator } = require('../../src/services/legalResearch/LegalAnswerGenerator');
const { LegalResearchService } = require('../../src/services/legalResearch/LegalResearchService');
const { ResearchSessionService } = require('../../src/services/legalResearch/ResearchSessionService');
const { setLegalResearchServiceForTests } = require('../../src/services/legalResearch');

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
     VALUES ($1, $2, 'Research', 'User', $3, 'unused', true)`,
    [id, role.rows[0].id, email]
  );
  return id;
}

async function seedFirm(ownerId, name) {
  const id = crypto.randomUUID();
  await adminPool.query(
    `INSERT INTO law_firms (id, name, owner_id, is_active) VALUES ($1, $2, $3, true)`,
    [id, name, ownerId]
  );
  await adminPool.query(
    `INSERT INTO firm_users (firm_id, user_id, firm_role, is_active)
     VALUES ($1, $2, 'kurucu', true)`,
    [id, ownerId]
  );
  return id;
}

function accessContext(userId, organizationIds = []) {
  return {
    userId,
    isSystemAdmin: false,
    memberships: organizationIds.map((lawFirmId) => ({
      lawFirmId,
      role: 'kurucu',
      canRead: true,
      canWrite: true,
      canAdmin: true,
    })),
    scopes: { personalOwnerUserId: userId, organizationIds },
  };
}

function authToken(userId) {
  return jwt.sign({ userId, email: `${userId}@example.test`, role: 'Users' }, process.env.JWT_SECRET, {
    expiresIn: '15m',
  });
}

async function api(baseUrl, endpoint, { token, method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.status === 204) return { response, data: null };
  const text = await response.text();
  return { response, data: text ? JSON.parse(text) : null };
}

function fakeLlm() {
  return {
    calls: 0,
    async chatWithUsage({ userMessage }) {
      this.calls += 1;
      const input = JSON.parse(userMessage);
      const support = input.SOURCE_DATA.find((source) => source.supportHint === 'SUPPORTS') || input.SOURCE_DATA[0];
      const counter = input.SOURCE_DATA.find((source) => source.supportHint === 'CONTRADICTS');
      return {
        text: JSON.stringify({
          summary: 'Kaynaklara dayalı değerlendirme tamamlandı.',
          analysis: [{
            claimKey: 'claim-1',
            text: support.excerpt,
            sourceIds: [support.sourceId],
            counterSourceIds: counter ? [counter.sourceId] : [],
          }],
          counterArguments: counter ? [{ text: counter.excerpt, sourceIds: [counter.sourceId] }] : [],
          missingInformation: ['Somut fesih nedeni ayrıca incelenmelidir.'],
          warnings: [],
          confidence: { level: 'MEDIUM', reason: 'Sonuç getirilen kaynaklarla sınırlıdır.' },
        }),
        provider: 'fake',
        model: 'fake-legal-research',
        inputTokens: 120,
        outputTokens: 80,
        estimatedCost: 0.0012,
      };
    },
  };
}

test('Phase 2B grounded legal research sessions, citations and Matter integration', async (t) => {
  let server;
  let baseUrl;
  let userA;
  let userB;
  let firmA;
  let firmB;
  let personalCaseId;
  let personalSessionId;
  let answerId;
  let researchService;
  let sessionService;
  let llm;

  t.after(async () => {
    await new Promise((resolve) => {
      if (!server) return resolve();
      server.close(resolve);
    });
    await appPool.end();
    await adminPool.end();
  });

  await resetDatabase();
  userA = await seedUser('phase2b-a@example.test');
  userB = await seedUser('phase2b-b@example.test');
  firmA = await seedFirm(userA, 'Research Firm A');
  firmB = await seedFirm(userB, 'Research Firm B');
  personalCaseId = crypto.randomUUID();
  await adminPool.query(
    `INSERT INTO cases (id, scope_type, owner_user_id, konu, legal_domain, is_active)
     VALUES ($1, 'PERSONAL', $2, 'İşe iade araştırması', 'İş Hukuku', true)`,
    [personalCaseId, userA]
  );

  const ingestion = new LegalSourceIngestionService({ db: adminPool });
  await ingestion.ingestDecision({
    sourceName: 'bedesten_yargitay',
    externalId: 'research-support-1',
    sourceUrl: 'https://official.example/research-support-1',
    officialSource: true,
    court: 'Yargıtay',
    chamber: '9. Hukuk Dairesi',
    caseNumber: '2024/100',
    decisionNumber: '2025/200',
    decisionDate: '2025-01-10',
    legalDomain: 'İş Hukuku',
    content: `GEREKÇE
İşe iade davasında altı aylık kıdem şartı aranır ve fesih tarihinde değerlendirilir.`,
  });
  await ingestion.ingestDecision({
    sourceName: 'secondary_archive',
    externalId: 'research-counter-1',
    sourceUrl: 'https://archive.example/research-counter-1',
    officialSource: false,
    court: 'Bölge Adliye Mahkemesi',
    chamber: '10. Hukuk Dairesi',
    caseNumber: '2023/300',
    decisionNumber: '2024/400',
    decisionDate: '2024-03-10',
    legalDomain: 'İş Hukuku',
    content: `GEREKÇE
Karşı görüş ve istisna olarak bazı işveren vekilleri için altı aylık kıdem şartı uygulanmaz.`,
  });
  await ingestion.ingestLegislation({
    lawName: 'İş Kanunu',
    lawNumber: '4857',
    sourceName: 'mevzuat',
    externalId: 'kanun-4857',
    officialSource: true,
    effectiveFrom: '2020-01-01',
    effectiveTo: '2022-01-01',
    officialGazetteDate: '2020-01-01',
    articles: [{ number: '18', text: 'Eski düzenlemede altı aylık kıdem şartı tarihsel biçimde düzenlenmiştir.' }],
  });
  await ingestion.ingestLegislation({
    lawName: 'İş Kanunu',
    lawNumber: '4857',
    sourceName: 'mevzuat',
    externalId: 'kanun-4857',
    officialSource: true,
    effectiveFrom: '2022-01-01',
    officialGazetteDate: '2022-01-01',
    articles: [{ number: '18', text: 'Güncel düzenlemede altı aylık kıdem şartının yeni metni uygulanır.' }],
  });

  const repository = new LegalSearchRepository({ db: adminPool });
  const searchService = new HybridLegalSearchService({
    repository,
    cache: new LegalSearchCache(),
    semanticEnabled: false,
  });
  sessionService = new ResearchSessionService({ db: adminPool });
  llm = fakeLlm();
  researchService = new LegalResearchService({
    db: adminPool,
    searchService,
    sourceRepository: repository,
    sessionService,
    answerGenerator: new LegalAnswerGenerator({ llm, maxAttempts: 1 }),
    citationVerifier: new CitationVerifier({ repository }),
    auditLogService: { async record() {} },
  });
  setLegalResearchServiceForTests(researchService);

  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  await t.test('personal and organization sessions enforce tenant access and support rename', async () => {
    const personal = await api(baseUrl, '/api/v1/legal-research/sessions', {
      token: authToken(userA),
      method: 'POST',
      body: { title: 'Kıdem araştırması', caseId: personalCaseId, effectiveAt: '2021-06-01' },
    });
    assert.equal(personal.response.status, 201);
    personalSessionId = personal.data.data.id;

    const organization = await api(baseUrl, '/api/v1/legal-research/sessions', {
      token: authToken(userA),
      method: 'POST',
      body: { title: 'Büro araştırması', organizationId: firmA },
    });
    assert.equal(organization.response.status, 201);

    const deniedPersonal = await api(baseUrl, `/api/v1/legal-research/sessions/${personalSessionId}`, {
      token: authToken(userB),
    });
    const deniedOrganization = await api(baseUrl, `/api/v1/legal-research/sessions/${organization.data.data.id}`, {
      token: authToken(userB),
    });
    assert.equal(deniedPersonal.response.status, 404);
    assert.equal(deniedOrganization.response.status, 404);

    const renamed = await api(baseUrl, `/api/v1/legal-research/sessions/${personalSessionId}`, {
      token: authToken(userA),
      method: 'PATCH',
      body: { title: 'Altı aylık kıdem istisnaları' },
    });
    assert.equal(renamed.response.status, 200);
    assert.equal(renamed.data.data.title, 'Altı aylık kıdem istisnaları');
  });

  await t.test('grounded answer separates counter sources and records historical warnings and usage', async () => {
    const response = await api(baseUrl, '/api/v1/legal-research/answer', {
      token: authToken(userA),
      method: 'POST',
      headers: { 'Idempotency-Key': 'research-answer-key-0001' },
      body: {
        query: 'İşe iade davasında altı aylık kıdem şartının istisnaları nelerdir?',
        sessionId: personalSessionId,
        caseId: personalCaseId,
        effectiveAt: '2021-06-01',
        filters: { legalDomain: 'İş Hukuku' },
      },
    });
    assert.equal(response.response.status, 200);
    assert.equal(response.data.data.status, 'COMPLETED');
    answerId = response.data.data.answerId;
    assert.equal(response.data.data.analysis.length, 1);
    assert.equal(response.data.data.citations.length >= 1, true);
    assert.equal(response.data.data.citations.every((citation) => citation.verification_status !== 'REJECTED'), true);
    assert.equal(response.data.data.warnings.some((warning) => warning.includes('güncel metinden farklıdır')), true);
    assert.equal(response.data.data.usage.model, 'fake-legal-research');
    assert.equal(response.data.data.usage.inputTokens, 120);
    assert.equal(response.data.data.usage.totalCost >= 0.0012, true);

    const grounded = await adminPool.query(
      `SELECT bool_and(chunk.content LIKE '%' || citation.source_excerpt || '%') AS grounded,
              count(*) FILTER (WHERE citation.support_type = 'CONTRADICTS')::int AS counter_count
       FROM legal_research_answer_citations citation
       JOIN legal_source_chunks chunk ON chunk.id = citation.chunk_id
       WHERE citation.answer_id = $1`,
      [answerId]
    );
    assert.equal(grounded.rows[0].grounded, true);
    assert.equal(grounded.rows[0].counter_count >= 0, true);

    const usage = await adminPool.query(
      `SELECT input_tokens, output_tokens, estimated_cost, total_cost, duration_ms
       FROM legal_research_answers WHERE id = $1`,
      [answerId]
    );
    assert.equal(usage.rows[0].input_tokens, 120);
    assert.equal(Number(usage.rows[0].total_cost) >= Number(usage.rows[0].estimated_cost), true);
  });

  await t.test('idempotency and follow-up questions reuse the session without duplicate answers', async () => {
    const repeated = await api(baseUrl, '/api/v1/legal-research/answer', {
      token: authToken(userA),
      method: 'POST',
      headers: { 'Idempotency-Key': 'research-answer-key-0001' },
      body: {
        query: 'İşe iade davasında altı aylık kıdem şartının istisnaları nelerdir?',
        sessionId: personalSessionId,
        caseId: personalCaseId,
        effectiveAt: '2021-06-01',
        filters: { legalDomain: 'İş Hukuku' },
      },
    });
    assert.equal(repeated.data.data.answerId, answerId);
    const count = await adminPool.query(
      `SELECT count(*)::int AS count FROM legal_research_answers
       WHERE session_id = $1 AND idempotency_key = 'research-answer-key-0001'`,
      [personalSessionId]
    );
    assert.equal(count.rows[0].count, 1);

    const followUp = await api(baseUrl, '/api/v1/legal-research/answer', {
      token: authToken(userA),
      method: 'POST',
      headers: { 'Idempotency-Key': 'research-answer-key-0002' },
      body: {
        query: 'Bu şart fesih tarihinde mi değerlendirilir?',
        sessionId: personalSessionId,
        caseId: personalCaseId,
        effectiveAt: '2021-06-01',
        filters: { legalDomain: 'İş Hukuku' },
      },
    });
    assert.equal(followUp.response.status, 200);
    assert.notEqual(followUp.data.data.answerId, answerId);
    const messages = await adminPool.query(
      `SELECT role, count(*)::int AS count
       FROM legal_research_messages WHERE session_id = $1 GROUP BY role`,
      [personalSessionId]
    );
    const counts = Object.fromEntries(messages.rows.map((row) => [row.role, row.count]));
    assert.equal(counts.USER, 2);
    assert.equal(counts.ASSISTANT, 2);
  });

  await t.test('unsupported claims are hidden while rejected verification remains recorded', async () => {
    const unsupportedGenerator = {
      async generate({ sources }) {
        return {
          answer: {
            summary: 'Doğrulanamayacak cevap',
            analysis: [{
              claimKey: 'unsupported-1',
              text: 'Kuantum deniz hukuku sonucu kesin olarak değiştirir.',
              sourceIds: [sources[0].sourceId],
              counterSourceIds: [],
            }],
            counterArguments: [],
            missingInformation: [],
            warnings: [],
            confidence: { level: 'HIGH', reason: 'Fake' },
          },
          usage: { provider: 'fake', model: 'unsupported', inputTokens: 1, outputTokens: 1, estimatedCost: 0 },
        };
      },
    };
    const service = new LegalResearchService({
      db: adminPool,
      searchService,
      sourceRepository: repository,
      sessionService,
      answerGenerator: unsupportedGenerator,
      citationVerifier: new CitationVerifier({ repository }),
      auditLogService: { async record() {} },
    });
    const session = await sessionService.create({
      accessContext: accessContext(userA, [firmA]),
      title: 'Unsupported claim',
    });
    const result = await service.answer({
      query: 'Altı aylık kıdem şartı nedir?',
      sessionId: session.id,
      filters: { legalDomain: 'İş Hukuku' },
      idempotencyKey: 'unsupported-answer-0001',
    }, accessContext(userA, [firmA]));
    assert.equal(result.status, 'INSUFFICIENT');
    assert.equal(result.analysis.length, 0);
    assert.equal(result.citations.length, 0);
    const rejected = await adminPool.query(
      `SELECT count(*)::int AS count
       FROM legal_research_answer_citations citation
       JOIN legal_research_answers answer ON answer.id = citation.answer_id
       WHERE answer.session_id = $1 AND citation.verification_status = 'REJECTED'`,
      [session.id]
    );
    assert.equal(rejected.rows[0].count >= 1, true);
  });

  await t.test('provider outage returns retrieved sources without an invented synthesis', async () => {
    const unavailableGenerator = {
      async generate() {
        throw Object.assign(new Error('LLM provider credentials are invalid.'), {
          code: 'PROVIDER_UNCONFIGURED',
          status: 503,
        });
      },
    };
    const service = new LegalResearchService({
      db: adminPool,
      searchService,
      sourceRepository: repository,
      sessionService,
      answerGenerator: unavailableGenerator,
      citationVerifier: new CitationVerifier({ repository }),
      auditLogService: { async record() {} },
    });
    const session = await sessionService.create({
      accessContext: accessContext(userA, [firmA]),
      title: 'Provider fallback',
    });
    const result = await service.answer({
      query: 'Altı aylık kıdem şartı nedir?',
      sessionId: session.id,
      filters: { legalDomain: 'İş Hukuku' },
      idempotencyKey: 'provider-fallback-0001',
    }, accessContext(userA, [firmA]));
    assert.equal(result.status, 'INSUFFICIENT');
    assert.equal(result.analysis.length, 0);
    assert.equal(result.citations.length > 0, true);
    assert.match(result.warnings.join(' '), /credentials are invalid/i);
  });

  await t.test('invalid model output returns retrieved sources instead of a server error', async () => {
    const invalidOutputGenerator = {
      async generate() {
        throw Object.assign(new Error('Model output does not match the legal research schema.'), {
          code: 'INVALID_RESEARCH_SCHEMA',
          usage: {
            provider: 'gemini',
            model: 'gemini-test',
            inputTokens: 10,
            outputTokens: 10,
            estimatedCost: 0,
          },
        });
      },
    };
    const service = new LegalResearchService({
      db: adminPool,
      searchService,
      sourceRepository: repository,
      sessionService,
      answerGenerator: invalidOutputGenerator,
      citationVerifier: new CitationVerifier({ repository }),
      auditLogService: { async record() {} },
    });
    const session = await sessionService.create({
      accessContext: accessContext(userA, [firmA]),
      title: 'Invalid output fallback',
    });
    const result = await service.answer({
      query: 'Altı aylık kıdem şartı nedir?',
      sessionId: session.id,
      filters: { legalDomain: 'İş Hukuku' },
      idempotencyKey: 'invalid-output-fallback-0001',
    }, accessContext(userA, [firmA]));
    assert.equal(result.status, 'INSUFFICIENT');
    assert.equal(result.analysis.length, 0);
    assert.equal(result.citations.length > 0, true);
    assert.match(result.warnings.join(' '), /semasini gecemedi/i);
    assert.equal(result.usage.provider, 'gemini');
  });

  await t.test('insufficient local evidence hydrates bounded on-demand decisions and retries once', async () => {
    let onDemandCalls = 0;
    const onDemandSourceService = {
      shouldHydrate({ localSourceCount }) {
        return localSourceCount === 0;
      },
      async hydrate() {
        onDemandCalls += 1;
        await ingestion.ingestDecision({
          sourceName: 'bedesten_yargitay',
          externalId: 'on-demand-copyright-1',
          officialSource: true,
          court: 'Yargıtay',
          chamber: '11. Hukuk Dairesi',
          caseNumber: '2025/500',
          decisionNumber: '2026/600',
          decisionDate: '2026-01-15',
          content: 'Telif hakki ve eser sahipligi hukuki sorumluluk bakimindan birlikte degerlendirilir.',
          metadata: { onDemand: true, provider: 'bedesten' },
        });
        return {
          attempted: true,
          remoteResultCount: 1,
          fetchedCount: 1,
          ingestedCount: 1,
          newSourceCount: 1,
        };
      },
    };
    const service = new LegalResearchService({
      db: adminPool,
      searchService,
      sourceRepository: repository,
      sessionService,
      answerGenerator: new LegalAnswerGenerator({ llm: fakeLlm(), maxAttempts: 1 }),
      citationVerifier: new CitationVerifier({ repository }),
      onDemandSourceService,
      auditLogService: { async record() {} },
    });
    const session = await sessionService.create({
      accessContext: accessContext(userA, [firmA]),
      title: 'On-demand source hydration',
    });
    const result = await service.answer({
      query: 'telif hakki eser sahipligi',
      sessionId: session.id,
      idempotencyKey: 'on-demand-source-hydration-0001',
    }, accessContext(userA, [firmA]));
    assert.equal(onDemandCalls, 1);
    assert.equal(result.status, 'COMPLETED');
    assert.equal(result.citations.length > 0, true);
    assert.equal(result.citations.some((citation) => citation.title.includes('Yarg')), true);
  });

  await t.test('insufficient sources do not invoke the LLM and case access is enforced', async () => {
    const callsBefore = llm.calls;
    const emptySession = await sessionService.create({
      accessContext: accessContext(userA, [firmA]),
      title: 'Yetersiz kaynak',
    });
    const insufficient = await researchService.answer({
      query: 'zqxjv benzersiz kaynaksız hukuk sorusu',
      sessionId: emptySession.id,
      idempotencyKey: 'insufficient-answer-0001',
    }, accessContext(userA, [firmA]));
    assert.equal(insufficient.status, 'INSUFFICIENT');
    assert.equal(llm.calls, callsBefore);

    const denied = await api(baseUrl, '/api/v1/legal-research/answer', {
      token: authToken(userB),
      method: 'POST',
      headers: { 'Idempotency-Key': 'denied-case-answer-0001' },
      body: {
        query: 'Altı aylık kıdem şartı nedir?',
        caseId: personalCaseId,
        filters: {},
      },
    });
    assert.equal(denied.response.status, 404);
  });

  await t.test('verified answer can be saved as a Matter note', async () => {
    const saved = await api(
      baseUrl,
      `/api/v1/legal-research/sessions/${personalSessionId}/answers/${answerId}/save-to-matter`,
      {
        token: authToken(userA),
        method: 'POST',
        body: { title: 'Kıdem araştırması notu' },
      }
    );
    assert.equal(saved.response.status, 201);
    assert.equal(saved.data.data.case_id, personalCaseId);
    const note = await adminPool.query('SELECT content FROM matter_research_notes WHERE answer_id = $1', [answerId]);
    assert.equal(note.rows[0].content.includes('Kaynaklara dayalı'), true);
  });

  await t.test('answer endpoint applies a per-user rate limit', async () => {
    let last;
    for (let index = 0; index < 6; index += 1) {
      last = await api(baseUrl, '/api/v1/legal-research/answer', {
        token: authToken(userB),
        method: 'POST',
        body: { query: 'xx' },
      });
      if (last.response.status === 429) break;
    }
    assert.equal(last.response.status, 429);
    assert.equal(last.data.code, 'LEGAL_RESEARCH_RATE_LIMITED');
  });

  await t.test('session history can be listed and soft-deleted', async () => {
    const list = await api(baseUrl, `/api/v1/legal-research/sessions?caseId=${personalCaseId}`, {
      token: authToken(userA),
    });
    assert.equal(list.response.status, 200);
    assert.equal(list.data.data.some((session) => session.id === personalSessionId), true);
    const deleted = await api(baseUrl, `/api/v1/legal-research/sessions/${personalSessionId}`, {
      token: authToken(userA),
      method: 'DELETE',
    });
    assert.equal(deleted.response.status, 204);
    const afterDelete = await api(baseUrl, `/api/v1/legal-research/sessions/${personalSessionId}`, {
      token: authToken(userA),
    });
    assert.equal(afterDelete.response.status, 404);
  });
});
