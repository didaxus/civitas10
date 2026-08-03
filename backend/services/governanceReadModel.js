"use strict";

const { GOVERNANCE_READ_MODEL_CONTRACT_VERSION, GOVERNANCE_OPERATION_REGISTRY_VERSION, governanceOperationRegistry, moduleInventory } = require("../../core/governance/operation-registry.cjs");

const { buildStructureGovernanceSlice } = require("./governanceStructureReadModel");
const { buildAliasesNavigationPolicy, listGovernanceAuditEvents } = require("./governanceOperationsReadModel");

const MODULE_KEYS = Object.freeze(["overview", "identity-provisioning", "permissions", "members", "taxonomy", "units", "data-scope", "aliases-navigation", "access-preview", "audit"]);
const TENANT_MODULES = Object.freeze(new Set(["identity-provisioning", "permissions", "members", "data-scope", "taxonomy", "units", "aliases-navigation", "access-preview"]));
const OWNER_MODULES = Object.freeze(new Set(["overview", "identity-provisioning", "permissions", "taxonomy", "units", "data-scope", "aliases-navigation", "access-preview", "audit"]));

function isoNow() { return new Date().toISOString(); }
function safeString(value, fallback = null) { return typeof value === "string" && value.trim() ? value.trim() : fallback; }
function organizationName(organization = {}) { return safeString(organization.name) || safeString(organization.nameCache) || safeString(organization.displayName); }

function buildVersions({ stale = false, drift = false } = {}) {
  const runtimeStatus = drift ? "drift" : stale ? "stale" : "current";
  return {
    catalogVersion: "2026-07-civitas10-active-permissions-v1",
    ceilingVersion: "not_mounted",
    activationVersion: "not_mounted",
    taxonomyVersion: "2026-07-civitas10-taxonomy-read-v1",
    unitsVersion: "2026-07-civitas10-units-read-v1",
    dataScopeVersion: "2026-07-civitas10-data-scope-read-v1",
    visualVersion: "2026-07-civitas10-visual-navigation-v1",
    policyVersion: "2026-07-civitas10-policy-runtime-v1",
    readModelVersion: GOVERNANCE_READ_MODEL_CONTRACT_VERSION,
    operationRegistryVersion: GOVERNANCE_OPERATION_REGISTRY_VERSION,
    runtimeStatus,
  };
}

function moduleStatus({ key, surface, versions }) {
  if (key === "members" && surface === "owner") return null;
  const supported = surface === "owner" ? OWNER_MODULES.has(key) : TENANT_MODULES.has(key);
  if (!supported) return null;
  const inventory = moduleInventory.find((item) => item.module === key);
  if (!inventory) return { status: "error", reason: "module_inventory_missing", dependencyVersions: versions };
  if (versions.runtimeStatus === "stale") return { status: "stale", reason: "authorization_snapshot_stale", dependencyVersions: versions };
  if (versions.runtimeStatus === "drift") return { status: "stale", reason: "authorization_version_drift", dependencyVersions: versions };
  return { status: inventory.status, reason: inventory.reason, dependencyVersions: versions };
}

function buildModules({ surface, versions }) {
  return Object.fromEntries(MODULE_KEYS.map((key) => [key, moduleStatus({ key, surface, versions })]).filter(([, value]) => value));
}


function roleCatalogDiagnostics({ roles = [], aliasesNavigation }) {
  const diagnostics = [];
  const roleIds = new Set();
  const canonicalCounts = new Map();
  for (const role of roles) {
    if (role?.id) roleIds.add(role.id);
    if (role?.canonicalKey) canonicalCounts.set(role.canonicalKey, (canonicalCounts.get(role.canonicalKey) || 0) + 1);
    if (!role?.canonicalKey || !String(role.canonicalKey).startsWith("organization_")) diagnostics.push({ code: "logto_role_catalog_mapping_drift", severity: "warning", message: `Logto role ${role?.id || "unknown"} could not be mapped to a Civitas organization role key.` });
  }
  for (const [canonicalKey, count] of canonicalCounts.entries()) if (count > 1) diagnostics.push({ code: "logto_role_duplicate_canonical_key", severity: "warning", message: `Multiple Logto roles resolve to ${canonicalKey}.` });
  for (const alias of aliasesNavigation.aliases || []) if (!roleIds.has(alias.roleId)) diagnostics.push({ code: "role_alias_orphaned", severity: "warning", message: `Alias references role ${alias.roleId}, but Logto did not return that role for this organization.` });
  return diagnostics;
}

function buildIdentityProvisioningSummary({ status = "not_configured" } = {}) {
  return { status, connectionId: null, protocol: null, providerKind: null, claimsContractVersion: 0, mappingVersion: 0, provisioningPolicyVersion: 0, lastValidatedAt: null, lastSuccessfulLoginAt: null, credentialExpiresAt: null, latestReconciliationRunId: null, latestReconciliationStatus: null, driftItemCount: status === "reconciliation_required" ? 1 : 0, reason: status === "not_configured" ? "identity_federation_connection_missing" : "fixture_status" };
}

