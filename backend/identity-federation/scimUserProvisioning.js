"use strict";

const SCIM_ERROR_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:Error";
const SCIM_OPERATION_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:SearchResponse";

function buildScimCapacityError({ status = 409, detail, reasonCode, operationId }) {
  return {
    status,
    headers: { "content-type": "application/scim+json" },
    body: {
      schemas: [SCIM_ERROR_SCHEMA],
      status: String(status),
      detail: detail || "SCIM user activation is blocked because no organization seat capacity is available.",
      civitas: { reasonCode, operationId: operationId || null },
    },
  };
}

function buildScimPendingOperationResponse({ operationId, reasonCode, retryAfterSeconds = 30 }) {
  return {
    status: 202,
    headers: { "content-type": "application/scim+json", "retry-after": String(retryAfterSeconds) },
    body: {
      schemas: [SCIM_OPERATION_SCHEMA],
      totalResults: 0,
      Resources: [],
      civitas: {
        status: "pending",
        operationId,
        reasonCode,
        detail: "SCIM user activation is pending while Civitas verifies organization seat capacity.",
      },
    },
  };
}

async function provisionScimUserAccess({ organizationId, userId, scimUser, operation = "create", seatWorkflowRuntime, logtoClient, reconciliation = {}, idempotencyKey, now = new Date().toISOString() } = {}) {
  if (!organizationId || !userId) throw new Error("organizationId and userId are required");
  if (!seatWorkflowRuntime?.verifyActivationCapacity) throw new Error("seatWorkflowRuntime.verifyActivationCapacity is required");
  if (!logtoClient?.addUserToLogtoOrganization) throw new Error("logtoClient.addUserToLogtoOrganization is required");

  const capacity = await seatWorkflowRuntime.verifyActivationCapacity({ organizationId, userId, operationType: `scim_user_${operation}`, idempotencyKey, now });
  if (!capacity.allowed) {
    const result = {
      status: capacity.status,
      action: operation,
      organizationId,
      userId,
      scimUserId: scimUser?.id || null,
      reasonCode: capacity.reasonCode,
      capacity: capacity.reconciliationResult,
      recordedAt: now,
    };
    reconciliation.results = [...(reconciliation.results || []), result];
    return { ok: false, reconciliationResult: result, response: capacity.response };
  }

  if (logtoClient.ensureUserActive) await logtoClient.ensureUserActive({ organizationId, userId, scimUser, operation });
  await logtoClient.addUserToLogtoOrganization({ organizationId, userId });
  const result = { status: "reconciled", action: operation, organizationId, userId, scimUserId: scimUser?.id || null, capacity: capacity.reconciliationResult, recordedAt: now };
  reconciliation.results = [...(reconciliation.results || []), result];
  return { ok: true, reconciliationResult: result, response: { status: operation === "create" ? 201 : 200, body: scimUser || { id: userId, active: true } } };
}

module.exports = { SCIM_ERROR_SCHEMA, buildScimCapacityError, buildScimPendingOperationResponse, provisionScimUserAccess };
