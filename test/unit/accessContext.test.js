const test = require('node:test');
const assert = require('node:assert/strict');

const { canUseOrganization, membershipFor } = require('../../src/services/accessContext');

const context = {
  userId: 'user-1',
  isSystemAdmin: false,
  memberships: [
    { lawFirmId: 'firm-a', role: 'avukat', canRead: true, canWrite: true, canAdmin: false },
    { lawFirmId: 'firm-b', role: 'ortak', canRead: true, canWrite: true, canAdmin: true },
  ],
};

test('organization permissions follow active membership roles', () => {
  assert.equal(canUseOrganization(context, 'firm-a', 'read'), true);
  assert.equal(canUseOrganization(context, 'firm-a', 'write'), true);
  assert.equal(canUseOrganization(context, 'firm-a', 'admin'), false);
  assert.equal(canUseOrganization(context, 'firm-b', 'admin'), true);
  assert.equal(canUseOrganization(context, 'firm-c', 'read'), false);
});

test('system administrators use the explicit global exception', () => {
  assert.equal(canUseOrganization({ isSystemAdmin: true, memberships: [] }, 'firm-x', 'admin'), true);
});

test('membership lookup never invents an organization membership', () => {
  assert.equal(membershipFor(context, 'firm-a').role, 'avukat');
  assert.equal(membershipFor(context, 'firm-x'), null);
});
