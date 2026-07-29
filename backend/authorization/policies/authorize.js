"use strict";

const { catalogHash, permissionsByName, roleModel, globalRolePermissions, organizationRolePermissions } = require("../../../core/authz");
const { buildPolicyContext } = require("./policyContext");
const { POLICY_REASON_CODES } = require("./reasonCodes");
const { createDefaultPolicyRegistry } = require("./defaultRegistry");
const { sanitizeMetadata } = require("./policyResult");


const CANONICAL_POLICIES_BY_SURFACE = Object.freeze({
  owner: Object.freeze(["authorization-snapshot-current"]),
  organization: Object.freeze(["same-organization", "membership-required", "org-role-entitlement-enabled", "authorization-snapshot-current", "authorization-data-scope-valid"]),
  tenant: Object.freeze(["same-organization", "membership-required", "org-role-entitlement-enabled", "authorization-snapshot-current", "authorization-data-scope-valid"]),
  self: Object.freeze(["authorization-snapshot-current"]),
});
function deriveAuthorizationPlan(context) {
  const canonical = CANONICAL_POLICIES_BY_SURFACE[context.request.surface] || Object.freeze([]);
  return Object.freeze([...new Set([...canonical, ...context.authorization.requiredPolicies])]);
}
function rolePotentialForSurface(surface) {
  return surface === "owner" ? globalRolePermissions : organizationRolePermissions;
}
function validateRolePotential(context) {
  if (context.request.surface === "self") return null;
  const potentials = rolePotentialForSurface(context.request.surface);
  if (!context.rolePaths.length) return POLICY_REASON_CODES.ROLE_PATH_MISSING;
  let sawKnownRole = false;
  let sawPermission = false;
  for (const path of context.rolePaths) {
    const permissions = potentials[path.logtoRoleId];
    if (!permissions) { path.rolePotentialDecision = { allowed: false, reasonCode: POLICY_REASON_CODES.ORGANIZATION_ROLE_UNKNOWN }; continue; }
    sawKnownRole = true;
    const allowed = permissions.includes(context.authorization.permission);
    path.rolePotentialDecision = { allowed, reasonCode: allowed ? POLICY_REASON_CODES.AUTHORIZATION_ALLOWED : POLICY_REASON_CODES.ROLE_PERMISSION_MISSING };
    if (allowed) sawPermission = true;
  }
  if (!sawKnownRole) return context.request.surface === "owner" ? POLICY_REASON_CODES.TARGET_ROLE_UNKNOWN : POLICY_REASON_CODES.ORGANIZATION_ROLE_UNKNOWN;
  if (!sawPermission) return POLICY_REASON_CODES.ROLE_PERMISSION_MISSING;
  return null;
}

