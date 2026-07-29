"use strict";

const { DATA_SCOPE_REASON_CODES, dataScopeError } = require("./dataScopeReasonCodes");
const { validateDimensionAssignment } = require("./taxonomyScopeAdapter");
const { validateRelationshipKey } = require("./relationshipScopeAdapter");
const { assertAssignmentMatchesTemplate } = require("./scopeTemplateRegistry");
const { AUTHORIZATION_EVENT_TYPES } = require("../runtime/authorizationEvents");

function isEffectiveAssignment(assignment, now = new Date()) {
  return assignment.status === "active" && new Date(assignment.validFrom) <= now && (!assignment.validUntil || new Date(assignment.validUntil) > now);
}

function validateTarget(input) {
  const targetCount = [input.dimensionValueId, input.unitId, input.resourceRef].filter(Boolean).length;
  if (targetCount !== 1) throw dataScopeError("data_scope_exactly_one_target_required");
  if (input.scopeKind === "dimension" && (!input.dimensionKey || !input.dimensionValueId || input.relationshipKey)) throw dataScopeError(DATA_SCOPE_REASON_CODES.DIMENSION_UNKNOWN);
  if (input.scopeKind === "unit" && (!input.relationshipKey || !input.unitId || input.dimensionKey)) throw dataScopeError(DATA_SCOPE_REASON_CODES.UNIT_UNKNOWN);
  if (input.scopeKind === "resource" && (!input.relationshipKey || !input.resourceRef || input.dimensionKey)) throw dataScopeError(DATA_SCOPE_REASON_CODES.RESOURCE_UNKNOWN);
}

async function validateScopeTemplate({ input, templateRegistry }) {
  if (!input.scopeTemplateId && !templateRegistry) return null;
  const template = templateRegistry?.getTemplate({ scopeTemplateId: input.scopeTemplateId, scopeTemplateVersion: input.scopeTemplateVersion });
  assertAssignmentMatchesTemplate({ assignment: input, template, organizationId: input.organizationId, templateRegistry });
  return template;
}

