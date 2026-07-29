"use strict";

const crypto = require("node:crypto");
const { permissionsByName, rolePermissionAssignments } = require("../../core/authz");
const { createEntitlementService } = require("../authorization/entitlements/entitlementService");
const { evaluateOrganizationEntitlement } = require("../authorization/entitlements/entitlementEvaluator");
const { createAuthorizationFreshnessService } = require("../authorization/runtime/authorizationFreshnessService");

function createGovernanceRolesReadModel({ entitlementRepository, runtimeConsistencyPort, authorizationFreshnessService, auditPort, outboxPort } = {}) {
  if (!entitlementRepository || !runtimeConsistencyPort || !authorizationFreshnessService || !auditPort || !outboxPort) throw new Error("governance_roles_ports_required");
function hashSubject(value) { return value ? `sub_${crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 12)}` : null; }
function roleId(role = {}) { return role.id || role.organizationRoleId || role.roleId || null; }
function roleName(role = {}) { return role.name || role.nameCache || role.key || roleId(role); }
function canonicalRoleKey(name = "") {
  const raw = String(name || "").trim();
  if (raw.startsWith("organization_") || raw === "owner_global") return raw;
  return `organization_${raw.replace(/-org$/i, "").replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toLowerCase()}`;
}
function displayName(name = "") { return String(name || "").replace(/-org$/i, "").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function safeMemberDisplay(user = {}) { return user.id || user.userId || user.logtoUserId ? hashSubject(user.id || user.userId || user.logtoUserId) : "member_unknown"; }
function activeOrganizationPermissions() { return Object.values(permissionsByName).filter((permission) => permission?.surface === "organization" && permission.status === "active" && !permission.name.startsWith("owner.")).map((permission) => permission.name).sort(); }

async function listRoleView({ roles = [], members = [], memberRolesByUserId = new Map(), organizationId }) {
  const limits = await entitlementRepository.listLimits({ organizationId });
  const byRole = new Map();
  for (const role of roles) {
    const id = roleId(role);
    if (!id) continue;
    const canonicalKey = canonicalRoleKey(roleName(role));
    if (!canonicalKey.startsWith("organization_")) continue;
    const potentialPermissions = rolePermissionAssignments[canonicalKey] || [];
    byRole.set(id, {
      id,
      canonicalKey,
      displayName: displayName(roleName(role)),
      assignedMemberCount: 0,
      potentialPermissions,
      ceilingCoverage: potentialPermissions.length ? limits.filter((limit) => limit.logtoRoleId === id && limit.allowed === true).length / potentialPermissions.length : 0,
    });
  }
  for (const user of members) {
    const userId = user.id || user.userId || user.logtoUserId;
    for (const role of memberRolesByUserId.get(userId) || []) {
      const current = byRole.get(roleId(role));
      if (current) current.assignedMemberCount += 1;
    }
  }
  return [...byRole.values()];
}

async function buildPermissionRows({ organizationId, roles = [] }) {
  const permissions = activeOrganizationPermissions();
  const policyVersion = await entitlementRepository.getPolicyVersion(organizationId);
  const rows = [];
  const roleIdToName = Object.fromEntries(roles.map((role) => [roleId(role), canonicalRoleKey(roleName(role))]).filter(([id]) => id));
  for (const role of roles) {
    const id = roleId(role);
    if (!id) continue;
    if (!canonicalRoleKey(roleName(role)).startsWith("organization_")) continue;
    for (const permission of permissions) {
      const rolePath = { rolePathId: `${id}:${permission}`, logtoRoleId: id, roleNameCache: roleIdToName[id], tokenScopePresent: true };
      const evaluation = await evaluateOrganizationEntitlement({ organizationId, subject: null, tokenScopes: permissions, rolePaths: [rolePath], permission, policyVersion, repository: entitlementRepository, roleIdToName });
      const path = evaluation.evaluatedRolePaths[0] || {};
      rows.push({
        roleId: id,
        roleKey: roleIdToName[id],
        permission,
        canonical: Boolean(permissionsByName[permission]),
        rolePotential: path.rolePotential === true,
        ownerAllowed: path.ceilingAllowed === true,
        tenantEnabled: path.tenantActivationEnabled === true,
        effective: path.allowed === true,
        reason: { code: path.allowed ? "allowed" : path.reasonCode || evaluation.reasonCode, sourceVersions: { policyVersion: String(evaluation.policyVersion || policyVersion), ceilingVersion: String(policyVersion), activationVersion: String(policyVersion), catalogVersion: "2026-07-civitas10-active-permissions-v1" } },
      });
    }
  }
  return rows;
}

async function buildMemberView({ members = [], memberRolesByUserId = new Map() }) {
  return members.map((user) => {
    const userId = user.id || user.userId || user.logtoUserId;
    return {
      id: userId,
      display: safeMemberDisplay(user),
      roleIds: (memberRolesByUserId.get(userId) || []).map(roleId).filter(Boolean),
      roleAliases: (memberRolesByUserId.get(userId) || []).map((role) => displayName(roleName(role))).filter(Boolean),
      dataScopeSummary: "not_configured",
      allowedAssignmentActions: [],
    };
  });
}

async function buildRolesGovernanceSlice({ organizationId, roles = [], members = [], memberRolesByUserId = new Map() }) {
  return {
    contractVersion: "2026-07-civitas10-governance-roles-v1",
    policyVersion: await entitlementRepository.getPolicyVersion(organizationId),
    roles: await listRoleView({ roles, members, memberRolesByUserId, organizationId }),
    members: await buildMemberView({ members, memberRolesByUserId }),
    permissionMatrix: await buildPermissionRows({ organizationId, roles }),
    auditEvents: await auditPort.list({ organizationId, limit: 25 }),
    outboxEvents: await outboxPort.list({ organizationId, limit: 25 }),
  };
}

async function updateOwnerCeilings({ organizationId, actorLogtoUserId, changes, expectedPolicyVersion, roleIdToName, reason, decisionId }) {
  return createEntitlementService({ repository: entitlementRepository, runtimeConsistencyPort, authorizationFreshnessService, roleIdToName }).upsertOwnerLimits({ organizationId, actorLogtoUserId, changes, expectedPolicyVersion, reason, decisionId });
}
async function updateTenantActivations({ organizationId, actorLogtoUserId, changes, expectedPolicyVersion, roleIdToName, reason, decisionId }) {
  return createEntitlementService({ repository: entitlementRepository, runtimeConsistencyPort, authorizationFreshnessService, roleIdToName }).upsertTenantActivations({ organizationId, actorLogtoUserId, changes, expectedPolicyVersion, reason, decisionId });
}
function roleMapFromRoles(roles = []) { return Object.fromEntries(roles.map((role) => [roleId(role), canonicalRoleKey(roleName(role))]).filter(([id]) => id)); }

return { buildRolesGovernanceSlice, updateOwnerCeilings, updateTenantActivations, roleMapFromRoles };
}

module.exports = { createGovernanceRolesReadModel, canonicalRoleKey, roleMapFromRoles };
