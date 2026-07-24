const test = require('node:test');
const assert = require('node:assert/strict');
const { OPERATION_TYPES } = require('../contracts/foundation');
const { createInMemoryIdentityFederationApplyRepository, applyIdentityFederationReconciliation, IdentityFederationApplyError, IDENTITY_FEDERATION_OPERATION_TYPES } = require('../identity-federation/reconciliationApplyService');

function plan() { return { organizationId: 'org-A', connectionId: 'conn-1', mappingVersion: 'map-v3', policyVersion: 'policy-v2', adds: [{ userId: 'u-add', roleId: 'r-student' }], removes: [{ userId: 'u-rem', roleId: 'r-old' }] }; }
function client(failOn) { const calls = []; return { calls, async addOrganizationRoleAssignment(input) { calls.push({ method: 'add', ...input }); if (failOn === 'add') throw new Error('logto add failed'); }, async removeOrganizationRoleAssignment(input) { calls.push({ method: 'remove', ...input }); if (failOn === 'remove') throw new Error('logto remove failed'); } }; }

const actor = { type: 'user', logtoUserId: 'owner-1', reason: 'reconcile', correlationId: 'corr-1', provenance: { surface: 'owner' } };

test('operation types include identity federation plan creation and apply', () => {
  assert.equal(OPERATION_TYPES.IDENTITY_FEDERATION_RECONCILIATION_PLAN_CREATE, IDENTITY_FEDERATION_OPERATION_TYPES.RECONCILIATION_PLAN_CREATE);
  assert.equal(OPERATION_TYPES.IDENTITY_FEDERATION_RECONCILIATION_APPLY, IDENTITY_FEDERATION_OPERATION_TYPES.RECONCILIATION_APPLY);
});

test('duplicate apply requests with the same Idempotency-Key reuse persisted attempt', async () => {
  const repository = createInMemoryIdentityFederationApplyRepository();
  const logtoClient = client();
  const first = await applyIdentityFederationReconciliation({ repository, logtoClient, plan: plan(), idempotencyKey: 'idem-1', actor });
  const second = await applyIdentityFederationReconciliation({ repository, logtoClient, plan: plan(), idempotencyKey: 'idem-1', actor });
  assert.equal(first.idempotent, false);
  assert.equal(second.idempotent, true);
  assert.equal(repository.attempts.size, 1);
  assert.equal(logtoClient.calls.length, 2);
});

test('apply persists attempt metadata and executes adds before removes', async () => {
  const repository = createInMemoryIdentityFederationApplyRepository();
  const logtoClient = client();
  await applyIdentityFederationReconciliation({ repository, logtoClient, plan: plan(), idempotencyKey: 'idem-meta', actor });
  const attempt = [...repository.attempts.values()][0];
  assert.equal(attempt.organizationId, 'org-A');
  assert.equal(attempt.connectionId, 'conn-1');
  assert.equal(attempt.mappingVersion, 'map-v3');
  assert.equal(attempt.policyVersion, 'policy-v2');
  assert.equal(attempt.idempotencyKey, 'idem-meta');
  assert.equal(attempt.actorProvenance.logtoUserId, 'owner-1');
  assert.deepEqual(logtoClient.calls.map((c) => c.method), ['add', 'remove']);
});

test('partial Logto failure writes DLQ and records retry/compensation metadata', async () => {
  const repository = createInMemoryIdentityFederationApplyRepository();
  await assert.rejects(() => applyIdentityFederationReconciliation({ repository, logtoClient: client('remove'), plan: plan(), idempotencyKey: 'idem-fail', actor }), IdentityFederationApplyError);
  assert.equal(repository.deadLetters.length, 1);
  assert.equal(repository.deadLetters[0].terminalReasonCode, 'logto_management_mutation_failed');
  assert.equal(repository.deadLetters[0].failureJson.retryMetadata.compensation.strategy, 'replan_from_logto_remote_state');
  const attempt = [...repository.attempts.values()][0];
  assert.equal(attempt.status, 'failed');
  assert.equal(attempt.retryMetadata.retryable, true);
});

test('local state is not mutated when corresponding Logto add mutation fails', async () => {
  const repository = createInMemoryIdentityFederationApplyRepository();
  await assert.rejects(() => applyIdentityFederationReconciliation({ repository, logtoClient: client('add'), plan: plan(), idempotencyKey: 'idem-add-fail', actor }), IdentityFederationApplyError);
  assert.equal(repository.assignments.size, 0);
  assert.equal(repository.deadLetters.length, 1);
});

test('mass deprovision guard blocks destructive reconciliation and exposes dry-run affected subjects', async () => {
  const repository = createInMemoryIdentityFederationApplyRepository();
  const logtoClient = client();
  const guardedPlan = { ...plan(), removes: [{ userId: 'u-1', roleId: 'r-old' }, { userId: 'u-2', roleId: 'r-old' }], activeUsersTotal: 10, membershipsTotal: 10 };
  const result = await applyIdentityFederationReconciliation({ repository, logtoClient, plan: guardedPlan, idempotencyKey: 'idem-guard', actor, guardConfig: { maxAbsoluteRemovals: 1, maxActiveUsersAffectedPercent: 10, maxMembershipsAffectedPercent: 10, manualApprovalThreshold: 2 } });
  assert.equal(result.result.blocked, true);
  assert.equal(result.result.preserveExistingAccess, true);
  assert.equal(result.result.event.type, 'scim.mass_deprovision_guard.triggered');
  assert.deepEqual(result.result.dryRunPlan.affectedSubjects.map((s) => s.subjectId), ['u-1', 'u-2']);
  assert.equal(logtoClient.calls.length, 0);
});

test('emergency fail-closed approval allows guarded destructive apply', async () => {
  const repository = createInMemoryIdentityFederationApplyRepository();
  const logtoClient = client();
  await applyIdentityFederationReconciliation({ repository, logtoClient, plan: { ...plan(), removes: [{ userId: 'u-1', roleId: 'r-old' }] }, idempotencyKey: 'idem-emergency', actor, guardConfig: { maxAbsoluteRemovals: 0 }, approval: { manualApproval: true, emergencyFailClosed: true } });
  assert.deepEqual(logtoClient.calls.map((c) => c.method), ['add', 'remove']);
});
