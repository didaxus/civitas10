"use strict";

const TENANT_ROUTE_PREFIX = "/o/:organizationId";
const ORGANIZATION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function assertSafeOrganizationId(organizationId) {
  const value = String(organizationId || "").trim();
  if (!ORGANIZATION_ID_PATTERN.test(value)) throw new Error("organization_id_invalid");
  if (value.includes("/") || value.includes("\\")) throw new Error("organization_id_slash_injection");
  return value;
}

function normalizeRelativePath(relativePath = "") {
  const value = String(relativePath || "").trim();
  if (value.includes("..") || value.includes("\\")) throw new Error("tenant_relative_path_invalid");
  return value.replace(/^\/+/, "").replace(/\/+/g, "/");
}

function organizationPath(organizationId, relativePath = "") {
  const safeOrganizationId = assertSafeOrganizationId(organizationId);
  const normalized = normalizeRelativePath(relativePath);
  return `/o/${encodeURIComponent(safeOrganizationId)}${normalized ? `/${normalized}` : ""}`;
}

const TENANT_ROUTE_INVENTORY = Object.freeze([
  Object.freeze({ routeId: "documents.read", method: "GET", currentPath: "/documents", canonicalPath: "/o/:organizationId/documents", surface: "organization", currentMiddleware: "requireOrganizationAccess + requireOrg + requirePermission + requireAuthorization", requiredPermission: "org.documents.read", requiredPolicies: Object.freeze(["same-organization", "membership-required"]), legacyBehavior: "redirect", status: "canonical-mounted" }),
  Object.freeze({ routeId: "documents.create", method: "POST", currentPath: "/documents", canonicalPath: "/o/:organizationId/documents", surface: "organization", currentMiddleware: "requireOrganizationAccess + requireOrg + requirePermission + requireAuthorization", requiredPermission: "org.documents.create", requiredPolicies: Object.freeze(["same-organization", "membership-required", "critical-operation-audited"]), legacyBehavior: "reject", status: "canonical-mounted" }),
  Object.freeze({ routeId: "owner.organizations.operational_state", method: "GET", currentPath: "/owner/organizations/:organizationId/operational-state", canonicalPath: "/owner/organizations/:organizationId/operational-state", surface: "owner", currentMiddleware: "requireGlobalAccess + requireGlobalOwner", requiredPermission: "owner.runtime.read", requiredPolicies: Object.freeze([]), legacyBehavior: "none", status: "owner-surface" }),
  Object.freeze({ routeId: "identity.federation.providers.read", method: "GET", currentPath: "/api/v1/o/:organizationId/identity/federation/providers", canonicalPath: "/api/v1/o/:organizationId/identity/federation/providers", surface: "organization", currentMiddleware: "requireOrganizationAccess + requireOrg + requirePermission", requiredPermission: "org.documents.read", requiredPolicies: Object.freeze(["same-organization"]), legacyBehavior: "none", status: "canonical-mounted" }),
  Object.freeze({ routeId: "identity.federation.providers.update", method: "PUT", currentPath: "/api/v1/o/:organizationId/identity/federation/providers/:providerId", canonicalPath: "/api/v1/o/:organizationId/identity/federation/providers/:providerId", surface: "organization", currentMiddleware: "requireOrganizationAccess + requireOrg + requirePermission + If-Match", requiredPermission: "org.documents.create", requiredPolicies: Object.freeze(["same-organization", "organization_admin"]), legacyBehavior: "none", status: "canonical-mounted" }),
  Object.freeze({ routeId: "identity.federation.provider_state_decisions", method: "POST", currentPath: "/api/v1/o/:organizationId/identity/federation/providers/:providerId/state-decisions", canonicalPath: "/api/v1/o/:organizationId/identity/federation/providers/:providerId/state-decisions", surface: "organization", currentMiddleware: "requireOrganizationAccess + requireOrg + requirePermission + Idempotency-Key + If-Match", requiredPermission: "org.documents.create", requiredPolicies: Object.freeze(["same-organization", "organization_admin", "idempotency-required"]), legacyBehavior: "none", status: "canonical-mounted" }),
  Object.freeze({ routeId: "owner.identity.federation.providers.read", method: "GET", currentPath: "/api/v1/owner/organizations/:organizationId/identity/federation/providers", canonicalPath: "/api/v1/owner/organizations/:organizationId/identity/federation/providers", surface: "owner", currentMiddleware: "requireGlobalAccess + requireGlobalOwner", requiredPermission: "owner.runtime.read", requiredPolicies: Object.freeze([]), legacyBehavior: "none", status: "owner-surface" }),
  Object.freeze({ routeId: "owner.identity.federation.provider_state_decisions", method: "POST", currentPath: "/api/v1/owner/organizations/:organizationId/identity/federation/providers/:providerId/state-decisions", canonicalPath: "/api/v1/owner/organizations/:organizationId/identity/federation/providers/:providerId/state-decisions", surface: "owner", currentMiddleware: "requireGlobalAccess + requireGlobalOwner + Idempotency-Key + If-Match", requiredPermission: "owner.runtime.operations.execute", requiredPolicies: Object.freeze(["idempotency-required"]), legacyBehavior: "none", status: "owner-surface" }),
]);

module.exports = { TENANT_ROUTE_PREFIX, ORGANIZATION_ID_PATTERN, TENANT_ROUTE_INVENTORY, assertSafeOrganizationId, normalizeRelativePath, organizationPath };
