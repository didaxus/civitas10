"use strict";
const { permissionsByName, rolePermissionAssignments } = require("../../../core/authz");
const { ENTITLEMENT_REASON_CODES } = require("./entitlementReasonCodes");
const { roleManifestContains, getRoleName } = require("./entitlementValidation");

function asSet(value) { return value instanceof Set ? value : new Set(Array.isArray(value) ? value : []); }
function buildDeniedPath(path, reasonCode, extra = {}) { return { rolePathId: path.rolePathId, logtoRoleId: path.logtoRoleId, tokenScopePresent: Boolean(path.tokenScopePresent), rolePotential: false, ceilingAllowed: false, tenantActivationEnabled: false, allowed: false, reasonCode, ...extra }; }
async function evaluateOrganizationEntitlement({ organizationId, subject, tokenScopes, rolePaths = [], permission, policyVersion, repository, roleIdToName = {}, currentPolicyVersion } = {}) {
  if (!repository || !repository.getLimit || !repository.getActivation) return { allowed: false, organizationId, subject, permission, policyVersion, evaluatedRolePaths: [], reasonCode: ENTITLEMENT_REASON_CODES.AUTHORIZATION_POLICY_UNAVAILABLE };
  const definition = permissionsByName[permission];
  const runtimeAvailable = definition?.status === "active" && definition?.observedImplementation === "active";
  const scopes = asSet(tokenScopes);
  const currentVersion = currentPolicyVersion || (repository.getPolicyVersion ? await repository.getPolicyVersion(organizationId) : undefined);
  if (policyVersion && currentVersion && Number(policyVersion) < Number(currentVersion)) {
    return { allowed: false, organizationId, subject, permission, policyVersion: currentVersion, evaluatedRolePaths: rolePaths.map((path) => buildDeniedPath(path, ENTITLEMENT_REASON_CODES.AUTHORIZATION_SNAPSHOT_STALE, { tokenScopePresent: scopes.has(permission) })), reasonCode: ENTITLEMENT_REASON_CODES.AUTHORIZATION_SNAPSHOT_STALE };
  }
  const evaluatedRolePaths = [];
  for (const path of rolePaths) {
    const tokenScopePresent = Boolean(path.tokenScopePresent) && scopes.has(permission);
    if (!tokenScopePresent) { evaluatedRolePaths.push(buildDeniedPath(path, ENTITLEMENT_REASON_CODES.TOKEN_SCOPE_MISSING, { tokenScopePresent })); continue; }
    const roleName = path.roleNameCache || getRoleName(path.logtoRoleId, roleIdToName);
    const knownRole = Array.isArray(rolePermissionAssignments?.[roleName]);
    if (!knownRole) { evaluatedRolePaths.push(buildDeniedPath(path, ENTITLEMENT_REASON_CODES.ORGANIZATION_ROLE_UNKNOWN, { tokenScopePresent })); continue; }
    const rolePotential = roleManifestContains(path.logtoRoleId, permission, { ...roleIdToName, [path.logtoRoleId]: roleName });
    if (!rolePotential) { evaluatedRolePaths.push(buildDeniedPath(path, ENTITLEMENT_REASON_CODES.ROLE_PERMISSION_MISSING, { tokenScopePresent, rolePotential })); continue; }
    if (!runtimeAvailable) { evaluatedRolePaths.push(buildDeniedPath(path, ENTITLEMENT_REASON_CODES.RUNTIME_OPERATION_UNAVAILABLE, { tokenScopePresent, rolePotential })); continue; }
    const ceiling = await repository.getLimit({ organizationId, logtoRoleId: path.logtoRoleId, permission });
    if (!ceiling) { evaluatedRolePaths.push(buildDeniedPath(path, ENTITLEMENT_REASON_CODES.OWNER_CEILING_MISSING, { tokenScopePresent, rolePotential })); continue; }
    if (ceiling.allowed !== true) { evaluatedRolePaths.push(buildDeniedPath(path, ENTITLEMENT_REASON_CODES.OWNER_CEILING_DENIED, { tokenScopePresent, rolePotential, ceilingAllowed: false })); continue; }
    const activation = await repository.getActivation({ organizationId, logtoRoleId: path.logtoRoleId, permission });
    if (!activation) { evaluatedRolePaths.push(buildDeniedPath(path, ENTITLEMENT_REASON_CODES.TENANT_ACTIVATION_MISSING, { tokenScopePresent, rolePotential, ceilingAllowed: true })); continue; }
    if (activation.enabled !== true) { evaluatedRolePaths.push(buildDeniedPath(path, ENTITLEMENT_REASON_CODES.TENANT_ACTIVATION_DENIED, { tokenScopePresent, rolePotential, ceilingAllowed: true, tenantActivationEnabled: false })); continue; }
    evaluatedRolePaths.push({ rolePathId: path.rolePathId, logtoRoleId: path.logtoRoleId, tokenScopePresent, rolePotential, ceilingAllowed: true, tenantActivationEnabled: true, allowed: true, reasonCode: ENTITLEMENT_REASON_CODES.ENTITLEMENT_ALLOWED });
  }
  const matched = evaluatedRolePaths.find((path) => path.allowed);
  return { allowed: Boolean(matched), organizationId, subject, permission, policyVersion: currentVersion || policyVersion, matchedRolePathId: matched?.rolePathId, evaluatedRolePaths, reasonCode: matched ? ENTITLEMENT_REASON_CODES.ENTITLEMENT_ALLOWED : (evaluatedRolePaths[0]?.reasonCode || ENTITLEMENT_REASON_CODES.OWNER_CEILING_MISSING) };
}
module.exports = { evaluateOrganizationEntitlement };
