"use strict";
const SEAT_CHANGE_REASON_CODES = Object.freeze({ STATE_INVALID: "seat_change_state_invalid", VERSION_STALE: "seat_change_version_stale", IDEMPOTENCY_CONFLICT: "seat_change_idempotency_conflict", APPROVAL_MISSING: "seat_change_approval_missing", AUTHORIZATION_CHANGED: "seat_change_authorization_changed", CONNECTOR_UNAVAILABLE: "seat_change_connector_unavailable", PROVIDER_TRANSIENT_FAILURE: "seat_change_provider_transient_failure", PROVIDER_PERMANENT_FAILURE: "seat_change_provider_permanent_failure", ALREADY_APPLIED: "seat_change_already_applied", CAPACITY_UNAVAILABLE: "seat_capacity_unavailable", CAPACITY_PENDING: "seat_capacity_pending", CAPACITY_PROVIDER_UNAVAILABLE: "seat_capacity_provider_unavailable" });
const TERMINAL_STATES = new Set(["applied", "rejected", "cancelled"]);
const ALLOWED_TRANSITIONS = Object.freeze({ submitted: ["approved", "rejected", "cancelled"], approved: ["scheduled", "cancelled"], scheduled: ["applying", "cancelled"], applying: ["applied", "failed"], failed: ["scheduled"], applied: [], rejected: [], cancelled: [] });
function providerOperationRef(request) { return `seat-change:${request.id}:${request.version}`; }
function assertTransition(request, toStatus, expectedVersion) {
  if (String(request.version) !== String(expectedVersion)) throw Object.assign(new Error(SEAT_CHANGE_REASON_CODES.VERSION_STALE), { code: SEAT_CHANGE_REASON_CODES.VERSION_STALE });
  if (!ALLOWED_TRANSITIONS[request.status]?.includes(toStatus)) { const code = request.status === "applied" ? SEAT_CHANGE_REASON_CODES.ALREADY_APPLIED : SEAT_CHANGE_REASON_CODES.STATE_INVALID; throw Object.assign(new Error(code), { code }); }
}
function createInMemorySeatChangeRepository() { const requests = new Map(); const idempotency = new Map(); return { requests, idempotency, async get(id) { return requests.get(id) && { ...requests.get(id) }; }, async save(row) { requests.set(row.id, { ...row }); return { ...row }; }, async byIdempotency(key) { return idempotency.get(key) || null; }, async remember(key, value) { idempotency.set(key, value); return value; } }; }
function createSeatChangeWorkflowRuntime({ repository, outboxService, revalidator, seatProvider, pendingOperationFactory } = {}) {
  async function submit(input = {}) {
    const existing = input.idempotencyKey && await repository.byIdempotency(input.idempotencyKey); if (existing) return { request: await repository.get(existing.requestId), idempotent: true };
    const request = await repository.save({ id: input.requestId, organizationId: input.organizationId, status: "submitted", version: 1, desiredSeats: input.desiredSeats, transitions: [{ status: "submitted", at: input.now || new Date().toISOString() }] });
    if (input.idempotencyKey) await repository.remember(input.idempotencyKey, { requestId: request.id });
    return { request };
  }
  async function transition(input = {}) {
    const request = await repository.get(input.requestId); if (!request) throw Object.assign(new Error(SEAT_CHANGE_REASON_CODES.STATE_INVALID), { code: SEAT_CHANGE_REASON_CODES.STATE_INVALID });
    assertTransition(request, input.toStatus, input.expectedVersion);
    const next = { ...request, status: input.toStatus, version: Number(request.version) + 1, transitions: [...(request.transitions || []), { status: input.toStatus, actorUserId: input.actorUserId, at: input.now || new Date().toISOString() }] };
    if (input.toStatus === "approved") next.approvalSnapshot = { decisionId: input.decisionId, policyVersion: String(input.policyVersion), permission: "owner.seat_change_requests.approve", actorUserId: input.actorUserId, requestId: request.id, organizationId: request.organizationId, requestVersion: request.version, approvedAt: input.now || new Date().toISOString() };
    await repository.save(next);
    if (outboxService && input.eventType) await outboxService.mutateWithVersionAndOutbox({ organizationId: request.organizationId, reason: `seat_change_${input.toStatus}`, event: { eventType: input.eventType, aggregateId: request.id, payload: { requestId: request.id, status: input.toStatus } }, mutation: async () => next });
    return { request: next };
  }
  async function apply(input = {}) {
    const request = await repository.get(input.requestId);
    if (!request || !request.approvalSnapshot) return { applied: false, reasonCode: SEAT_CHANGE_REASON_CODES.APPROVAL_MISSING };
    if (TERMINAL_STATES.has(request.status)) return { applied: request.status === "applied", reasonCode: request.status === "applied" ? SEAT_CHANGE_REASON_CODES.ALREADY_APPLIED : SEAT_CHANGE_REASON_CODES.STATE_INVALID };
    const reauth = revalidator ? await revalidator.reauthorize({ operationId: input.operationId, organizationId: request.organizationId, subjectUserId: request.approvalSnapshot.actorUserId, permission: request.approvalSnapshot.permission, originalDecisionId: request.approvalSnapshot.decisionId, originalPolicyVersion: request.approvalSnapshot.policyVersion, target: { type: "billing_seat_change", id: request.id, organizationId: request.organizationId } }) : { allowed: false, reasonCode: SEAT_CHANGE_REASON_CODES.AUTHORIZATION_CHANGED };
    if (!reauth.allowed) return { applied: false, reasonCode: SEAT_CHANGE_REASON_CODES.AUTHORIZATION_CHANGED };
    return { applied: false, reasonCode: SEAT_CHANGE_REASON_CODES.CONNECTOR_UNAVAILABLE, providerOperationRef: providerOperationRef(request) };
  }
  async function verifyActivationCapacity(input = {}) {
    const operationType = input.operationType || "organization_user_activate";
    if (!seatProvider?.evaluateAvailability) {
      const reasonCode = SEAT_CHANGE_REASON_CODES.CAPACITY_PROVIDER_UNAVAILABLE;
      const operationId = pendingOperationFactory ? await pendingOperationFactory({ ...input, operationType, reasonCode }) : input.operationId || null;
      return { allowed: false, status: "pending", reasonCode, reconciliationResult: { status: "pending", reasonCode, operationId, requestedSeatDelta: 1, operationType }, response: require("../../../identity-federation/scimUserProvisioning").buildScimPendingOperationResponse({ operationId, reasonCode }) };
    }
    const availability = await seatProvider.evaluateAvailability({ organizationId: input.organizationId, userId: input.userId, requestedDelta: 1, operation: operationType, idempotencyKey: input.idempotencyKey });
    if (availability.status === "available") return { allowed: true, status: "available", reconciliationResult: { status: "available", requestedSeatDelta: 1, operationType, availableSeats: availability.availableSeats ?? null } };
    if (availability.status === "unavailable") {
      const reasonCode = SEAT_CHANGE_REASON_CODES.CAPACITY_UNAVAILABLE;
      return { allowed: false, status: "blocked", reasonCode, reconciliationResult: { status: "blocked", reasonCode, requestedSeatDelta: 1, operationType, availableSeats: availability.availableSeats ?? 0, capacityLimit: availability.capacityLimit ?? null }, response: require("../../../identity-federation/scimUserProvisioning").buildScimCapacityError({ reasonCode }) };
    }
    const reasonCode = SEAT_CHANGE_REASON_CODES.CAPACITY_PENDING;
    const operationId = pendingOperationFactory ? await pendingOperationFactory({ ...input, operationType, reasonCode }) : input.operationId || null;
    return { allowed: false, status: "pending", reasonCode, reconciliationResult: { status: "pending", reasonCode, operationId, requestedSeatDelta: 1, operationType }, response: require("../../../identity-federation/scimUserProvisioning").buildScimPendingOperationResponse({ operationId, reasonCode }) };
  }
  return { submit, transition, apply, verifyActivationCapacity };
}
module.exports = { createSeatChangeWorkflowRuntime, createInMemorySeatChangeRepository, providerOperationRef, SEAT_CHANGE_REASON_CODES };
