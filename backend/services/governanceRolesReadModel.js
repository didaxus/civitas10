"use strict";

const crypto = require("node:crypto");
const { permissionsByName, rolePermissionAssignments, organizationRolePotentials, catalogHash } = require("../../core/authz");
const { createInMemoryEntitlementRepository } = require("../authorization/entitlements/entitlementRepository");
const { createEntitlementService } = require("../authorization/entitlements/entitlementService");
const { createAuthorizationFreshnessService } = require("../authorization/runtime/authorizationFreshnessService");

const GOVERNANCE_ROLES_CONTRACT_VERSION = "2026-07-civitas10-governance-roles-v1";
const REASON = Object.freeze({
  NOT_EXECUTABLE: "permission_not_executable",
  RUNTIME_UNAVAILABLE: "owning_operation_not_mounted",
  OWNER_DENIED: "owner_ceiling_not_authorized",
  OWNER_LOCKED: "owner_ceiling_locked",
  TENANT_DISABLED: "tenant_activation_disabled",
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
function targetPotentialPermissions(canonicalKey) {
  const potential = rolePotentialByKey().get(canonicalKey);
  return Array.isArray(potential?.potentialPermissionIds) ? potential.potentialPermissionIds : [];
}
function executablePermissions(canonicalKey) {
  const potential = rolePotentialByKey().get(canonicalKey);
  return new Set(Array.isArray(potential?.activeExecutableScopeIds) ? potential.activeExecutableScopeIds : (rolePermissionAssignments[canonicalKey] || []));
}
function policyKey(role, permission) { return `${role}\u0000${permission}`; }
function indexPolicyRows(rows = []) { return new Map(rows.map((row) => [policyKey(row.logtoRoleId, row.permissionKey), row])); }
function requirePresentation(permission) {
  const presentation = permission?.presentation;
  if (!presentation) throw new Error(`canonical_presentation_missing:${permission?.name || "unknown"}`);
  for (const key of ["label", "description", "groupKey", "groupLabel"]) if (typeof presentation[key] !== "string" || !presentation[key].trim()) throw new Error(`canonical_presentation_missing:${permission.name}:${key}`);
  for (const key of ["groupOrder", "order"]) if (typeof presentation[key] !== "number") throw new Error(`canonical_presentation_missing:${permission.name}:${key}`);
  return presentation;
}
function createStaticRuntimeAvailabilityResolver({ unavailable = [] } = {}) {
  const blocked = new Set(unavailable);
  return { async resolve({ permissionId, executable }) { if (!executable) return { available: false, reasonCode: "not_executable" }; if (blocked.has(permissionId)) return { available: false, reasonCode: "owning_operation_not_mounted" }; return { available: true, reasonCode: "available" }; } };
}
function reasonFor({ executable, runtimeAvailable, ownerAllowed, tenantEnabled, locked }) {
  if (!executable) return REASON.NOT_EXECUTABLE;
  if (!runtimeAvailable) return REASON.RUNTIME_UNAVAILABLE;
  if (locked) return REASON.OWNER_LOCKED;
  if (!ownerAllowed) return REASON.OWNER_DENIED;
  if (!tenantEnabled) return REASON.TENANT_DISABLED;
  return null;
}
function controlFor({ surface, executable, runtimeAvailable, ownerAllowed, locked }) {
  if (!executable) return { controlState: "not_executable", canChange: false };
  if (!runtimeAvailable) return { controlState: "runtime_unavailable", canChange: false };
  if (surface === "tenant" && !ownerAllowed) return { controlState: "blocked_by_owner", canChange: false };
  if (locked) return { controlState: "globally_locked", canChange: false };
  return { controlState: "editable", canChange: true };
}

async function listRoleView({ roles = [], members = [], memberRolesByUserId = new Map(), organizationId, repository }) {
  const [limits, activations] = await Promise.all([repository.listLimits({ organizationId }), repository.listActivations({ organizationId })]);
  const limitsByRole = new Map();
  const activationsByRole = new Map();
  for (const limit of limits) if (limit.allowed === true) limitsByRole.set(limit.logtoRoleId, (limitsByRole.get(limit.logtoRoleId) || 0) + 1);
  for (const activation of activations) if (activation.enabled === true) activationsByRole.set(activation.logtoRoleId, (activationsByRole.get(activation.logtoRoleId) || 0) + 1);
  const byRole = new Map();
  for (const role of roles) {
    const id = roleId(role);
    if (!id) continue;
    const canonicalKey = canonicalRoleKey(roleName(role));
    if (!canonicalKey.startsWith("organization_")) continue;
    const potentialPermissions = targetPotentialPermissions(canonicalKey);
    const executable = executablePermissions(canonicalKey);
    byRole.set(id, { id, canonicalKey, displayName: displayName(roleName(role)), assignedMemberCount: 0, potentialPermissionCount: potentialPermissions.length, executablePermissionCount: executable.size, ownerAuthorizedPermissionCount: limitsByRole.get(id) || 0, tenantEnabledPermissionCount: activationsByRole.get(id) || 0 });
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

async function buildPermissionRows({ organizationId, roles = [], surface = "owner", repository, runtimeAvailabilityResolver = createStaticRuntimeAvailabilityResolver() }) {
  const policyVersion = String(await repository.getPolicyVersion(organizationId));
  const [limits, activations] = await Promise.all([repository.listLimits({ organizationId }), repository.listActivations({ organizationId })]);
  const limitByKey = indexPolicyRows(limits);
  const activationByKey = indexPolicyRows(activations);
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
      const presentation = requirePresentation(definition);
      const limit = limitByKey.get(policyKey(id, permissionId));
      const activation = activationByKey.get(policyKey(id, permissionId));
      const isExecutable = executable.has(permissionId) && definition.status === "active";
      const availability = await runtimeAvailabilityResolver.resolve({ organizationId, roleId: id, canonicalRoleKey: canonicalKey, permissionId, permission: definition, executable: isExecutable });
      const runtimeAvailable = isExecutable && availability.available === true;
      const ownerAllowed = limit?.allowed === true;
      const tenantEnabled = activation?.enabled === true;
      const locked = limit?.locked === true;
      const effective = isExecutable && runtimeAvailable && ownerAllowed && tenantEnabled;
      const { controlState, canChange } = controlFor({ surface, executable: isExecutable, runtimeAvailable, ownerAllowed, locked });
      rows.push({
        permissionId,
        roleId: id,
        groupKey: presentation.groupKey,
        groupLabel: presentation.groupLabel,
        groupOrder: presentation.groupOrder,
        label: presentation.label,
        description: presentation.description,
        order: presentation.order,
        rolePotential: true,
        catalogLifecycle: definition.status === "planned" ? "planned" : "active",
        executable: isExecutable,
        runtimeAvailable,
        ownerAllowed,
        tenantEnabled,
        effective,
        canChange,
        controlState,
        reasonCode: effective ? null : reasonFor({ executable: isExecutable, runtimeAvailable, ownerAllowed, tenantEnabled, locked }),
        policyVersion,
        enabled: surface === "owner" ? ownerAllowed : tenantEnabled,
      });
    }
  }
  return rows.sort((a, b) => a.roleId.localeCompare(b.roleId) || a.groupOrder - b.groupOrder || a.order - b.order || a.permissionId.localeCompare(b.permissionId));
}

async function buildMemberView({ members = [], memberRolesByUserId = new Map() }) {
  return members.map((user) => {
    const userId = user.id || user.userId || user.logtoUserId;
    return { id: userId, display: safeMemberDisplay(user), roleIds: (memberRolesByUserId.get(userId) || []).map(roleId).filter(Boolean), roleAliases: (memberRolesByUserId.get(userId) || []).map((role) => displayName(roleName(role))).filter(Boolean), dataScopeSummary: "not_configured", allowedAssignmentActions: [] };
  });
}

function createInMemoryGovernanceRuntimePorts(repository) {
  const auditEvents = [];
  const outboxEvents = [];
  const cacheInvalidations = [];
  return {
    auditEvents,
    outboxEvents,
    cacheInvalidations,
    runtimeConsistencyPort: { async incrementPolicyVersion({ organizationId }) { return repository.incrementPolicyVersion(organizationId); }, async enqueueOutbox(event) { outboxEvents.push({ ...event, createdAt: new Date().toISOString() }); return event; }, async audit(event) { auditEvents.push({ ...event, createdAt: new Date().toISOString() }); return event; } },
    authorizationFreshnessService: createAuthorizationFreshnessService({ versionService: { increment: async ({ organizationId }) => ({ policyVersion: await repository.incrementPolicyVersion(organizationId) }), getVersion: async (organizationId) => ({ policyVersion: await repository.getPolicyVersion(organizationId) }) }, cachePort: { async invalidateOrganization(event) { cacheInvalidations.push({ ...event, createdAt: new Date().toISOString() }); } }, eventPort: { async publish(event) { outboxEvents.push({ ...event, createdAt: new Date().toISOString() }); } } }),
  };
}

function createGovernanceRolesService({ entitlementRepository, auditPort, outboxPort, authorizationFreshnessService, runtimeAvailabilityResolver = createStaticRuntimeAvailabilityResolver() } = {}) {
  if (!entitlementRepository) throw new Error("entitlementRepository_required");
  const fallbackPorts = (!auditPort || !outboxPort || !authorizationFreshnessService) ? createInMemoryGovernanceRuntimePorts(entitlementRepository) : null;
  const runtimeConsistencyPort = {
    async incrementPolicyVersion({ organizationId }) { return entitlementRepository.incrementPolicyVersion(organizationId); },
    async enqueueOutbox(event) { return (outboxPort || fallbackPorts.runtimeConsistencyPort).enqueueOutbox(event); },
    async audit(event) { return (auditPort || fallbackPorts.runtimeConsistencyPort).audit(event); },
  };
  const freshness = authorizationFreshnessService || fallbackPorts.authorizationFreshnessService;
  return {
    repository: entitlementRepository,
    auditEvents: fallbackPorts?.auditEvents || [],
    outboxEvents: fallbackPorts?.outboxEvents || [],
    cacheInvalidations: fallbackPorts?.cacheInvalidations || [],
    authorizationFreshnessService: freshness,
    async buildRolesGovernanceSlice({ organizationId, roles = [], members = [], memberRolesByUserId = new Map(), surface = "owner" }) {
      const [rolesView, membersView, permissionMatrix, policyVersion] = await Promise.all([
        listRoleView({ roles, members, memberRolesByUserId, organizationId, repository: entitlementRepository }),
        buildMemberView({ members, memberRolesByUserId }),
        buildPermissionRows({ organizationId, roles, surface, repository: entitlementRepository, runtimeAvailabilityResolver }),
        entitlementRepository.getPolicyVersion(organizationId),
      ]);
      return { contractVersion: GOVERNANCE_ROLES_CONTRACT_VERSION, policyVersion: String(policyVersion), roles: rolesView, members: membersView, permissionMatrix, auditEvents: [], outboxEvents: [] };
    },
    updateOwnerCeilings({ organizationId, actorLogtoUserId, changes, expectedPolicyVersion, roleIdToName, reason, decisionId }) {
      return createEntitlementService({ repository: entitlementRepository, runtimeConsistencyPort, authorizationFreshnessService: freshness, roleIdToName }).upsertOwnerLimits({ organizationId, actorLogtoUserId, changes, expectedPolicyVersion, reason, decisionId });
    },
    updateTenantActivations({ organizationId, actorLogtoUserId, changes, expectedPolicyVersion, roleIdToName, reason, decisionId }) {
      return createEntitlementService({ repository: entitlementRepository, runtimeConsistencyPort, authorizationFreshnessService: freshness, roleIdToName }).upsertTenantActivations({ organizationId, actorLogtoUserId, changes, expectedPolicyVersion, reason, decisionId });
    },
  };
}

function createPostgresEntitlementRepository({ pool }) {
  if (!pool) throw new Error("pool_required");
  const q = (text, params) => pool.query(text, params);
  const mapLimit = (r) => r && ({ id: r.id, logtoOrganizationId: r.logto_organization_id, logtoRoleId: r.logto_role_id, roleNameCache: r.role_name_cache, permissionKey: r.permission_key, allowed: r.allowed, locked: r.locked, policyVersion: Number(r.policy_version), setByLogtoUserId: r.set_by_logto_user_id, reason: r.reason, createdAt: r.created_at?.toISOString?.() || r.created_at, updatedAt: r.updated_at?.toISOString?.() || r.updated_at });
  const mapActivation = (r) => r && ({ id: r.id, logtoOrganizationId: r.logto_organization_id, logtoRoleId: r.logto_role_id, roleNameCache: r.role_name_cache, permissionKey: r.permission_key, entitlementLimitId: r.entitlement_limit_id, enabled: r.enabled, policyVersion: Number(r.policy_version), setByLogtoUserId: r.set_by_logto_user_id, reason: r.reason, createdAt: r.created_at?.toISOString?.() || r.created_at, updatedAt: r.updated_at?.toISOString?.() || r.updated_at });
  return {
    async transaction(fn) { const client = await pool.connect(); try { await client.query("begin"); const scoped = createPostgresEntitlementRepository({ pool: { query: (text, params) => client.query(text, params), connect: () => ({ query: (text, params) => client.query(text, params), release() {} }) } }); const result = await fn(scoped); await client.query("commit"); return result; } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); } },
    async getPolicyVersion(organizationId) { const result = await q("insert into authorization_policy_versions(logto_organization_id, catalog_version, reason) values($1,$2,'governance_read') on conflict(logto_organization_id) do nothing returning version", [organizationId, catalogHash]); if (result.rows[0]) return Number(result.rows[0].version); const row = await q("select version from authorization_policy_versions where logto_organization_id=$1", [organizationId]); return Number(row.rows[0]?.version || 1); },
    async setPolicyVersion(organizationId, version) { await q("insert into authorization_policy_versions(logto_organization_id, version, catalog_version, reason) values($1,$2,$3,'governance_set') on conflict(logto_organization_id) do update set version=excluded.version, catalog_version=excluded.catalog_version, updated_at=now()", [organizationId, version, catalogHash]); return Number(version); },
    async incrementPolicyVersion(organizationId) { const row = await q("insert into authorization_policy_versions(logto_organization_id, version, catalog_version, reason) values($1,2,$2,'governance_increment') on conflict(logto_organization_id) do update set version=authorization_policy_versions.version+1, catalog_version=excluded.catalog_version, updated_at=now() returning version", [organizationId, catalogHash]); return Number(row.rows[0].version); },
    async getLimit(input) { const rows = await this.listLimits({ organizationId: input.organizationId }); return rows.find((row) => row.logtoRoleId === input.logtoRoleId && row.permissionKey === input.permission) || null; },
    async getActivation(input) { const rows = await this.listActivations({ organizationId: input.organizationId }); return rows.find((row) => row.logtoRoleId === input.logtoRoleId && row.permissionKey === input.permission) || null; },
    async listLimits({ organizationId }) { const result = await q("select * from org_role_entitlement_limits where logto_organization_id=$1", [organizationId]); return result.rows.map(mapLimit); },
    async listActivations({ organizationId }) { const result = await q("select * from org_role_permission_activations where logto_organization_id=$1", [organizationId]); return result.rows.map(mapActivation); },
    async upsertLimit(row) { const result = await q(`insert into org_role_entitlement_limits(logto_organization_id,logto_role_id,role_name_cache,permission_key,allowed,locked,policy_version,set_by_logto_user_id,reason) values($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict(logto_organization_id,logto_role_id,permission_key) do update set role_name_cache=excluded.role_name_cache, allowed=excluded.allowed, locked=excluded.locked, policy_version=excluded.policy_version, set_by_logto_user_id=excluded.set_by_logto_user_id, reason=excluded.reason, updated_at=now() returning *`, [row.logtoOrganizationId, row.logtoRoleId, row.roleNameCache || null, row.permissionKey, row.allowed, row.locked || false, row.policyVersion, row.setByLogtoUserId, row.reason || null]); return mapLimit(result.rows[0]); },
    async upsertActivation(row) { const result = await q(`insert into org_role_permission_activations(logto_organization_id,logto_role_id,role_name_cache,permission_key,entitlement_limit_id,enabled,policy_version,set_by_logto_user_id,reason) values($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict(logto_organization_id,logto_role_id,permission_key) do update set role_name_cache=excluded.role_name_cache, entitlement_limit_id=excluded.entitlement_limit_id, enabled=excluded.enabled, policy_version=excluded.policy_version, set_by_logto_user_id=excluded.set_by_logto_user_id, reason=excluded.reason, updated_at=now() returning *`, [row.logtoOrganizationId, row.logtoRoleId, row.roleNameCache || null, row.permissionKey, row.entitlementLimitId, row.enabled, row.policyVersion, row.setByLogtoUserId, row.reason || null]); return mapActivation(result.rows[0]); },
    async disableActivation({ organizationId, logtoRoleId, permission, policyVersion }) { const result = await q("update org_role_permission_activations set enabled=false, policy_version=$4, updated_at=now() where logto_organization_id=$1 and logto_role_id=$2 and permission_key=$3 returning *", [organizationId, logtoRoleId, permission, policyVersion]); return mapActivation(result.rows[0]); },
  };
}

