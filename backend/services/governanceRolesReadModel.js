"use strict";

const crypto = require("node:crypto");
const { permissionsByName, rolePermissionAssignments } = require("../../core/authz");
const { createInMemoryEntitlementRepository } = require("../authorization/entitlements/entitlementRepository");
const { createEntitlementService } = require("../authorization/entitlements/entitlementService");
const { evaluateOrganizationEntitlement } = require("../authorization/entitlements/entitlementEvaluator");
const { createAuthorizationFreshnessService } = require("../authorization/runtime/authorizationFreshnessService");
const { createInMemoryRoleLabelRepository, createRoleLabelResolver, createRoleLabelService } = require("../domain/role-labels");

const entitlementRepository = createInMemoryEntitlementRepository();
const runtimeAuditEvents = [];
const runtimeOutboxEvents = [];
const runtimeCacheInvalidations = [];
const roleLabelRepository = createInMemoryRoleLabelRepository();
const canonicalRolesById = new Map();
const canonicalRoleCatalog = { async getById({ canonicalRoleId }) { return canonicalRolesById.get(canonicalRoleId) || null; } };
const roleLabelResolver = createRoleLabelResolver({ repository: roleLabelRepository, canonicalRoleCatalog });
const roleLabelService = createRoleLabelService({ repository: roleLabelRepository, resolver: roleLabelResolver, canonicalRoleCatalog });

const runtimeConsistencyPort = {
  async incrementPolicyVersion({ organizationId }) { return entitlementRepository.incrementPolicyVersion(organizationId); },
  async enqueueOutbox(event) { runtimeOutboxEvents.push({ ...event, createdAt: new Date().toISOString() }); return event; },
  async audit(event) { runtimeAuditEvents.push({ ...event, createdAt: new Date().toISOString() }); return event; },
};
const authorizationFreshnessService = createAuthorizationFreshnessService({
  versionService: { increment: async ({ organizationId }) => ({ policyVersion: await entitlementRepository.incrementPolicyVersion(organizationId) }), getVersion: async (organizationId) => ({ policyVersion: await entitlementRepository.getPolicyVersion(organizationId) }) },
  cachePort: { async invalidateOrganization(event) { runtimeCacheInvalidations.push({ ...event, createdAt: new Date().toISOString() }); } },
  eventPort: { async publish(event) { runtimeOutboxEvents.push({ ...event, createdAt: new Date().toISOString() }); } },
});

function hashSubject(value) { return value ? `sub_${crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 12)}` : null; }
function roleId(role = {}) { return role.id || role.organizationRoleId || role.roleId || null; }
function roleName(role = {}) { return role.name || role.nameCache || role.key || roleId(role); }
function canonicalRoleKey(name = "") {
  const raw = String(name || "").trim();
  if (raw.startsWith("organization_") || raw === "owner_global") return raw;
  return `organization_${raw.replace(/-org$/i, "").replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toLowerCase()}`;
}
function displayName(name = "") { return String(name || "").replace(/-org$/i, "").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function registerCanonicalRoles(roles = []) {
  for (const role of roles) { const id = roleId(role); if (id) canonicalRolesById.set(id, { canonicalRoleId: id, canonicalKey: canonicalRoleKey(roleName(role)), defaultName: displayName(roleName(role)) }); }
}
function safeMemberDisplay(user = {}) { return user.id || user.userId || user.logtoUserId ? hashSubject(user.id || user.userId || user.logtoUserId) : "member_unknown"; }
function activeOrganizationPermissions() { return Object.values(permissionsByName).filter((permission) => permission?.surface === "organization" && permission.status === "active" && !permission.name.startsWith("owner.")).map((permission) => permission.name).sort(); }

async function listRoleView({ roles = [], members = [], memberRolesByUserId = new Map(), organizationId }) {
  registerCanonicalRoles(roles);
  const limits = await entitlementRepository.listLimits({ organizationId });
  const byRole = new Map();
  for (const role of roles) {
    const id = roleId(role);
    if (!id) continue;
    const label = await roleLabelResolver.resolve({ organizationId, canonicalRoleId: id });
    const canonicalKey = label.canonicalKey;
    if (!canonicalKey.startsWith("organization_")) continue;
    const potentialPermissions = rolePermissionAssignments[canonicalKey] || [];
    byRole.set(id, {
      id,
      canonicalKey,
      displayName: label.effectiveAlias,
      defaultName: label.defaultName,
      labelProvenance: label.provenance,
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
  registerCanonicalRoles(roles);
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

async function buildMemberView({ organizationId, members = [], memberRolesByUserId = new Map() }) {
  const output = [];
  for (const user of members) {
    const userId = user.id || user.userId || user.logtoUserId;
    const memberRoles = memberRolesByUserId.get(userId) || [];
    registerCanonicalRoles(memberRoles);
    output.push({
      id: userId,
      display: safeMemberDisplay(user),
      roleIds: (memberRolesByUserId.get(userId) || []).map(roleId).filter(Boolean),
      roleAliases: (await Promise.all(memberRoles.map((role) => roleLabelResolver.resolve({ organizationId, canonicalRoleId: roleId(role) })))).map((label) => label.effectiveAlias),
      dataScopeSummary: "not_configured",
      allowedAssignmentActions: [],
    });
  }
  return output;
}

async function buildRolesGovernanceSlice({ organizationId, roles = [], members = [], memberRolesByUserId = new Map() }) {
  return {
    contractVersion: "2026-07-civitas10-governance-roles-v1",
    policyVersion: await entitlementRepository.getPolicyVersion(organizationId),
    roles: await listRoleView({ roles, members, memberRolesByUserId, organizationId }),
    members: await buildMemberView({ organizationId, members, memberRolesByUserId }),
    permissionMatrix: await buildPermissionRows({ organizationId, roles }),
    auditEvents: runtimeAuditEvents.filter((event) => event.organizationId === organizationId).slice(-25),
    outboxEvents: runtimeOutboxEvents.filter((event) => event.organizationId === organizationId).slice(-25),
  };
}

async function updateOwnerCeilings({ organizationId, actorLogtoUserId, changes, expectedPolicyVersion, roleIdToName, reason, decisionId }) {
  return createEntitlementService({ repository: entitlementRepository, runtimeConsistencyPort, authorizationFreshnessService, roleIdToName }).upsertOwnerLimits({ organizationId, actorLogtoUserId, changes, expectedPolicyVersion, reason, decisionId });
}
async function updateTenantActivations({ organizationId, actorLogtoUserId, changes, expectedPolicyVersion, roleIdToName, reason, decisionId }) {
  return createEntitlementService({ repository: entitlementRepository, runtimeConsistencyPort, authorizationFreshnessService, roleIdToName }).upsertTenantActivations({ organizationId, actorLogtoUserId, changes, expectedPolicyVersion, reason, decisionId });
}
function roleMapFromRoles(roles = []) { return Object.fromEntries(roles.map((role) => [roleId(role), canonicalRoleKey(roleName(role))]).filter(([id]) => id)); }
async function updateRoleAlias(input) { return roleLabelService.update(input); }
async function resetRoleAlias(input) { return roleLabelService.reset(input); }

module.exports = { entitlementRepository, runtimeAuditEvents, runtimeOutboxEvents, runtimeCacheInvalidations, authorizationFreshnessService, roleLabelRepository, roleLabelResolver, buildRolesGovernanceSlice, updateOwnerCeilings, updateTenantActivations, updateRoleAlias, resetRoleAlias, registerCanonicalRoles, roleMapFromRoles, canonicalRoleKey };
