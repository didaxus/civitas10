const test = require('node:test');
const assert = require('node:assert/strict');
const { enqueueScimOperation, applyScimOperationEvent, stableOperationKey, SCIM_EVENT_TYPE } = require('../scim/scimOperationLedger');

function memoryRepo() {
  const operations = new Map();
  const events = [];
  const receipts = new Map();
  const deadLetters = [];
  return {
    operations, events, receipts, deadLetters,
    async findOperationByIdempotencyKey({ organizationId, idempotencyKey }) { return [...operations.values()].find((o) => o.organizationId === organizationId && o.idempotencyKey === idempotencyKey) || null; },
    async createOperation(input) { const row = { id: `op-${operations.size + 1}`, version: 1, operation_state: 'accepted', status: 'accepted', ...input }; operations.set(row.id, row); return row; },
    async markOperationQueued({ operationId }) { const op = operations.get(operationId); op.operation_state = 'queued'; op.status = 'queued'; op.version += 1; return op; },
    async appendEvent(event) { events.push(event); return event; },
    async claimInbox({ consumerId, event, leaseOwner }) { const key = `${consumerId}|${event.eventId}`; if (receipts.get(key)?.state === 'processed') { const e = new Error('duplicate'); e.code = 'integration_inbox_duplicate'; throw e; } const row = { consumerId, eventId: event.eventId, state: 'processing', leaseOwner, lease_owner: leaseOwner }; receipts.set(key, row); return row; },
    async markInboxProcessed({ consumerId, eventId, result }) { const row = receipts.get(`${consumerId}|${eventId}`); row.state = 'processed'; row.result = result; return row; },
    async moveInboxToDeadLetter(input) { deadLetters.push(input); },
    async getOperation({ operationId }) { return operations.get(operationId); },
    async transitionOperation({ operationId, toState, result }) { const op = operations.get(operationId); op.operation_state = toState; op.status = toState; op.result = result; return op; },
  };
}

test('SCIM ledger creates a durable operation and outbox event with stable idempotency', async () => {
  const repository = memoryRepo();
  const payload = { externalIssuer: 'https://idp.example', externalSubject: 'A123', email: 'ada@example.edu' };
  const first = await enqueueScimOperation({ repository, organizationId: 'org-1', operationKind: 'ensure_user', payload });
  const second = await enqueueScimOperation({ repository, organizationId: 'org-1', operationKind: 'ensure_user', payload });
  assert.equal(first.idempotencyKey, stableOperationKey({ organizationId: 'org-1', operationKind: 'ensure_user', ...payload }));
  assert.equal(second.idempotent, true);
  assert.equal(repository.events.length, 1);
  assert.equal(repository.events[0].eventType, SCIM_EVENT_TYPE);
  assert.equal(repository.events[0].eventId, first.eventId);
});

test('SCIM event consumer calls only the LogtoManagementAdapter port and records inbox receipt', async () => {
  const repository = memoryRepo();
  await enqueueScimOperation({ repository, organizationId: 'org-1', operationKind: 'ensure_membership', payload: { userId: 'user-1' } });
  const calls = [];
  const adapter = { async ensureOrganizationMembership(input) { calls.push(['ensureOrganizationMembership', input]); return { ok: true }; } };
  const result = await applyScimOperationEvent({ repository, adapter, event: repository.events[0] });
  assert.equal(result.state, 'processed');
  assert.deepEqual(calls, [['ensureOrganizationMembership', { organizationId: 'org-1', userId: 'user-1' }]]);
  assert.equal([...repository.receipts.values()][0].state, 'processed');
});

test('SCIM event consumer moves terminal adapter failures to the shared DLQ', async () => {
  const repository = memoryRepo();
  await enqueueScimOperation({ repository, organizationId: 'org-1', operationKind: 'suspend_access', payload: { userId: 'user-1' } });
  await assert.rejects(() => applyScimOperationEvent({ repository, adapter: { async suspendOrganizationAccess() { throw new Error('remote failed'); } }, event: repository.events[0] }), /remote failed/);
  assert.equal(repository.deadLetters.length, 1);
  assert.equal(repository.deadLetters[0].reasonCode, 'scim_logto_management_operation_failed');
});
