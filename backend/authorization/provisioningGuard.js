"use strict";
const { organizationRoles } = require("../../core/authz");
const CANONICAL_ORGANIZATION_ROLES = new Set(organizationRoles);
const SENSITIVE_ORGANIZATION_ROLES = new Set([
  "organization_admin",
  "organization_director",
  "organization_accountant",
  "organization_billing",
  "organization_payroll",
  "organization_headdirector",
]);
const AUTOMATIC_PROVISIONING_SOURCES = new Set(["jit_default_roles", "federated_jit"]);

function provisioningError(code, details = {}) { return Object.assign(new Error(code), { code, safeDetails: details }); }

function hasExplicitOwnerPolicy(approvalPolicy) {
  if (!approvalPolicy || typeof approvalPolicy !== "object") return false;
  return approvalPolicy.ownerApproved === true || approvalPolicy.explicitOwnerPolicy === true || approvalPolicy.approvedBy === "owner" || approvalPolicy.policyOwner === "owner";
}

function isAutomaticFirstLogin({ source, autoProvisioningMode, firstLogin } = {}) {
  if (AUTOMATIC_PROVISIONING_SOURCES.has(source)) return true;
  return firstLogin === true && ["automatic", "auto", "jit", "federated_jit"].includes(autoProvisioningMode);
}

function assertProvisionedRoleAllowed({ roleName, source = "provisioning", autoProvisioningMode, firstLogin = false, approvalPolicy } = {}) {
  if (!roleName || typeof roleName !== "string") throw provisioningError("provisioning_role_not_canonical", { source });
  if (roleName === "owner_global" || roleName.startsWith("owner_")) throw provisioningError("provisioning_owner_role_forbidden", { source });
  if (!CANONICAL_ORGANIZATION_ROLES.has(roleName)) throw provisioningError("provisioning_role_not_canonical", { source, roleName });
  if (SENSITIVE_ORGANIZATION_ROLES.has(roleName) && isAutomaticFirstLogin({ source, autoProvisioningMode, firstLogin }) && !hasExplicitOwnerPolicy(approvalPolicy)) {
    throw provisioningError("provisioning_sensitive_role_requires_owner_policy", { source, roleName, autoProvisioningMode, firstLogin });
  }
  return true;
}

function assertFederationRoleMappingAllowed({ roleName, actor, reason, policyVersion, mappingVersion, approvalPolicy, audit } = {}) {
  assertProvisionedRoleAllowed({ roleName, source: "federated_jit", approvalPolicy });
  if (SENSITIVE_ORGANIZATION_ROLES.has(roleName)) {
    if (!actor) throw provisioningError("federation_sensitive_mapping_actor_required", { roleName, mappingVersion, policyVersion });
    if (!reason) throw provisioningError("federation_sensitive_mapping_reason_required", { roleName, mappingVersion, policyVersion });
    if (!policyVersion) throw provisioningError("federation_sensitive_mapping_policy_version_required", { roleName, mappingVersion });
    if (!mappingVersion) throw provisioningError("federation_sensitive_mapping_version_required", { roleName, policyVersion });
    if (audit && typeof audit.record === "function") audit.record({ action: "federation.role_mapping.sensitive_review_required", actor, reason, policyVersion, mappingVersion, roleName });
  }
  return true;
}

function sanitizeExternalProvisioningClaims(claims = {}) {
  const forbiddenKeys = ["permissions", "permission", "scopes", "scope", "actionIds", "action_ids", "ownerCeilings", "owner_ceilings", "tenantActivations", "tenant_activations", "dataScopes", "data_scopes", "owner_global", "tenantId", "tenant_id", "organizationId"];
  for (const key of forbiddenKeys) if (Object.prototype.hasOwnProperty.call(claims, key)) throw provisioningError("provisioning_claim_forbidden", { key });
  return { subject: claims.sub || claims.subject || null, email: claims.email || null };
}
function assertVerifiedTenantProvisioningBinding({ organizationId, verified, source } = {}) {
  if (!organizationId || verified !== true) throw provisioningError("provisioning_binding_unverified", { source });
  return true;
}
module.exports = { assertProvisionedRoleAllowed, assertFederationRoleMappingAllowed, sanitizeExternalProvisioningClaims, assertVerifiedTenantProvisioningBinding, provisioningError, SENSITIVE_ORGANIZATION_ROLES };
