const { createHash } = require('node:crypto');
const { ENVELOPE_VERSION, OPERATION_STATES, createIntegrationEvent } = require('../services/integrationEvents');
const { LogtoManagementAdapter } = require('./logtoManagementAdapter');

const SCIM_CONSUMER_ID = 'scim.logto-management-adapter';
const SCIM_MODULE_ID = 'identity-federation';
const SCIM_CAPABILITY_ID = 'identity.scim';
const SCIM_EVENT_TYPE = 'identity.scim.operation.requested';

function stableHash(parts) {
  return createHash('sha256').update(parts.map((part) => String(part ?? '')).join('|')).digest('hex');
}
function uuidFromHash(value) {
  const h = stableHash([value]);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16)}${h.slice(18, 20)}-${h.slice(20, 32)}`;
}
function stableOperationKey({ organizationId, operationKind, externalIssuer, externalSubject, userId }) {
  return `scim:${stableHash([organizationId, operationKind, externalIssuer, externalSubject, userId]).slice(0, 48)}`;
}
function normalizeActor(actor = {}) { return { type: actor.type || 'scim_client', logtoUserId: actor.logtoUserId || actor.sub || null, source: actor.source || 'scim' }; }
function publicResult(operation, extras = {}) { return { operationId: operation.id || operation.operationId, idempotencyKey: operation.idempotencyKey, state: operation.operation_state || operation.operationState || operation.status, ...extras }; }

async function enqueueScimOperation({ repository, organizationId, operationKind, payload = {}, actor = {}, correlationId, idempotencyKey }) {
  if (!repository) throw new Error('repository is required');
  if (!organizationId) throw new Error('organizationId is required');
  if (!operationKind) throw new Error('operationKind is required');
  const key = idempotencyKey || stableOperationKey({ organizationId, operationKind, externalIssuer: payload.externalIssuer, externalSubject: payload.externalSubject, userId: payload.userId });
  if (repository.findOperationByIdempotencyKey) {
    const existing = await repository.findOperationByIdempotencyKey({ organizationId, idempotencyKey: key });
    if (existing) return publicResult(existing, { idempotent: true });
  }
  const operation = await repository.createOperation({ organizationId, operationType: `identity.scim.${operationKind}`, moduleId: SCIM_MODULE_ID, capabilityId: SCIM_CAPABILITY_ID, requestedBy: normalizeActor(actor), correlationId: correlationId || key, input: { ...payload, operationKind, idempotencyKey: key }, idempotencyKey: key });
  const event = createIntegrationEvent({ eventId: uuidFromHash(key), eventType: SCIM_EVENT_TYPE, schemaVersion: ENVELOPE_VERSION, organizationId, aggregate: { type: 'scim_operation', id: key, version: '1' }, actor: normalizeActor(actor), correlation: { correlationId: correlationId || key }, causation: { operationId: operation.id }, source: { moduleId: SCIM_MODULE_ID, capabilityId: SCIM_CAPABILITY_ID, component: 'scim-operation-ledger' }, sensitivity: 'confidential', payload: { operationKind, idempotencyKey: key, ...payload } });
  await repository.appendEvent(event);
  if (repository.markOperationQueued) await repository.markOperationQueued({ organizationId, operationId: operation.id });
  return publicResult(operation, { state: OPERATION_STATES.QUEUED, idempotent: false, eventId: event.eventId });
}

async function applyScimOperationEvent({ repository, adapter = new LogtoManagementAdapter(), event, leaseOwner = SCIM_CONSUMER_ID }) {
  if (!repository) throw new Error('repository is required');
  const receipt = await repository.claimInbox({ consumerId: SCIM_CONSUMER_ID, event, leaseOwner });
  const p = event.payload || {};
  try {
    let result;
    if (p.operationKind === 'ensure_user') result = await adapter.ensureUser(p);
    else if (p.operationKind === 'ensure_membership') result = await adapter.ensureOrganizationMembership({ organizationId: event.organizationId, userId: p.userId });
    else if (p.operationKind === 'remove_membership') result = await adapter.removeOrganizationMembership({ organizationId: event.organizationId, userId: p.userId });
    else if (p.operationKind === 'replace_roles') result = await adapter.replaceManagedOrganizationRoles({ organizationId: event.organizationId, userId: p.userId, roleIds: p.roleIds || [], roleNames: p.roleNames || [] });
    else if (p.operationKind === 'suspend_access') result = await adapter.suspendOrganizationAccess({ organizationId: event.organizationId, userId: p.userId });
    else if (p.operationKind === 'link_external_identity') result = await adapter.linkExternalIdentity({ organizationId: event.organizationId, userId: p.userId, externalIssuer: p.externalIssuer, externalSubject: p.externalSubject, customData: p.customData || {} });
    else throw new Error(`Unsupported SCIM operation: ${p.operationKind}`);
    await repository.markInboxProcessed({ consumerId: SCIM_CONSUMER_ID, eventId: event.eventId, leaseOwner: receipt.lease_owner || receipt.leaseOwner, result: { reference: p.idempotencyKey, result } });
    if (repository.transitionOperation && event.causation?.operationId) {
      const op = await repository.getOperation({ organizationId: event.organizationId, operationId: event.causation.operationId });
      if (op?.version) await repository.transitionOperation({ organizationId: event.organizationId, operationId: op.id, expectedVersion: op.version, toState: OPERATION_STATES.SUCCEEDED, principal: { consumerId: SCIM_CONSUMER_ID }, result });
    }
    return { state: 'processed', result };
  } catch (error) {
    if (repository.moveInboxToDeadLetter) await repository.moveInboxToDeadLetter({ consumerId: SCIM_CONSUMER_ID, eventId: event.eventId, leaseOwner: receipt.lease_owner || receipt.leaseOwner, error, reasonCode: 'scim_logto_management_operation_failed' });
    throw error;
  }
}

module.exports = { SCIM_CONSUMER_ID, SCIM_EVENT_TYPE, stableOperationKey, enqueueScimOperation, applyScimOperationEvent };
