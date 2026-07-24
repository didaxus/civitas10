const test = require('node:test');
const assert = require('node:assert/strict');
const { createSeatChangeWorkflowRuntime, createInMemorySeatChangeRepository, SEAT_CHANGE_REASON_CODES } = require('../authorization/runtime/billing/seatChangeWorkflowRuntime');
const { provisionScimUserAccess, SCIM_ERROR_SCHEMA } = require('../identity-federation/scimUserProvisioning');

function runtime(status, extra = {}) {
  return createSeatChangeWorkflowRuntime({
    repository: createInMemorySeatChangeRepository(),
    seatProvider: { async evaluateAvailability(input) { extra.capacityInput = input; return { status, availableSeats: status === 'available' ? 1 : 0, capacityLimit: 10 }; } },
    pendingOperationFactory: async () => 'op_capacity_1',
  });
}

test('SCIM create blocks before Logto organization access when seat capacity is unavailable', async () => {
  const reconciliation = {};
  const calls = [];
  const result = await provisionScimUserAccess({
    organizationId: 'org_1',
    userId: 'user_1',
    scimUser: { id: 'scim_1', active: true },
    operation: 'create',
    seatWorkflowRuntime: runtime('unavailable'),
    logtoClient: { async addUserToLogtoOrganization(input) { calls.push(input); } },
    reconciliation,
  });
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 409);
  assert.deepEqual(result.response.body.schemas, [SCIM_ERROR_SCHEMA]);
  assert.equal(result.response.body.status, '409');
  assert.equal(result.reconciliationResult.status, 'blocked');
  assert.equal(result.reconciliationResult.reasonCode, SEAT_CHANGE_REASON_CODES.CAPACITY_UNAVAILABLE);
  assert.equal(reconciliation.results[0].status, 'blocked');
  assert.equal(calls.length, 0);
});

test('SCIM reactivate returns accepted pending operation before Logto when capacity is unknown', async () => {
  const reconciliation = {};
  const calls = [];
  const result = await provisionScimUserAccess({
    organizationId: 'org_1',
    userId: 'user_2',
    operation: 'reactivate',
    seatWorkflowRuntime: runtime('unknown'),
    logtoClient: { async addUserToLogtoOrganization(input) { calls.push(input); } },
    reconciliation,
  });
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 202);
  assert.equal(result.response.body.civitas.operationId, 'op_capacity_1');
  assert.equal(result.reconciliationResult.status, 'pending');
  assert.equal(calls.length, 0);
});

test('SCIM create ensures active Logto access only after capacity is available', async () => {
  const extra = {};
  const calls = [];
  const result = await provisionScimUserAccess({
    organizationId: 'org_1',
    userId: 'user_3',
    operation: 'create',
    seatWorkflowRuntime: runtime('available', extra),
    logtoClient: {
      async ensureUserActive(input) { calls.push(['ensureUserActive', input.userId]); },
      async addUserToLogtoOrganization(input) { calls.push(['addUserToLogtoOrganization', input.userId]); },
    },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [['ensureUserActive', 'user_3'], ['addUserToLogtoOrganization', 'user_3']]);
  assert.equal(extra.capacityInput.requestedDelta, 1);
  assert.equal(extra.capacityInput.operation, 'scim_user_create');
});
