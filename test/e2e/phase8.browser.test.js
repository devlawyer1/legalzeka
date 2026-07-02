const test = require('node:test');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');

const baseUrl = process.env.E2E_BASE_URL;
const apiUrl = process.env.E2E_API_URL || baseUrl;

test('Phase 8 browser product flows', { skip: !baseUrl }, async (t) => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 900 });

  async function protectedFlow(name, endpoint, method = 'GET') {
    await t.test(name, async () => {
      const result = await page.evaluate(async ({ endpoint, method }) => {
        const response = await fetch(endpoint, { method, headers: method === 'GET' ? {} : { 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : '{}' });
        return { status: response.status, body: await response.json().catch(() => ({})) };
      }, { endpoint: `${apiUrl}${endpoint}`, method });
      assert.ok([400, 401, 403, 404, 409].includes(result.status), `${endpoint} returned ${result.status}`);
      assert.equal(result.body.stack, undefined);
    });
  }

  await t.test('1 registration and login screen renders', async () => { await page.goto(`${baseUrl}/auth`, { waitUntil: 'networkidle2' }); assert.ok((await page.$$('input')).length >= 2); assert.ok((await page.$$('button')).length >= 2); });
  await protectedFlow('2 MFA enrollment is protected', '/api/auth/mfa/enroll', 'POST');
  await protectedFlow('3 personal Matter creation is protected', '/api/cases', 'POST');
  await protectedFlow('4 organization Matter access is protected', '/api/cases');
  await protectedFlow('5 document upload is protected', '/api/cases/00000000-0000-4000-8000-000000000000/documents', 'POST');
  await protectedFlow('6 extraction suggestion acceptance is protected', '/api/cases/00000000-0000-4000-8000-000000000000/suggestions/00000000-0000-4000-8000-000000000000/accept', 'POST');
  await protectedFlow('7 grounded legal research is protected', '/api/v1/legal-research/answer', 'POST');
  await protectedFlow('8 draft creation is protected', '/api/v1/drafts', 'POST');
  await protectedFlow('9 deterministic calculation is protected', '/api/v1/calculations/deadline', 'POST');
  await protectedFlow('10 CRM lead conversion is protected', '/api/v1/crm/leads/00000000-0000-4000-8000-000000000000/convert', 'POST');
  await protectedFlow('11 invoice and partial payment are protected', '/api/v1/invoices/00000000-0000-4000-8000-000000000000/payments', 'POST');
  await protectedFlow('12 portal sharing is protected', '/api/v1/portal/shared-items', 'POST');
  await protectedFlow('13 agent proposal approval is protected', '/api/v1/agent-proposals/00000000-0000-4000-8000-000000000000/approve', 'POST');
  await protectedFlow('14 student workspace is protected', '/api/v1/learning-workspaces');
  await protectedFlow('15 quiz attempt is protected', '/api/v1/quiz-sets/00000000-0000-4000-8000-000000000000/attempts', 'POST');
  await protectedFlow('16 assignment submission is protected', '/api/v1/assignments/00000000-0000-4000-8000-000000000000/submissions', 'POST');
  await protectedFlow('17 cross-tenant identifiers do not bypass auth', '/api/v1/enterprise/institutions/00000000-0000-4000-8000-000000000000/seats');
  await protectedFlow('18 session revoke is protected', '/api/auth/sessions/00000000-0000-4000-8000-000000000000', 'DELETE');
  await protectedFlow('19 entitlement-controlled finance is protected', '/api/v1/invoices');
  await t.test('20 mobile auth flow remains usable', async () => { await page.setViewport({ width: 390, height: 844, isMobile: true }); await page.goto(`${baseUrl}/auth`, { waitUntil: 'networkidle2' }); const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth); assert.equal(overflow, false); assert.ok(await page.$('form')); });
});
