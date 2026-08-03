"use strict";
const { permissionsByName, rolePermissionAssignments } = require("../../../core/authz");

const FORBIDDEN_ORGANIZATION_PERMISSION_KEYS = new Set(["org.impersonate", "billing.seats.request_modify", "*"]);
function getRoleName(logtoRoleId, roleIdToName = {}) { return roleIdToName[logtoRoleId] || logtoRoleId; }
function roleManifestContains(logtoRoleId, permission, roleIdToName = {}) {
  const roleName = getRoleName(logtoRoleId, roleIdToName);
  const assignments = rolePermissionAssignments?.[roleName];
  return Array.isArray(assignments) && assignments.includes(permission);
}
function assertLogtoId(value, fieldName) {
  const id = String(value || "").trim();
  if (!id || id.length > 128 || id.includes("/")) throw Object.assign(new Error(`${fieldName}_invalid`), { code: `${fieldName}_invalid` });
  return id;
}
function validateOrganizationPermission(permission) {
  const key = String(permission || "").trim();
  const definition = permissionsByName[key];
  if (!definition) throw Object.assign(new Error("permission_unknown"), { code: "permission_unknown" });
  if (definition.status !== "active" && definition.identityProvisioning !== "provisionable") throw Object.assign(new Error("permission_inactive"), { code: "permission_inactive" });
  if (key.startsWith("owner.") || key.startsWith("organization.") || FORBIDDEN_ORGANIZATION_PERMISSION_KEYS.has(key)) throw Object.assign(new Error("permission_not_allowed_for_tenant_entitlement"), { code: "permission_not_allowed_for_tenant_entitlement" });
  if (!definition.surface || definition.surface !== "organization") throw Object.assign(new Error("permission_surface_mismatch"), { code: "permission_surface_mismatch" });
  return key;
}
function validateEntitlementChange(change, { roleIdToName = {} } = {}) {
  const logtoRoleId = assertLogtoId(change.logtoRoleId, "logto_role_id");
  const permission = validateOrganizationPermission(change.permission || change.permissionKey);
  if (!roleManifestContains(logtoRoleId, permission, roleIdToName)) throw Object.assign(new Error("role_permission_missing"), { code: "role_permission_missing" });
  return { ...change, logtoRoleId, permission };
}
module.exports = { FORBIDDEN_ORGANIZATION_PERMISSION_KEYS, assertLogtoId, validateOrganizationPermission, validateEntitlementChange, roleManifestContains, getRoleName };
