"use strict";

const crypto = require("node:crypto");
const { permissionsByName, rolePermissionAssignments, organizationRolePotentials } = require("../../core/authz");
const { createInMemoryEntitlementRepository } = require("../authorization/entitlements/entitlementRepository");
const { createEntitlementService } = require("../authorization/entitlements/entitlementService");
const { createAuthorizationFreshnessService } = require("../authorization/runtime/authorizationFreshnessService");

const entitlementRepository = createInMemoryEntitlementRepository();
const runtimeAuditEvents = [];
const runtimeOutboxEvents = [];
const runtimeCacheInvalidations = [];

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
function safeMemberDisplay(user = {}) { return user.id || user.userId || user.logtoUserId ? hashSubject(user.id || user.userId || user.logtoUserId) : "member_unknown"; }
function rolePotentialByKey() { return new Map((organizationRolePotentials || []).map((role) => [role.roleKey, role])); }
function title(value) { return String(value || "").replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function presentationFor(permission = {}) {
  const [domain = "organization", resource = "permission", action = "access"] = String(permission.name || "").split(".");
  const groupKey = permission.domain || permission.namespace || domain;
  return {
    groupKey,
    groupLabel: title(groupKey),
    groupOrder: ["org", "lms", "planning", "community", "analytics", "reports", "crm", "scheduling", "communications", "notifications", "accounting", "billing", "payroll", "support", "platform"].indexOf(groupKey) + 1 || 99,
    label: title(`${action} ${resource}`),
    description: `Allows ${title(action).toLowerCase()} access for ${title(resource).toLowerCase()}.`,
    order: Math.abs(String(permission.name || "").split("").reduce((sum, char) => sum + char.charCodeAt(0), 0)),
  };
}
function targetPotentialPermissions(canonicalKey) {
  const potential = rolePotentialByKey().get(canonicalKey);
  return Array.isArray(potential?.potentialPermissionIds) ? potential.potentialPermissionIds : (rolePermissionAssignments[canonicalKey] || []);
}
function executablePermissions(canonicalKey) {
  const potential = rolePotentialByKey().get(canonicalKey);
  return new Set(Array.isArray(potential?.activeExecutableScopeIds) ? potential.activeExecutableScopeIds : (rolePermissionAssignments[canonicalKey] || []));
}

async function listRoleView({ roles = [], members = [], memberRolesByUserId = new Map(), organizationId }) {
  const limits = await entitlementRepository.listLimits({ organizationId });
  const byRole = new Map();
  for (const role of roles) {
    const id = roleId(role);
    if (!id) continue;
    const canonicalKey = canonicalRoleKey(roleName(role));
    if (!canonicalKey.startsWith("organization_")) continue;
    const potentialPermissions = targetPotentialPermissions(canonicalKey);
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
  const policyVersion = await entitlementRepository.getPolicyVersion(organizationId);
  const rows = [];
  for (const role of roles) {
    const id = roleId(role);
    if (!id) continue;
    const canonicalKey = canonicalRoleKey(roleName(role));
    if (!canonicalKey.startsWith("organization_")) continue;
    const executable = executablePermissions(canonicalKey);
    for (const permissionId of targetPotentialPermissions(canonicalKey)) {
      const definition = permissionsByName[permissionId];
      if (!definition || definition.surface !== "organization" || definition.status === "deprecated" || permissionId.startsWith("owner.")) continue;
      const presentation = presentationFor(definition);
      const ceiling = await entitlementRepository.getLimit({ organizationId, logtoRoleId: id, permission: permissionId });
      const activation = await entitlementRepository.getActivation({ organizationId, logtoRoleId: id, permission: permissionId });
      const isExecutable = executable.has(permissionId) && definition.status === "active";
      const runtimeAvailable = isExecutable;
      const ownerAllowed = ceiling?.allowed === true;
      const tenantEnabled = activation?.enabled === true;
      const effective = isExecutable && runtimeAvailable && ownerAllowed && tenantEnabled;
      const controlState = !isExecutable ? "not_executable" : !runtimeAvailable ? "runtime_unavailable" : ceiling?.locked === true ? "globally_locked" : "editable";
      rows.push({
        permissionId,
        roleId: id,
        roleKey: canonicalKey,
        permission: permissionId,
        groupKey: presentation.groupKey,
        groupLabel: presentation.groupLabel,
        groupOrder: presentation.groupOrder,
        label: presentation.label,
        description: presentation.description,
        order: presentation.order,
        enabled: ownerAllowed,
        canChange: controlState === "editable",
        controlState,
        reasonCode: effective ? null : controlState,
        canonical: true,
        rolePotential: true,
        catalogLifecycle: definition.status === "planned" ? "planned" : "active",
        executable: isExecutable,
        runtimeAvailable,
        ownerAllowed,
        tenantEnabled,
        effective,
        policyVersion: String(policyVersion),
        reason: { code: effective ? "allowed" : controlState, sourceVersions: { policyVersion: String(policyVersion), ceilingVersion: String(policyVersion), activationVersion: String(policyVersion), catalogVersion: "2026-07-civitas10-target-role-potential-v1" } },
      });
    }
  }
  return rows.sort((a, b) => a.roleId.localeCompare(b.roleId) || a.groupOrder - b.groupOrder || a.order - b.order || a.permissionId.localeCompare(b.permissionId));
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

module.exports = { entitlementRepository, runtimeAuditEvents, runtimeOutboxEvents, runtimeCacheInvalidations, authorizationFreshnessService, buildRolesGovernanceSlice, updateOwnerCeilings, updateTenantActivations, roleMapFromRoles, canonicalRoleKey };
