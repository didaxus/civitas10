"use strict";
const { ENTITLEMENT_REASON_CODES } = require("./entitlementReasonCodes");
const { assertLogtoId, validateEntitlementChange } = require("./entitlementValidation");
function entitlementError(code, message = code) { return Object.assign(new Error(message), { code, status: code === ENTITLEMENT_REASON_CODES.AUTHORIZATION_POLICY_VERSION_CONFLICT ? 409 : 400 }); }
function createEntitlementService({ repository, roleIdToName = {} } = {}) {
  if (!repository) throw new Error("repository_required");
  const validate = (input) => { assertLogtoId(input.organizationId, "logto_organization_id"); assertLogtoId(input.actorLogtoUserId, "updated_by_logto_user_id"); return (input.changes || []).map((change) => validateEntitlementChange(change, { roleIdToName })); };
  async function begin(input, normalized, eventType, action, apply) {
    return repository.transaction(async (tx) => {
      const current = await tx.getPolicyVersion(input.organizationId, { lock: true });
      if (input.expectedPolicyVersion && Number(input.expectedPolicyVersion) !== current) throw entitlementError(ENTITLEMENT_REASON_CODES.AUTHORIZATION_POLICY_VERSION_CONFLICT);
      const policyVersion = await tx.incrementPolicyVersion(input.organizationId, input.actorLogtoUserId, input.reason);
      const saved = [];
      for (const change of normalized) saved.push(await apply(tx, change, policyVersion));
      await tx.enqueueOutbox({ eventType, organizationId: input.organizationId, actorLogtoUserId: input.actorLogtoUserId, roleId: normalized[0]?.logtoRoleId, permissions: normalized.map((change) => change.permission), policyVersion, decisionId: input.decisionId || null });
      for (const evidence of saved) await tx.audit({ action, organizationId: input.organizationId, actorLogtoUserId: input.actorLogtoUserId, roleId: evidence.after.logtoRoleId, permission: evidence.after.permissionKey, before: evidence.before, after: evidence.after, mutationType: eventType, reason: input.reason, policyVersion, decisionId: input.decisionId || null, timestamp: new Date().toISOString() });
      return { policyVersion, saved: saved.map((entry) => entry.after) };
    });
  }
  return {
    async upsertOwnerLimits(input = {}) { const normalized = validate(input); const result = await begin(input, normalized, "authorization.entitlement_limit.changed", "authz.entitlement_limit.updated", async (tx, change, policyVersion) => { const before = await tx.getLimit({ organizationId: input.organizationId, logtoRoleId: change.logtoRoleId, permission: change.permission }); const after = await tx.upsertLimit({ logtoOrganizationId: input.organizationId, logtoRoleId: change.logtoRoleId, roleNameCache: roleIdToName[change.logtoRoleId], permissionKey: change.permission, allowed: !!change.allowed, locked: !!change.locked, policyVersion, setByLogtoUserId: input.actorLogtoUserId, reason: change.reason || input.reason }); if (before?.allowed && !after.allowed) await tx.disableActivation({ organizationId: input.organizationId, logtoRoleId: change.logtoRoleId, permission: change.permission, policyVersion }); return { before, after }; }); return { policyVersion: result.policyVersion, limits: result.saved }; },
    async upsertTenantActivations(input = {}) { const normalized = validate(input); const result = await begin(input, normalized, "authorization.role_activation.changed", "authz.role_permission_activation.updated", async (tx, change, policyVersion) => { const ceiling = await tx.getLimit({ organizationId: input.organizationId, logtoRoleId: change.logtoRoleId, permission: change.permission }); if (!ceiling?.allowed) throw entitlementError(ENTITLEMENT_REASON_CODES.TENANT_ACTIVATION_EXCEEDS_OWNER_CEILING); if (ceiling.locked) throw entitlementError(ENTITLEMENT_REASON_CODES.TENANT_ACTIVATION_LOCKED); const before = await tx.getActivation({ organizationId: input.organizationId, logtoRoleId: change.logtoRoleId, permission: change.permission }); const after = await tx.upsertActivation({ logtoOrganizationId: input.organizationId, logtoRoleId: change.logtoRoleId, roleNameCache: roleIdToName[change.logtoRoleId], permissionKey: change.permission, entitlementLimitId: ceiling.id, enabled: !!change.enabled, policyVersion, setByLogtoUserId: input.actorLogtoUserId, reason: change.reason || input.reason }); return { before, after }; }); return { policyVersion: result.policyVersion, activations: result.saved }; },
  };
}
module.exports = { createEntitlementService, entitlementError };
