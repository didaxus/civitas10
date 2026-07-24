const { randomUUID } = require('node:crypto');
const { OPERATION_STATUSES } = require('../contracts/foundation');
const { evaluateMassDeprovisionGuard } = require('./massDeprovisionGuard');

const IDENTITY_FEDERATION_OPERATION_TYPES = Object.freeze({
  RECONCILIATION_PLAN_CREATE: 'identity_federation.reconciliation_plan.create',
  RECONCILIATION_APPLY: 'identity_federation.reconciliation.apply',
});

class IdentityFederationApplyError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'IdentityFederationApplyError';
    this.details = details;
  }
}

function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }

function createInMemoryIdentityFederationApplyRepository() {
  const attempts = new Map();
  const assignments = new Map();
  const deadLetters = [];
  const operations = [];
  const key = ({ organizationId, connectionId, assignmentId }) => `${organizationId}|${connectionId}|${assignmentId}`;
  return {
    attempts, assignments, deadLetters, operations,
    async findApplyAttemptByIdempotencyKey({ organizationId, idempotencyKey }) { return clone([...attempts.values()].find((a) => a.organizationId === organizationId && a.idempotencyKey === idempotencyKey)) || null; },
    async createOperation(input) { const row = { id: input.operationId || `op_${operations.length + 1}`, status: OPERATION_STATUSES.PROCESSING, createdAt: new Date().toISOString(), ...clone(input) }; operations.push(row); return clone(row); },
    async createApplyAttempt(input) { const row = { id: input.attemptId || `ifa_${attempts.size + 1}`, status: OPERATION_STATUSES.PROCESSING, startedAt: new Date().toISOString(), completedAt: null, result: null, problem: null, ...clone(input) }; attempts.set(row.id, row); return clone(row); },
    async updateApplyAttempt(id, patch) { const row = attempts.get(id); if (!row) throw new Error(`Apply attempt not found: ${id}`); Object.assign(row, clone(patch)); attempts.set(id, row); return clone(row); },
    async upsertAssignmentSource(input) { const row = { source: 'federated', updatedAt: new Date().toISOString(), ...clone(input) }; assignments.set(key(row), row); return clone(row); },
    async removeAssignmentSource(input) { const k = key(input); const row = assignments.get(k); assignments.delete(k); return clone(row) || null; },
    async writeDeadLetter(input) { const row = { id: input.id || `dlq_${deadLetters.length + 1}`, sourceKind: 'identity_federation_apply', reconciliationStatus: 'open', createdAt: new Date().toISOString(), ...clone(input) }; deadLetters.push(row); return clone(row); },
    async emitEvent(input) { const row = { id: input.id || `evt_${deadLetters.length + operations.length + 1}`, createdAt: new Date().toISOString(), ...clone(input) }; operations.push({ operationType: row.type, status: 'recorded', event: row }); return clone(row); },
  };
}

function normalizeActor(actor) {
  return { type: actor?.type || 'user', logtoUserId: actor?.logtoUserId || actor?.sub || null, reason: actor?.reason || null, correlationId: actor?.correlationId || randomUUID(), provenance: actor?.provenance || {} };
}