async function buildGovernanceReadModel({ governanceRolesService, organization, organizationId, surface, stale = false, drift = false, roles = [], members = [], memberRolesByUserId = new Map() } = {}) {
  if (!governanceRolesService) throw new Error("governance_roles_service_required");
  if (!["owner", "tenant"].includes(surface)) { const error = new Error("Invalid governance surface."); error.status = 500; error.code = "GOVERNANCE_SURFACE_INVALID"; throw error; }
  const versions = buildVersions({ stale, drift });
  const modules = buildModules({ surface, versions });
  const logtoOrganizationId = organizationId || safeString(organization?.id) || safeString(organization?.logtoOrganizationId);
  const rolesSlice = await governanceRolesService.buildRolesGovernanceSlice({ organizationId: logtoOrganizationId, roles, members, memberRolesByUserId, surface });
  versions.policyVersion = rolesSlice.policyVersion;
  const structureSlice = await buildStructureGovernanceSlice(logtoOrganizationId);
  const aliasesNavigation = buildAliasesNavigationPolicy(logtoOrganizationId);
  const diagnostics = roleCatalogDiagnostics({ roles: rolesSlice.roles, aliasesNavigation });
  return {
    contractVersion: GOVERNANCE_READ_MODEL_CONTRACT_VERSION,
    generatedAt: isoNow(),
    organization: { logtoOrganizationId, name: organizationName(organization), surface },
    organizationId: logtoOrganizationId,
    organizationName: organizationName(organization),
    surface,
    versions,
    runtimeStatus: versions.runtimeStatus,
    modules,
    operationRegistry: { registryVersion: GOVERNANCE_OPERATION_REGISTRY_VERSION, operations: governanceOperationRegistry },
    moduleInventory,
    identityProvisioning: buildIdentityProvisioningSummary(),
    summary: {
      identityProvisioningStates: ["not_configured", "active", "degraded", "suspended", "credentials_expiring", "reconciliation_required"],
      status: versions.runtimeStatus === "current" ? "available" : versions.runtimeStatus,
      activeModules: Object.values(modules).filter((item) => item.status === "active").length,
      plannedModules: Object.values(modules).filter((item) => item.status === "planned").length,
      unavailableModules: Object.values(modules).filter((item) => item.status === "unavailable").length,
      reason: "aggregate_projection_only",
    },
    roles: rolesSlice.roles,
    members: rolesSlice.members,
    permissionMatrix: rolesSlice.permissionMatrix,
    taxonomy: structureSlice.taxonomy.items,
    units: structureSlice.units.items,
    dataScopes: structureSlice.dataScopes.items,
    aliasesNavigation,
    accessPreviews: [],
    auditSummary: { totalEvents: (rolesSlice.auditEvents || []).length + structureSlice.auditEvents.length + listGovernanceAuditEvents({ organizationId: logtoOrganizationId }).length, latestEventAt: rolesSlice.auditEvents?.at(-1)?.createdAt || structureSlice.auditEvents.at(-1)?.createdAt || listGovernanceAuditEvents({ organizationId: logtoOrganizationId })[0]?.createdAt || null, redaction: "actor_subjects_before_after_tokens_and_connector_secrets_redacted" },
    auditEvents: [
      ...[...(rolesSlice.auditEvents || []), ...structureSlice.auditEvents].map((event, index) => ({ id: `audit_${index + 1}`, actorId: event.actorLogtoUserId ? "redacted_actor" : "system", organizationId: logtoOrganizationId, target: event.targetType || event.permission || "governance", action: event.action, reason: event.reason || "governance_mutation", contractVersion: GOVERNANCE_READ_MODEL_CONTRACT_VERSION, createdAt: event.createdAt })),
      ...listGovernanceAuditEvents({ organizationId: logtoOrganizationId }),
    ],
    diagnostics: [
      { code: "governance_read_model_projection", severity: "info", message: "Aggregate read model is mounted; feature writes remain in owning APIs." },
      ...(versions.runtimeStatus === "current" ? [] : [{ code: versions.runtimeStatus === "drift" ? "authorization_version_drift" : "authorization_snapshot_stale", severity: "warning", message: "Authorization runtime is not current." }]),
      ...diagnostics,
    ],
  };
}

function assertTenantRouteMatchesContext(req) {
  const routeOrganizationId = req.params.organizationId;
  const tokenOrganizationClaim = req.user?.organization_id || req.user?.claims?.organization_id || null;
  if (!tokenOrganizationClaim || tokenOrganizationClaim !== routeOrganizationId) {
    const error = new Error("Tenant governance route organization does not match the verified tenant context.");
    error.status = 403;
    error.code = "TENANT_ORGANIZATION_MISMATCH";
    throw error;
  }
}

module.exports = { GOVERNANCE_READ_MODEL_CONTRACT_VERSION, GOVERNANCE_OPERATION_REGISTRY_VERSION, governanceOperationRegistry, moduleInventory, buildGovernanceReadModel, assertTenantRouteMatchesContext };
