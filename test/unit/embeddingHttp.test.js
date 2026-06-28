const test = require('node:test');
const assert = require('node:assert/strict');

const { generateEmbedding } = require('../../src/utils/embedding');

test('embedding generation uses the isolated HTTP service', async (t) => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => [[0.1, 0.2, 0.3]] };
  };
  process.env.EMBEDDING_BASE_URL = 'http://embedding.test';
  const vector = await generateEmbedding('hukuki metin');
  assert.deepEqual(vector, [0.1, 0.2, 0.3]);
  assert.equal(request.url, 'http://embedding.test/embed');
  assert.deepEqual(JSON.parse(request.options.body), { inputs: ['hukuki metin'] });
});
