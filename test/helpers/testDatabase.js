const { URL } = require('url');

const DEFAULT_TEST_DATABASE_URL =
  'postgresql://postgres:postgrespassword@127.0.0.1:55432/legalzeka_test';

function getTestDatabaseUrl() {
  const databaseUrl = process.env.TEST_DATABASE_URL || DEFAULT_TEST_DATABASE_URL;
  const parsed = new URL(databaseUrl);
  const databaseName = parsed.pathname.replace(/^\//, '').toLocaleLowerCase('en-US');

  if (!databaseName.includes('test')) {
    throw new Error(
      `Integration tests require a dedicated database whose name contains "test"; received "${databaseName}".`
    );
  }

  return databaseUrl;
}

module.exports = { DEFAULT_TEST_DATABASE_URL, getTestDatabaseUrl };
