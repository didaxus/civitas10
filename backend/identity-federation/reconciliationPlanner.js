"use strict";

const { rolePermissionAssignments, permissionsByName } = require("../../core/authz");

function activeRoleManifest() {
  const active = new Set(Object.values(permissionsByName).filter((p) => p.status === "active" || p.targetStatus === "active").map((p) => p.name));
  return Object.fromEntries(Object.entries(rolePermissionAssignments).map(([role, permissions]) => [role, permissions.filter((permission) => active.has(permission))]));
}

function hasRequiredRuntimeFacts(candidate, runtime = {}) {
  return Boolean(runtime.dataScopes?.[candidate.canonical_role_key] && runtime.ownerCeilings?.[candidate.canonical_role_key] && runtime.tenantActivations?.[candidate.canonical_role_key] && runtime.logtoMaterializationPlan?.roles?.includes(candidate.canonical_role_key));
}

function planFederatedIdentityReconciliation({ identity, mappingResult, currentRoleKeys = [], runtime = {}, requiredClaims = ["provider", "subject", "tenantId"] } = {}) {
  const manifest = activeRoleManifest();
  const desired = new Set();
  const blocks = [];
  const missingRequiredClaims = requiredClaims.filter((claim) => identity?.missingClaims?.includes(claim) || !({ provider: identity?.provider, subject: identity?.externalSubjectId, tenantId: identity?.tenantId })[claim]);
  const destructiveBlocked = identity?.claimsComplete === false || identity?.incompletenessReason === "overage" || missingRequiredClaims.length > 0;
  if (destructiveBlocked) blocks.push({ reasonCode: identity?.incompletenessReason === "overage" ? "identity_claims_overage" : "identity_required_claims_missing", missingRequiredClaims });
  for (const rejection of mappingResult?.rejected || []) blocks.push(rejection);
  for (const candidate of mappingResult?.candidates || []) {
    if (candidate.canonical_role_key === "owner_global") { blocks.push({ reasonCode: "identity_owner_global_forbidden", candidate }); continue; }
    if (!manifest[candidate.canonical_role_key]) { blocks.push({ reasonCode: "identity_role_not_in_active_manifest", candidate }); continue; }
    if (!hasRequiredRuntimeFacts(candidate, runtime)) { blocks.push({ reasonCode: "identity_required_governance_fact_missing", candidate }); continue; }
    desired.add(candidate.canonical_role_key);
  }
  const adds = [...desired].filter((role) => !currentRoleKeys.includes(role)).sort();
  const removes = currentRoleKeys.filter((role) => !desired.has(role)).sort();
  return Object.freeze({
    schemaVersion: "civitas-identity-federation-reconciliation-plan/v1",
    safeToApply: blocks.length === 0 && !destructiveBlocked,
    destructiveRemovalsBlocked: destructiveBlocked,
    desiredAdds: adds,
    desiredRemoves: destructiveBlocked ? [] : removes,
    blockedRemoves: destructiveBlocked ? removes : [],
    blocks,
    provenance: { activeRoleManifest: true, dataScope: "#163", pbacOwnerCeilingsTenantActivations: "#164", logtoMaterializationPlan: "#165" },
  });
}

module.exports = { activeRoleManifest, planFederatedIdentityReconciliation };