let defaultService;
function getDefaultGovernanceRolesService() {
  if (!defaultService) {
    const repository = process.env.DATABASE_URL ? createPostgresEntitlementRepository({ pool: require("../lib/db").getPool() }) : createInMemoryEntitlementRepository();
    defaultService = createGovernanceRolesService({ entitlementRepository: repository });
  }
  return defaultService;
}
function roleMapFromRoles(roles = []) { return Object.fromEntries(roles.map((role) => [roleId(role), canonicalRoleKey(roleName(role))]).filter(([id]) => id)); }
async function buildRolesGovernanceSlice(input) { return getDefaultGovernanceRolesService().buildRolesGovernanceSlice(input); }
async function updateOwnerCeilings(input) { return getDefaultGovernanceRolesService().updateOwnerCeilings(input); }
async function updateTenantActivations(input) { return getDefaultGovernanceRolesService().updateTenantActivations(input); }
const entitlementRepository = getDefaultGovernanceRolesService().repository;
const authorizationFreshnessService = getDefaultGovernanceRolesService().authorizationFreshnessService;

module.exports = { GOVERNANCE_ROLES_CONTRACT_VERSION, REASON, createStaticRuntimeAvailabilityResolver, createPostgresEntitlementRepository, createGovernanceRolesService, buildPermissionRows, buildRolesGovernanceSlice, updateOwnerCeilings, updateTenantActivations, roleMapFromRoles, canonicalRoleKey, getDefaultGovernanceRolesService, entitlementRepository, authorizationFreshnessService };
