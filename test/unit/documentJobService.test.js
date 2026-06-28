const test = require('node:test');
const assert = require('node:assert/strict');

const { getBackoffMs, safeErrorMessage } = require('../../src/services/documentJobService');

test('document job retry uses bounded exponential schedule', () => {
  const previous = process.env.DOCUMENT_JOB_BACKOFF_MS;
  process.env.DOCUMENT_JOB_BACKOFF_MS = '10,100,1000';
  try {
    assert.equal(getBackoffMs(1), 10);
    assert.equal(getBackoffMs(2), 100);
    assert.equal(getBackoffMs(3), 1000);
    assert.equal(getBackoffMs(99), 1000);
  } finally {
    if (previous === undefined) delete process.env.DOCUMENT_JOB_BACKOFF_MS;
    else process.env.DOCUMENT_JOB_BACKOFF_MS = previous;
  }
});

test('worker error messages do not expose local paths', () => {
  const sanitized = safeErrorMessage('failed at C:\\secret\\matter\\document.pdf\nstack');
  assert.equal(sanitized.includes('secret'), false);
  assert.equal(sanitized.includes('\n'), false);
});
