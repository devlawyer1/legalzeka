const test = require('node:test');
const assert = require('node:assert/strict');

const {
  BedestenOnDemandSourceService,
  htmlToText,
  normalizeDecisionDate,
  queryPhrase,
} = require('../../src/services/legalResearch/BedestenOnDemandSourceService');

test('Bedesten on-demand source hydration is bounded, normalized and cached', async () => {
  const records = [];
  const calls = [];
  const documentText = `GEREKCE ${'Telif hakki ve eser sahipligi hukuki sorumluluk dogurur. '.repeat(8)}`;
  const httpClient = {
    async post(endpoint, payload) {
      calls.push({ endpoint, payload });
      if (endpoint.endsWith('searchDocuments')) {
        return {
          data: {
            metadata: { FMTY: 'SUCCESS' },
            data: {
              emsalKararList: [{
                documentId: 'bedesten-doc-1',
                birimAdi: '11. Hukuk Dairesi',
                esasNo: '2025/10',
                kararNo: '2026/20',
                kararTarihiStr: '01.06.2026',
              }],
            },
          },
        };
      }
      return {
        data: {
          metadata: { FMTY: 'SUCCESS' },
          data: {
            mimeType: 'text/html',
            content: Buffer.from(`<html><script>ignore()</script><p>${documentText}</p></html>`).toString('base64'),
          },
        },
      };
    },
  };
  const service = new BedestenOnDemandSourceService({
    enabled: true,
    maxDocuments: 3,
    minLocalSources: 2,
    requestDelayMs: 0,
    httpClient,
    ingestionService: {
      async ingestDecision(record) {
        records.push(record);
        return { sourceId: 'source-1', canonicalChanged: true };
      },
    },
  });

  assert.equal(service.shouldHydrate({ localSourceCount: 0, request: { filters: {} } }), true);
  assert.equal(service.shouldHydrate({
    localSourceCount: 0,
    request: { filters: { sourceTypes: ['LEGISLATION'] } },
  }), false);
  assert.equal(service.shouldHydrate({
    localSourceCount: 0,
    request: { filters: { sourceTypes: ['ADMINISTRATIVE_DECISION'] } },
  }), false);
  assert.equal(service.shouldHydrate({
    localSourceCount: 0,
    request: { filters: { sourceTypes: ['COURT_DECISION'] } },
  }), true);

  const first = await service.hydrate({
    query: 'Yapay zeka telif hakki sorumluluk',
    requestId: 'request-1',
  });
  assert.equal(first.ingestedCount, 1);
  assert.equal(first.newSourceCount, 1);
  assert.equal(records.length, 1);
  assert.equal(records[0].externalId, 'bedesten-doc-1');
  assert.equal(records[0].decisionDate, '2026-06-01');
  assert.equal(records[0].content.includes('ignore()'), false);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].payload.data.pageSize, 3);

  const second = await service.hydrate({
    query: 'Yapay zeka telif hakki sorumluluk',
    requestId: 'request-2',
  });
  assert.equal(second.cacheHit, true);
  assert.equal(second.requestId, 'request-2');
  assert.equal(calls.length, 2);
});

test('Bedesten helpers keep query and document normalization deterministic', () => {
  assert.equal(queryPhrase('Telif hakkı ve telif hakkı sorumluluğu'), 'telif hakkı sorumluluğu');
  assert.equal(normalizeDecisionDate('2/7/2026'), '2026-07-02');
  assert.equal(htmlToText('<p>Birinci</p><p>İkinci</p>'), 'Birinci\nİkinci');
});

test('Bedesten provider failure returns a safe fallback result', async () => {
  const service = new BedestenOnDemandSourceService({
    enabled: true,
    circuitFailures: 1,
    requestDelayMs: 0,
    retryAttempts: 0,
    httpClient: {
      async post() {
        const error = new Error('timeout with upstream detail');
        error.code = 'ETIMEDOUT';
        throw error;
      },
    },
    ingestionService: { async ingestDecision() { throw new Error('must not run'); } },
  });
  const result = await service.hydrate({ query: 'kira tahliye' });
  assert.equal(result.ingestedCount, 0);
  assert.equal(result.safeErrorCode, 'BEDESTEN_TIMEOUT');
  assert.equal(Object.hasOwn(result, 'error'), false);
});

test('Bedesten application errors receive one bounded retry', async () => {
  let searchCalls = 0;
  const service = new BedestenOnDemandSourceService({
    enabled: true,
    requestDelayMs: 0,
    retryAttempts: 1,
    retryBaseDelayMs: 1,
    httpClient: {
      async post(endpoint) {
        if (endpoint.endsWith('searchDocuments')) {
          searchCalls += 1;
          if (searchCalls === 1) {
            return { data: { metadata: { FMTY: 'ERROR', FMTE: 'Temporary upstream error' } } };
          }
          return {
            data: {
              metadata: { FMTY: 'SUCCESS' },
              data: { emsalKararList: [] },
            },
          };
        }
        throw new Error('document endpoint must not run');
      },
    },
    ingestionService: { async ingestDecision() { throw new Error('must not run'); } },
  });

  const result = await service.hydrate({ query: 'muvazaa iptal davasi' });
  assert.equal(searchCalls, 2);
  assert.equal(result.safeErrorCode, undefined);
  assert.equal(result.remoteResultCount, 0);
});
