"use strict";
const { evaluateOrganizationEntitlement } = require("./entitlementEvaluator");
function createEntitlementPolicyProvider({ repository, roleIdToName = {}, currentPolicyVersion, authorizationFreshnessService } = {}) {
  return {
    async evaluate({ organizationId, subject, tokenScopes, rolePaths, permission, policyVersion }) {
      return evaluateOrganizationEntitlement({ organizationId, subject, tokenScopes, rolePaths, permission, policyVersion, repository, roleIdToName, currentPolicyVersion });
    },
    async evaluateSnapshot({ organizationId, policyVersion }) {
      if (authorizationFreshnessService?.assertCurrent) {
        try { await authorizationFreshnessService.assertCurrent({ organizationId, snapshotVersion: policyVersion, critical: true }); return { status: "current", policyVersion }; }
        catch (error) { return { status: error.code === "authorization_snapshot_stale" ? "stale" : "unavailable", policyVersion }; }
      }
      if (!repository?.getPolicyVersion) return { status: "unavailable" };
      const current = await repository.getPolicyVersion(organizationId);
      return !policyVersion || Number(policyVersion) >= Number(current) ? { status: "current", policyVersion: current } : { status: "stale", policyVersion: current };
    },
  };
}
module.exports = { createEntitlementPolicyProvider };
