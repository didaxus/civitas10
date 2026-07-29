"use strict";
const { ENTITLEMENT_REASON_CODES } = require("./entitlementReasonCodes");
const { assertLogtoId, validateEntitlementChange } = require("./entitlementValidation");
const { AUTHORIZATION_EVENT_TYPES } = require("../runtime/authorizationEvents");

function entitlementError(code, message = code) { return Object.assign(new Error(message), { code }); }
function requireRuntimePort(runtimeConsistencyPort) {
  if (!runtimeConsistencyPort?.incrementPolicyVersion || !runtimeConsistencyPort?.enqueueOutbox || !runtimeConsistencyPort?.audit) throw entitlementError("runtime_consistency_port_required");
}
function createEntitlementService({ repository, runtimeConsistencyPort, authorizationFreshnessService, roleIdToName = {} } = {}) {
  if (!repository) throw new Error("repository_required");
  async function mutateVersion(event) {
    if (authorizationFreshnessService?.invalidate) {
      const eventType = event.eventType === "authorization.entitlement_limit.changed" ? AUTHORIZATION_EVENT_TYPES.CEILING_CHANGED : event.eventType === "authorization.role_activation.changed" ? AUTHORIZATION_EVENT_TYPES.ACTIVATION_CHANGED : event.eventType;
      const snapshot = await authorizationFreshnessService.invalidate({ ...event, eventType, actorUserId: event.actorLogtoUserId });
      if (runtimeConsistencyPort?.audit) await runtimeConsistencyPort.audit({ ...event, policyVersion: snapshot.policyVersion });
      return snapshot.policyVersion;
    }
    requireRuntimePort(runtimeConsistencyPort);
    const policyVersion = await runtimeConsistencyPort.incrementPolicyVersion(event);
    if (repository.setPolicyVersion) await repository.setPolicyVersion(event.organizationId, policyVersion);
    await runtimeConsistencyPort.enqueueOutbox({ ...event, policyVersion });
    return policyVersion;
  }
  return {
    async upsertOwnerLimits({ organizationId, expectedPolicyVersion, changes = [], actorLogtoUserId, reason, decisionId } = {}) {
      assertLogtoId(organizationId, "logto_organization_id");
      assertLogtoId(actorLogtoUserId, "updated_by_logto_user_id");
      const current = await repository.getPolicyVersion(organizationId);
      if (expectedPolicyVersion && Number(expectedPolicyVersion) !== Number(current)) throw entitlementError(ENTITLEMENT_REASON_CODES.AUTHORIZATION_POLICY_VERSION_CONFLICT);
      const normalized = changes.map((change) => validateEntitlementChange(change, { roleIdToName }));
      return repository.transaction(async () => {
        const policyVersion = await mutateVersion({ eventType: "authorization.entitlement_limit.changed", organizationId, actorLogtoUserId });
        const saved = [];
        for (const change of normalized) {
          const before = await repository.getLimit({ organizationId, logtoRoleId: change.logtoRoleId, permission: change.permission });
          const limit = await repository.upsertLimit({ logtoOrganizationId: organizationId, logtoRoleId: change.logtoRoleId, roleNameCache: roleIdToName[change.logtoRoleId], permissionKey: change.permission, allowed: Boolean(change.allowed), locked: Boolean(change.locked), policyVersion, setByLogtoUserId: actorLogtoUserId, reason: change.reason || reason || null });
          if (before?.allowed === true && limit.allowed === false) await repository.disableActivation({ organizationId, logtoRoleId: change.logtoRoleId, permission: change.permission, policyVersion });
          await runtimeConsistencyPort.audit({ action: before ? "authz.entitlement_limit.updated" : "authz.entitlement_limit.created", decisionId, organizationId, roleId: change.logtoRoleId, permission: change.permission, before, after: limit, reason: change.reason || reason || null, policyVersion });
          saved.push(limit);
        }
        return { policyVersion, limits: saved };
      });
    },
    async upsertTenantActivations({ organizationId, expectedPolicyVersion, changes = [], actorLogtoUserId, reason, decisionId } = {}) {
      assertLogtoId(organizationId, "logto_organization_id");
      assertLogtoId(actorLogtoUserId, "updated_by_logto_user_id");
      const current = await repository.getPolicyVersion(organizationId);
      if (expectedPolicyVersion && Number(expectedPolicyVersion) !== Number(current)) throw entitlementError(ENTITLEMENT_REASON_CODES.AUTHORIZATION_POLICY_VERSION_CONFLICT);
      const normalized = changes.map((change) => validateEntitlementChange(change, { roleIdToName }));
      for (const change of normalized) {
        const ceiling = await repository.getLimit({ organizationId, logtoRoleId: change.logtoRoleId, permission: change.permission });
        if (!ceiling || ceiling.allowed !== true) throw entitlementError(ENTITLEMENT_REASON_CODES.TENANT_ACTIVATION_EXCEEDS_OWNER_CEILING);
        if (ceiling.locked === true) throw entitlementError(ENTITLEMENT_REASON_CODES.TENANT_ACTIVATION_LOCKED);
      }
      return repository.transaction(async () => {
        const policyVersion = await mutateVersion({ eventType: "authorization.role_activation.changed", organizationId, actorLogtoUserId });
        const saved = [];
        for (const change of normalized) {
          const before = await repository.getActivation({ organizationId, logtoRoleId: change.logtoRoleId, permission: change.permission });
          const ceiling = await repository.getLimit({ organizationId, logtoRoleId: change.logtoRoleId, permission: change.permission });
          const activation = await repository.upsertActivation({ logtoOrganizationId: organizationId, logtoRoleId: change.logtoRoleId, roleNameCache: roleIdToName[change.logtoRoleId], permissionKey: change.permission, entitlementLimitId: ceiling.id, enabled: Boolean(change.enabled), policyVersion, setByLogtoUserId: actorLogtoUserId, reason: change.reason || reason || null });
          await runtimeConsistencyPort.audit({ action: before ? "authz.role_permission_activation.updated" : "authz.role_permission_activation.created", decisionId, organizationId, roleId: change.logtoRoleId, permission: change.permission, before, after: activation, reason: change.reason || reason || null, policyVersion });
          saved.push(activation);
        }
        return { policyVersion, activations: saved };
      });
    },
  };
}
module.exports = { createEntitlementService, entitlementError };
