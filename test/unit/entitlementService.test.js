const test = require('node:test');
const assert = require('node:assert/strict');
const { EntitlementService } = require('../../src/services/education/EntitlementService');

function serviceFor(featureEntitlements) {
  return new EntitlementService({
    db: {
      async query() {
        return {
          rows: [{
            plan_name: 'Legacy plan',
            max_seats: 1,
            feature_entitlements: featureEntitlements,
          }],
        };
      },
    },
  });
}

test('legacy plans without feature flags preserve professional access', async () => {
  const service = serviceFor({ maxCases: 3, maxWorkflows: 5 });
  assert.equal(await service.has({ userId: 'legacy-user' }, 'PROFESSIONAL_MATTER'), true);
});

test('explicitly disabled professional access remains denied', async () => {
  const service = serviceFor({ EDU_WORKSPACE: true, PROFESSIONAL_MATTER: false });
  assert.equal(await service.has({ userId: 'student-user' }, 'PROFESSIONAL_MATTER'), false);
});

test('configured entitlement contracts fail closed for missing features', async () => {
  const service = serviceFor({ EDU_WORKSPACE: true });
  assert.equal(await service.has({ userId: 'configured-user' }, 'PROFESSIONAL_MATTER'), false);
});