function decisionProvenance(context) {
  return Object.freeze({
    catalogHash,
    roleModelVersion: roleModel._generated?.roleModelVersion || roleModel.roleModelVersion,
    snapshotProvenance: Object.freeze({
      snapshotVersion: context.authorization.snapshotVersion || "unspecified",
      policyVersion: context.authorization.policyVersion,
      catalogHash,
      roleModelVersion: roleModel._generated?.roleModelVersion || roleModel.roleModelVersion,
    }),
  });
}
function availabilitySummary(context) {
  if (!context.moduleAvailabilityDecision) return undefined;
  const d = context.moduleAvailabilityDecision;
  return { state: d.state, executable: d.executable, readOnly: d.readOnly, reasonCode: d.reasonCode, moduleVersion: d.moduleVersion, bindingVersion: d.bindingVersion, compatibilityVersion: d.compatibilityVersion, healthSnapshotVersion: d.healthSnapshotVersion, availabilityDecisionId: d.decisionId, availabilityVersion: d.schemaVersion };
}
function denyDecision(context, reasonCode, extra = {}) {
  return Object.freeze({ allowed: false, decisionId: context.decisionId, permission: context.authorization.permission, actionId: context.authorization.actionId, surface: context.request.surface, organizationId: context.principal.organizationId || undefined, evaluatedRolePaths: sanitizeRolePaths(context.rolePaths), policyVersion: context.authorization.policyVersion, authorizationSnapshotVersion: context.authorization.snapshotVersion || context.authorization.policyVersion || 'unspecified', moduleAvailability: availabilitySummary(context), reasonCode, ...decisionProvenance(context), safeMetadata: sanitizeMetadata(extra) });
}
function allowDecision(context, matchedRolePathId) {
  return Object.freeze({ allowed: true, decisionId: context.decisionId, permission: context.authorization.permission, actionId: context.authorization.actionId, surface: context.request.surface, organizationId: context.principal.organizationId || undefined, matchedRolePathId, evaluatedRolePaths: sanitizeRolePaths(context.rolePaths), policyVersion: context.authorization.policyVersion, authorizationSnapshotVersion: context.authorization.snapshotVersion || context.authorization.policyVersion || 'unspecified', moduleAvailability: availabilitySummary(context), reasonCode: POLICY_REASON_CODES.AUTHORIZATION_ALLOWED, ...decisionProvenance(context), safeMetadata: {} });
}
function sanitizeRolePaths(paths) {
  return (paths || []).map((path) => ({ rolePathId: path.rolePathId, logtoRoleId: path.logtoRoleId, tokenScopePresent: Boolean(path.tokenScopePresent), delegationDecision: path.delegationDecision ? { operation: path.delegationDecision.operation, targetRoleId: path.delegationDecision.targetRoleId, allowed: path.delegationDecision.allowed, reasonCode: path.delegationDecision.reasonCode } : undefined, entitlementDecision: path.entitlementDecision, dataScopeDecision: path.dataScopeDecision, rolePotentialDecision: path.rolePotentialDecision, policyResults: (path.policyResults || []).map((result) => ({ policyId: result.policyId, outcome: result.outcome, reasonCode: result.reasonCode })) }));
}
function surfaceMatches(context) {
  if (context.request.surface === "owner") return context.principal.tokenType === "global" && !context.principal.organizationId;
  if (context.request.surface === "organization") return context.principal.tokenType === "organization" && Boolean(context.principal.organizationId);
  return Boolean(context.principal.subject);
}
function permissionSurfaceMatches(permission, requestSurface) {
  if (requestSurface === "owner") return permission.surface === "owner" || permission.surface === "global";
  if (requestSurface === "organization" || requestSurface === "tenant") return permission.surface === "organization" && !permission.name.startsWith("owner.");
  if (requestSurface === "self") return permission.surface === "self" || permission.surface === "account";
  return false;
}
async function resolveModuleAvailability(context, permission) {
  const resolver = context.providers.moduleAvailabilityResolver;
  if (!resolver?.resolve) return null;
  const operation = context.request.operation || context.authorization.actionId || permission.name;
  const capability = context.target?.capability || permission.domain || permission.name.split(".").slice(0,2).join(".");
  const moduleId = context.target?.moduleId || permission.domain || permission.name.split(".")[0];
  const decision = await resolver.resolve({ organizationId: context.request.routeOrganizationId || context.principal.organizationId, moduleId, capabilityId: capability, operationId: operation, executionKind: context.target?.executionKind || 'read' });
  context.moduleAvailabilityDecision = decision;
  if (!decision) return null;
  if (decision.executable === true) return null;
  if (decision.executable === undefined && decision.status === 'active') return null;
  const normalizedAvailabilityReason = decision.reasonCode || (decision.status === 'disabled' ? 'module_disabled' : decision.status === 'suspended' ? 'module_suspended' : decision.status === 'not_installed' ? 'module_not_installed' : decision.status === 'incompatible' ? 'runtime_incompatible' : decision.status === 'unavailable' ? 'runtime_unavailable' : undefined);
  const map = {
    module_not_installed: POLICY_REASON_CODES.MODULE_NOT_INSTALLED,
    module_disabled: POLICY_REASON_CODES.MODULE_DISABLED,
    module_suspended: POLICY_REASON_CODES.MODULE_SUSPENDED,
    capability_not_declared: POLICY_REASON_CODES.CAPABILITY_UNAVAILABLE,
    runtime_incompatible: POLICY_REASON_CODES.RUNTIME_INCOMPATIBLE,
    runtime_unavailable: POLICY_REASON_CODES.RUNTIME_UNAVAILABLE,
  };
  return { reasonCode: map[normalizedAvailabilityReason] || POLICY_REASON_CODES.CAPABILITY_UNAVAILABLE, metadata: { status: decision.state || decision.status, capability: decision.capabilityId || decision.capability, availabilityDecisionId: decision.decisionId } };
}
async function authorize(input) {
  const registry = input.registry || createDefaultPolicyRegistry();
  const context = buildPolicyContext(input);
  context.providers = input.providers || {};
  if (!context.principal.subject) return denyDecision(context, POLICY_REASON_CODES.SURFACE_MISMATCH);
  const requiredCatalogHash = input.catalogHash || input.requiredCatalogHash;
  if (requiredCatalogHash && requiredCatalogHash !== catalogHash) return denyDecision(context, POLICY_REASON_CODES.REGISTRY_CATALOG_MISMATCH, { requiredCatalogHash, catalogHash });
  const permission = permissionsByName[context.authorization.permission];
  if (!permission) return denyDecision(context, POLICY_REASON_CODES.PERMISSION_UNKNOWN);
  const moduleAvailability = await resolveModuleAvailability(context, permission);
  if (moduleAvailability) return denyDecision(context, moduleAvailability.reasonCode, moduleAvailability.metadata);
  if (permission.status !== "active") return denyDecision(context, POLICY_REASON_CODES.PERMISSION_INACTIVE, { status: permission.status });
  if (!permissionSurfaceMatches(permission, context.request.surface)) return denyDecision(context, POLICY_REASON_CODES.CONSUMER_SURFACE_MISMATCH, { permissionSurface: permission.surface });
  if (!surfaceMatches(context)) return denyDecision(context, POLICY_REASON_CODES.SURFACE_MISMATCH);
  if (!context.principal.scopes.has(context.authorization.permission)) return denyDecision(context, POLICY_REASON_CODES.PERMISSION_MISSING);
  const rolePotentialFailure = validateRolePotential(context);
  if (rolePotentialFailure) return denyDecision(context, rolePotentialFailure);
  let matchedRolePathId = context.rolePaths.find((path) => path.rolePotentialDecision?.allowed)?.rolePathId || context.rolePaths[0]?.rolePathId;
  for (const policyId of deriveAuthorizationPlan(context)) {
    const policy = registry.getPolicy(policyId);
    if (!policy) return denyDecision(context, POLICY_REASON_CODES.POLICY_UNKNOWN, { policyId });
    if (!policy.supportedSurfaces.includes(context.request.surface)) return denyDecision(context, POLICY_REASON_CODES.SURFACE_MISMATCH, { policyId });
    try {
      const result = await policy.evaluate(context);
      for (const path of context.rolePaths) path.policyResults.push(result);
      if (result.outcome === "not_applicable" && !policy.allowNotApplicable) return denyDecision(context, result.reasonCode || POLICY_REASON_CODES.POLICY_EVALUATION_FAILED, { policyId });
      if (result.outcome === "deny") return denyDecision(context, result.reasonCode, { policyId });
      if (result.metadata?.rolePathId) matchedRolePathId = result.metadata.rolePathId;
      if (result.metadata?.matchedGrantorRoleId) {
        const matched = context.rolePaths.find((path) => path.logtoRoleId === result.metadata.matchedGrantorRoleId);
        if (matched) matchedRolePathId = matched.rolePathId;
      }
    } catch (error) {
      return denyDecision(context, POLICY_REASON_CODES.POLICY_EVALUATION_FAILED, { policyId });
    }
  }
  if (context.rolePaths.length > 0 && !context.rolePaths.some((path) => path.tokenScopePresent)) return denyDecision(context, POLICY_REASON_CODES.PERMISSION_MISSING);
  return allowDecision(context, matchedRolePathId);
}
module.exports = { authorize, sanitizeRolePaths };
