"use strict";

const { DATA_SCOPE_REASON_CODES, dataScopeError } = require("./dataScopeReasonCodes");
const { validateDimensionAssignment } = require("./taxonomyScopeAdapter");
const { validateRelationshipKey } = require("./relationshipScopeAdapter");
const { assertAssignmentMatchesTemplate } = require("./scopeTemplateRegistry");

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

function createDataScopeAssignmentService({ repository, taxonomyPort, runtimeConsistencyPort, templateRegistry, membershipPort, unitPort, resourcePort } = {}) {
  async function emit(event) {
    const policyVersion = runtimeConsistencyPort?.incrementPolicyVersion ? await runtimeConsistencyPort.incrementPolicyVersion(event) : await repository.incrementPolicyVersion();
    const out = { ...event, policyVersion };
    if (runtimeConsistencyPort?.enqueueOutbox) await runtimeConsistencyPort.enqueueOutbox(out); else await repository.recordOutbox(out);
    if (runtimeConsistencyPort?.audit) await runtimeConsistencyPort.audit(out); else await repository.audit({ action: event.eventType, ...out });
    return policyVersion;
  }

  async function validateMembershipBinding(input) {
    if (!input.membershipId || !input.userId || !input.canonicalRoleId) throw dataScopeError(DATA_SCOPE_REASON_CODES.MEMBERSHIP_NOT_FOUND);
    if (!membershipPort?.getMembershipRoleBinding) throw dataScopeError(DATA_SCOPE_REASON_CODES.RESOLVER_UNAVAILABLE);
    const binding = await membershipPort.getMembershipRoleBinding?.({ organizationId: input.organizationId, membershipId: input.membershipId, canonicalRoleId: input.canonicalRoleId || input.logtoRoleId, userId: input.userId });
    if (!binding) throw dataScopeError(DATA_SCOPE_REASON_CODES.MEMBERSHIP_NOT_FOUND);
    if (binding.organizationId && binding.organizationId !== input.organizationId) throw dataScopeError(DATA_SCOPE_REASON_CODES.MEMBERSHIP_NOT_FOUND);
    if (binding.userId && binding.userId !== input.userId) throw dataScopeError(DATA_SCOPE_REASON_CODES.ROLE_MISMATCH);
    if (binding.membershipId && binding.membershipId !== input.membershipId) throw dataScopeError(DATA_SCOPE_REASON_CODES.MEMBERSHIP_NOT_FOUND);
    if (binding.canonicalRoleId && binding.canonicalRoleId !== (input.canonicalRoleId || input.logtoRoleId)) throw dataScopeError(DATA_SCOPE_REASON_CODES.ROLE_MISMATCH);
  }

  async function validateAssignmentInput(input) {
    validateTarget(input);
    await validateMembershipBinding(input);
    if (input.scopeKind === "dimension") await validateDimensionAssignment({ taxonomyPort, organizationId: input.organizationId, dimensionKey: input.dimensionKey, dimensionValueId: input.dimensionValueId, capability: input.capability });
    if (input.scopeKind !== "dimension") validateRelationshipKey(input.relationshipKey);
    const template = await validateScopeTemplate({ input, templateRegistry });
    if (input.scopeKind === "unit" && unitPort?.getUnit) { const unit = await unitPort.getUnit({ organizationId: input.organizationId, unitId: input.unitId }); if (!unit) throw dataScopeError(DATA_SCOPE_REASON_CODES.UNIT_UNKNOWN); if (unit.organizationId !== input.organizationId) throw dataScopeError(DATA_SCOPE_REASON_CODES.UNIT_WRONG_TENANT); if (unit.status && unit.status !== "active") throw dataScopeError(DATA_SCOPE_REASON_CODES.UNIT_INACTIVE); }
    if (input.scopeKind === "resource" && resourcePort?.getResource) { const resource = await resourcePort.getResource({ organizationId: input.organizationId, resourceRef: input.resourceRef }); if (!resource) throw dataScopeError(DATA_SCOPE_REASON_CODES.RESOURCE_UNKNOWN); if (resource.organizationId !== input.organizationId) throw dataScopeError(DATA_SCOPE_REASON_CODES.RESOURCE_WRONG_TENANT); if (resource.status && !["active","published"].includes(resource.status)) throw dataScopeError(DATA_SCOPE_REASON_CODES.RESOURCE_FORBIDDEN); }
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
      if (input.expectedPolicyVersion && Number(input.expectedPolicyVersion) !== Number(await repository.getPolicyVersion(input.organizationId))) throw dataScopeError(DATA_SCOPE_REASON_CODES.POLICY_VERSION_CONFLICT);
      const now = input.validFrom || new Date().toISOString();
      const saved = await repository.insertAssignment({ logtoOrganizationId: input.organizationId, logtoUserId: input.userId, membershipId: input.membershipId, logtoRoleId: input.logtoRoleId, canonicalRoleId: input.canonicalRoleId || input.logtoRoleId, scopeTemplateId: template?.id || input.scopeTemplateId, scopeTemplateVersion: template?.version || input.scopeTemplateVersion, strategyId: template?.strategyId || input.strategyId, capability: input.capability, scopeKind: input.scopeKind, dimensionKey: input.dimensionKey, relationshipKey: input.relationshipKey, dimensionValueId: input.dimensionValueId, unitId: input.unitId, resourceRef: input.resourceRef, target: { kind: input.scopeKind, dimensionKey: input.dimensionKey, relationshipKey: input.relationshipKey, valueId: input.dimensionValueId, unitId: input.unitId, resourceRef: input.resourceRef }, sourceType: input.sourceType || input.source || "explicit", sourceRef: input.sourceRef, sourceVersion: input.sourceVersion || "manual-v1", provenance: { sourceType: input.sourceType || input.source || "explicit", sourceRef: input.sourceRef, sourceVersion: input.sourceVersion || "manual-v1" }, status: new Date(now) <= new Date() ? "active" : "scheduled", state: new Date(now) <= new Date() ? "active" : "scheduled", snapshotVersion: input.snapshotVersion || await repository.getPolicyVersion(input.organizationId), assignedByLogtoUserId: input.actorLogtoUserId || input.actorId, actorId: input.actorId || input.actorLogtoUserId, reason: input.reason || "scope assignment", validFrom: now, validUntil: input.validUntil });
      const policyVersion = await emit({ eventType: "authz.data_scope_assignment.created", organizationId: input.organizationId, assignmentId: saved.id, actorLogtoUserId: input.actorLogtoUserId });
      return { assignment: saved, policyVersion };
    },
    async revokeAssignment({ organizationId, assignmentId, actorLogtoUserId, reason } = {}) {
      const assignment = await repository.getAssignment(assignmentId);
      if (!assignment || assignment.logtoOrganizationId !== organizationId) throw dataScopeError(DATA_SCOPE_REASON_CODES.ASSIGNMENT_MISSING);
      const saved = await repository.updateAssignment(assignmentId, { status: "revoked", revokedAt: new Date().toISOString(), revokedByLogtoUserId: actorLogtoUserId, reason: reason || assignment.reason });
      const policyVersion = await emit({ eventType: "authz.data_scope_assignment.revoked", organizationId, assignmentId, actorLogtoUserId });
      return { assignment: saved, policyVersion };
    },
  };
}

module.exports = { createDataScopeAssignmentService, isEffectiveAssignment, validateTarget };
