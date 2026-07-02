const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeLlmProviderError } = require('../../src/services/llmService');

test('invalid provider credentials become a safe configuration error', () => {
  const original = new Error('AWS Bedrock hatasi: The security token included in the request is invalid.');
  const normalized = normalizeLlmProviderError(original, 'bedrock');
  assert.equal(normalized.code, 'PROVIDER_UNCONFIGURED');
  assert.equal(normalized.status, 503);
  assert.doesNotMatch(normalized.message, /security token/i);
});

test('unknown provider failures become safe availability errors', () => {
  const normalized = normalizeLlmProviderError(new Error('socket closed'), 'gemini');
  assert.equal(normalized.code, 'PROVIDER_UNAVAILABLE');
  assert.equal(normalized.status, 503);
});