function createDataScopeAssignmentService({ repository, taxonomyPort, runtimeConsistencyPort, authorizationFreshnessService, templateRegistry, membershipPort, unitPort, resourcePort } = {}) {
  async function emit(event, transactionalRepository = repository) {
    if (authorizationFreshnessService?.invalidate) {
      const eventType = event.eventType.endsWith(".created") ? AUTHORIZATION_EVENT_TYPES.DATA_SCOPE_ASSIGNMENT_CREATED : AUTHORIZATION_EVENT_TYPES.DATA_SCOPE_ASSIGNMENT_DELETED;
      const snapshot = await authorizationFreshnessService.invalidate({ ...event, eventType, actorUserId: event.actorLogtoUserId, aggregateId: event.assignmentId, reason: event.eventType });
      if (runtimeConsistencyPort?.audit) await runtimeConsistencyPort.audit({ ...event, policyVersion: snapshot.policyVersion });
      return snapshot.policyVersion;
    }
    const policyVersion = runtimeConsistencyPort?.incrementPolicyVersion ? await runtimeConsistencyPort.incrementPolicyVersion(event) : await transactionalRepository.incrementPolicyVersion(event.organizationId, { actorUserId: event.actorLogtoUserId, reason: event.eventType });
    const out = { ...event, policyVersion };
    if (runtimeConsistencyPort?.enqueueOutbox) await runtimeConsistencyPort.enqueueOutbox(out); else await transactionalRepository.recordOutbox(out);
    if (runtimeConsistencyPort?.audit) await runtimeConsistencyPort.audit(out); else await transactionalRepository.audit({ action: event.eventType, ...out });
    return policyVersion;
  }

  async function validateMembershipBinding(input) {
    if (!input.organizationId || !input.membershipId || !input.userId || !input.canonicalRoleId) throw dataScopeError(DATA_SCOPE_REASON_CODES.MEMBERSHIP_NOT_FOUND);
    if (!membershipPort?.getMembershipRoleBinding) throw dataScopeError(DATA_SCOPE_REASON_CODES.RESOLVER_UNAVAILABLE);
    const binding = await membershipPort.getMembershipRoleBinding?.({ organizationId: input.organizationId, membershipId: input.membershipId, canonicalRoleId: input.canonicalRoleId || input.logtoRoleId, userId: input.userId });
    if (!binding) throw dataScopeError(DATA_SCOPE_REASON_CODES.MEMBERSHIP_NOT_FOUND);
    if (binding.organizationId && binding.organizationId !== input.organizationId) throw dataScopeError(DATA_SCOPE_REASON_CODES.MEMBERSHIP_NOT_FOUND);
    if (binding.userId && binding.userId !== input.userId) throw dataScopeError(DATA_SCOPE_REASON_CODES.ROLE_MISMATCH);
    if (binding.membershipId && binding.membershipId !== input.membershipId) throw dataScopeError(DATA_SCOPE_REASON_CODES.MEMBERSHIP_NOT_FOUND);
    if (binding.canonicalRoleId && binding.canonicalRoleId !== (input.canonicalRoleId || input.logtoRoleId)) throw dataScopeError(DATA_SCOPE_REASON_CODES.ROLE_MISMATCH);
    if (binding.status && binding.status !== "active") throw dataScopeError(DATA_SCOPE_REASON_CODES.ROLE_INACTIVE);
  }

  async function validateAssignmentInput(input) {
    validateTarget(input);
    await validateMembershipBinding(input);
    if (input.scopeKind === "dimension") await validateDimensionAssignment({ taxonomyPort, organizationId: input.organizationId, dimensionKey: input.dimensionKey, dimensionValueId: input.dimensionValueId, capability: input.capability });
    if (input.scopeKind !== "dimension") validateRelationshipKey(input.relationshipKey);
    const template = await validateScopeTemplate({ input, templateRegistry });
    if (input.scopeKind === "unit" && !unitPort?.getUnit) throw dataScopeError(DATA_SCOPE_REASON_CODES.RESOLVER_UNAVAILABLE);
    if (input.scopeKind === "resource" && !resourcePort?.getResource) throw dataScopeError(DATA_SCOPE_REASON_CODES.RESOLVER_UNAVAILABLE);
    if (input.scopeKind === "unit") { const unit = await unitPort.getUnit({ organizationId: input.organizationId, unitId: input.unitId }); if (!unit) throw dataScopeError(DATA_SCOPE_REASON_CODES.UNIT_UNKNOWN); if (unit.organizationId !== input.organizationId) throw dataScopeError(DATA_SCOPE_REASON_CODES.UNIT_WRONG_TENANT); if (unit.status && unit.status !== "active") throw dataScopeError(DATA_SCOPE_REASON_CODES.UNIT_INACTIVE); }
    if (input.scopeKind === "resource") { const resource = await resourcePort.getResource({ organizationId: input.organizationId, resourceRef: input.resourceRef }); if (!resource) throw dataScopeError(DATA_SCOPE_REASON_CODES.RESOURCE_UNKNOWN); if (resource.organizationId !== input.organizationId) throw dataScopeError(DATA_SCOPE_REASON_CODES.RESOURCE_WRONG_TENANT); if (resource.status && !["active","published"].includes(resource.status)) throw dataScopeError(DATA_SCOPE_REASON_CODES.RESOURCE_FORBIDDEN); }
    return template;
  }

  return {
    isEffectiveAssignment,
    async previewAssignment(input) {
      const template = await validateAssignmentInput(input);
      return { valid: true, wouldGrant: { capability: input.capability, scopeKind: input.scopeKind, scopeTemplateId: template?.id || input.scopeTemplateId, scopeTemplateVersion: template?.version || input.scopeTemplateVersion, dimensionKey: input.dimensionKey, relationshipKey: input.relationshipKey, dimensionValueId: input.dimensionValueId, unitId: input.unitId, resourceRef: input.resourceRef }, warnings: [], mutated: false, policyVersion: await repository.getPolicyVersion(input.organizationId) };
    },
    async createAssignment(input) {
      if (!templateRegistry || !input.scopeTemplateId || !input.scopeTemplateVersion || !input.strategyId) throw dataScopeError(DATA_SCOPE_REASON_CODES.TEMPLATE_UNKNOWN);
      const template = await validateAssignmentInput(input);
      if (input.expectedPolicyVersion != null && Number(input.expectedPolicyVersion) !== Number(await repository.getPolicyVersion(input.organizationId))) throw dataScopeError(DATA_SCOPE_REASON_CODES.POLICY_VERSION_CONFLICT);
      const now = input.validFrom || new Date().toISOString();
      return repository.transaction(async (tx) => {
        if (input.expectedPolicyVersion != null && Number(input.expectedPolicyVersion) !== Number(await tx.getPolicyVersion(input.organizationId))) throw dataScopeError(DATA_SCOPE_REASON_CODES.POLICY_VERSION_CONFLICT);
        const saved = await tx.insertAssignment({ logtoOrganizationId: input.organizationId, logtoUserId: input.userId, membershipId: input.membershipId, logtoRoleId: input.logtoRoleId, canonicalRoleId: input.canonicalRoleId, scopeTemplateId: template?.id || input.scopeTemplateId, scopeTemplateVersion: template?.version || input.scopeTemplateVersion, strategyId: template?.strategyId || input.strategyId, capability: input.capability, scopeKind: input.scopeKind, dimensionKey: input.dimensionKey, relationshipKey: input.relationshipKey, dimensionValueId: input.dimensionValueId, unitId: input.unitId, resourceRef: input.resourceRef, target: { kind: input.scopeKind, dimensionKey: input.dimensionKey, relationshipKey: input.relationshipKey, valueId: input.dimensionValueId, unitId: input.unitId, resourceRef: input.resourceRef }, sourceType: input.sourceType || input.source || "explicit", sourceRef: input.sourceRef, sourceVersion: input.sourceVersion || "manual-v1", provenance: { sourceType: input.sourceType || input.source || "explicit", sourceRef: input.sourceRef, sourceVersion: input.sourceVersion || "manual-v1" }, status: new Date(now) <= new Date() ? "active" : "scheduled", snapshotVersion: input.snapshotVersion || await tx.getPolicyVersion(input.organizationId), assignedByLogtoUserId: input.actorLogtoUserId || input.actorId, reason: input.reason || "scope assignment", validFrom: now, validUntil: input.validUntil });
        const policyVersion = await emit({ eventType: "authz.data_scope_assignment.created", organizationId: input.organizationId, assignmentId: saved.id, actorLogtoUserId: input.actorLogtoUserId }, tx);
        return { assignment: saved, policyVersion, etag: `\"${policyVersion}\"` };
      });
    },
    async listAssignments(input = {}) {
      if (!input.organizationId || !input.membershipId || !input.canonicalRoleId) throw dataScopeError(DATA_SCOPE_REASON_CODES.MEMBERSHIP_NOT_FOUND);
      await validateMembershipBinding(input);
      const assignments = await repository.listAssignments(input);
      const policyVersion = await repository.getPolicyVersion(input.organizationId);
      return { assignments: Array.from(assignments), nextCursor: assignments.nextCursor || null, policyVersion, etag: `\"${policyVersion}\"` };
    },
    async revokeAssignment({ organizationId, assignmentId, actorLogtoUserId, reason, expectedPolicyVersion } = {}) {
      return repository.transaction(async (tx) => {
        if (expectedPolicyVersion != null && Number(expectedPolicyVersion) !== Number(await tx.getPolicyVersion(organizationId))) throw dataScopeError(DATA_SCOPE_REASON_CODES.POLICY_VERSION_CONFLICT);
        const assignment = await tx.getAssignment(assignmentId, organizationId);
        if (!assignment) throw dataScopeError(DATA_SCOPE_REASON_CODES.ASSIGNMENT_MISSING);
        const saved = await tx.updateAssignment(assignmentId, { status: "revoked", revokedAt: new Date().toISOString(), revokedByLogtoUserId: actorLogtoUserId, reason: reason || assignment.reason }, { organizationId, fromStatuses: ["scheduled", "active"] });
        if (!saved) throw dataScopeError(DATA_SCOPE_REASON_CODES.REVOKED);
        const policyVersion = await emit({ eventType: "authz.data_scope_assignment.revoked", organizationId, assignmentId, actorLogtoUserId }, tx);
        return { assignment: saved, policyVersion, etag: `\"${policyVersion}\"` };
      });
    },
  };
}

module.exports = { createDataScopeAssignmentService, isEffectiveAssignment, validateTarget };