async function applyIdentityFederationReconciliation({ repository, logtoClient, plan, idempotencyKey, actor, guardConfig, currentState, approval, now }) {
  if (!repository || !logtoClient) throw new Error('repository and logtoClient are required');
  if (!plan?.organizationId || !plan?.connectionId) throw new Error('plan.organizationId and plan.connectionId are required');
  if (!idempotencyKey) throw new Error('Idempotency-Key is required');
  const existing = await repository.findApplyAttemptByIdempotencyKey({ organizationId: plan.organizationId, idempotencyKey });
  if (existing) return { idempotent: true, attempt: existing, result: existing.result };

  const actorProvenance = normalizeActor(actor);
  const retryMetadata = { retryable: true, compensation: { strategy: 'replan_from_logto_remote_state', localMutationBoundary: 'after_logto_success' } };
  const operation = await repository.createOperation({ organizationId: plan.organizationId, operationType: IDENTITY_FEDERATION_OPERATION_TYPES.RECONCILIATION_APPLY, moduleId: 'identity-federation', capabilityId: 'identity.federation', requestedBy: actorProvenance, input: { connectionId: plan.connectionId, mappingVersion: plan.mappingVersion, policyVersion: plan.policyVersion, idempotencyKey } });
  const attempt = await repository.createApplyAttempt({ organizationId: plan.organizationId, connectionId: plan.connectionId, mappingVersion: plan.mappingVersion, policyVersion: plan.policyVersion, idempotencyKey, actorProvenance, operationId: operation.id, retryMetadata });
  const applied = [];
  const adds = plan.adds || [];
  const removes = plan.removes || [];
  const guard = evaluateMassDeprovisionGuard({ plan, guardConfig: guardConfig || plan.guardConfig, currentState: currentState || plan.currentState, approval: approval || plan.approval, now });
  if (!guard.allowed) {
    if (guard.event && repository.emitEvent) await repository.emitEvent({ ...guard.event, correlationId: actorProvenance.correlationId });
    const result = { blocked: true, preserveExistingAccess: guard.preserveExistingAccess, retryMetadata: { ...retryMetadata, retryable: false }, dryRunPlan: guard.dryRunPlan, event: guard.event };
    return { idempotent: false, attempt: await repository.updateApplyAttempt(attempt.id, { status: OPERATION_STATUSES.FAILED, completedAt: new Date().toISOString(), result, problem: { reasonCode: 'scim_mass_deprovision_guard_triggered', dryRunPlan: guard.dryRunPlan } }), result };
  }
  try {
    for (const item of adds) {
      await logtoClient.addOrganizationRoleAssignment({ organizationId: plan.organizationId, userId: item.userId, roleId: item.roleId });
      await repository.upsertAssignmentSource({ organizationId: plan.organizationId, connectionId: plan.connectionId, assignmentId: item.assignmentId || `${item.userId}:${item.roleId}`, userId: item.userId, roleId: item.roleId, mappingVersion: plan.mappingVersion, policyVersion: plan.policyVersion, actorProvenance, idempotencyKey });
      applied.push({ action: 'add', userId: item.userId, roleId: item.roleId });
    }
    for (const item of removes) {
      await logtoClient.removeOrganizationRoleAssignment({ organizationId: plan.organizationId, userId: item.userId, roleId: item.roleId });
      await repository.removeAssignmentSource({ organizationId: plan.organizationId, connectionId: plan.connectionId, assignmentId: item.assignmentId || `${item.userId}:${item.roleId}` });
      applied.push({ action: 'remove', userId: item.userId, roleId: item.roleId });
    }
    const result = { applied, retryMetadata };
    return { idempotent: false, attempt: await repository.updateApplyAttempt(attempt.id, { status: OPERATION_STATUSES.SUCCESS, completedAt: new Date().toISOString(), result }), result };
  } catch (error) {
    const failure = { message: error.message, applied, failedAfterLocalSafePoint: true, retryMetadata };
    await repository.writeDeadLetter({ sourceId: attempt.id, eventId: operation.id, eventType: IDENTITY_FEDERATION_OPERATION_TYPES.RECONCILIATION_APPLY, organizationId: plan.organizationId, connectionId: plan.connectionId, consumerId: 'logto.management', attemptCount: 1, terminalReasonCode: 'logto_management_mutation_failed', failureJson: failure, correlationId: actorProvenance.correlationId });
    await repository.updateApplyAttempt(attempt.id, { status: OPERATION_STATUSES.FAILED, completedAt: new Date().toISOString(), problem: failure });
    throw new IdentityFederationApplyError('Logto identity federation apply failed', failure);
  }
}

module.exports = { IDENTITY_FEDERATION_OPERATION_TYPES, IdentityFederationApplyError, createInMemoryIdentityFederationApplyRepository, applyIdentityFederationReconciliation };
