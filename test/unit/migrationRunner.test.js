const test = require('node:test');
const assert = require('node:assert/strict');

const { checksum } = require('../../src/utils/migrate');
const { getTestDatabaseUrl } = require('../helpers/testDatabase');

test('migration checksums are deterministic and content-sensitive', () => {
  assert.equal(checksum('SELECT 1;'), checksum('SELECT 1;'));
  assert.notEqual(checksum('SELECT 1;'), checksum('SELECT 2;'));
});

test('test database guard rejects non-test database names', () => {
  const original = process.env.TEST_DATABASE_URL;
  process.env.TEST_DATABASE_URL = 'postgresql://localhost/production';
  assert.throws(() => getTestDatabaseUrl(), /dedicated database/);
  if (original === undefined) delete process.env.TEST_DATABASE_URL;
  else process.env.TEST_DATABASE_URL = original;
});
