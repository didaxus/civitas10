"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { organizationPath, TENANT_ROUTE_INVENTORY } = require("../routes/tenantRoutes");
const { authorize } = require("../authorization/policies");
const { createEntitlementPolicyProvider, createInMemoryEntitlementRepository, createEntitlementService, evaluateOrganizationEntitlement, buildAuthorizationContext, ENTITLEMENT_REASON_CODES } = require("../authorization/entitlements");

const roleIdToName = { organization_admin: "organization_admin", organization_director: "organization_director", role_admin: "organization_admin", role_director: "organization_director" };
function fakeRes() { return { statusCode: 200, body: null, headers: {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, set(name, value) { this.headers[name] = value; return this; }, redirect(code, location) { this.statusCode = code; this.headers.Location = location; return this; } }; }
function runtimePort(events = []) { return { async incrementPolicyVersion(event) { events.push({ type: "version", ...event }); return events.filter((e) => e.type === "version").length + 1; }, async enqueueOutbox(event) { events.push({ type: "outbox", ...event }); }, async audit(event) { events.push({ type: "audit", ...event }); } }; }
async function seededRepo() {
  const repository = createInMemoryEntitlementRepository();
  const service = createEntitlementService({ repository, runtimeConsistencyPort: runtimePort(), roleIdToName });
  await service.upsertOwnerLimits({ organizationId: "orgA", expectedPolicyVersion: 1, actorLogtoUserId: "owner", changes: [{ logtoRoleId: "organization_admin", permission: "org.documents.create", allowed: true, locked: false }] });
  await service.upsertTenantActivations({ organizationId: "orgA", expectedPolicyVersion: 2, actorLogtoUserId: "admin", changes: [{ logtoRoleId: "organization_admin", permission: "org.documents.create", enabled: true }] });
  return repository;
}

test("organizationPath encodes canonical tenant paths and blocks slash injection", () => {
  assert.equal(organizationPath("org_A-1", "documents"), "/o/org_A-1/documents");
  assert.equal(organizationPath("orgA", "/billing/invoices"), "/o/orgA/billing/invoices");
  assert.throws(() => organizationPath("org/A", "documents"), /organization_id/);
  assert.throws(() => organizationPath("orgA", "../documents"), /tenant_relative_path/);
});

test("tenant route inventory distinguishes canonical tenant and owner routes", () => {
  assert.ok(TENANT_ROUTE_INVENTORY.some((route) => route.canonicalPath === "/o/:organizationId/documents" && route.legacyBehavior === "redirect"));
  assert.ok(TENANT_ROUTE_INVENTORY.some((route) => route.surface === "owner" && route.canonicalPath.startsWith("/owner/organizations/:organizationId")));
});

test("policy surface and same-organization reject owner tokens and org/path mismatches", async () => {
  const ownerDecision = await authorize({ principal: { subject: "owner", tokenType: "global", organizationId: null, scopes: new Set(["lms.groups.read"]), globalRoleIds: ["owner_global"] }, permission: "lms.groups.read", surface: "organization", operation: "read", organizationId: "orgA", policies: [] });
  assert.equal(ownerDecision.allowed, false);
  assert.equal(ownerDecision.reasonCode, "surface_mismatch");
  const mismatchDecision = await authorize({ principal: { subject: "user", tokenType: "organization", organizationId: "orgA", scopes: new Set(["lms.groups.read"]), organizationRoleIds: ["organization_admin"] }, permission: "lms.groups.read", surface: "organization", operation: "read", organizationId: "orgB", policies: ["same-organization"] });
  assert.equal(mismatchDecision.allowed, false);
  assert.equal(mismatchDecision.reasonCode, "organization_route_mismatch");
});

test("entitlement evaluator is deny-by-default and preserves role path provenance", async () => {
  const repository = await seededRepo();
  const allow = await evaluateOrganizationEntitlement({ organizationId: "orgA", subject: "user", tokenScopes: new Set(["org.documents.create"]), rolePaths: [{ rolePathId: "path_admin", logtoRoleId: "organization_admin", tokenScopePresent: true }], permission: "org.documents.create", repository, roleIdToName });
  assert.equal(allow.allowed, true);
  assert.equal(allow.matchedRolePathId, "path_admin");
  const missingScope = await evaluateOrganizationEntitlement({ organizationId: "orgA", subject: "user", tokenScopes: new Set(), rolePaths: [{ rolePathId: "path_admin", logtoRoleId: "organization_admin", tokenScopePresent: false }], permission: "org.documents.create", repository, roleIdToName });
  assert.equal(missingScope.allowed, false);
  assert.equal(missingScope.evaluatedRolePaths[0].reasonCode, ENTITLEMENT_REASON_CODES.TOKEN_SCOPE_MISSING);
  const fragments = await evaluateOrganizationEntitlement({ organizationId: "orgA", subject: "user", tokenScopes: new Set(["org.documents.create"]), rolePaths: [{ rolePathId: "path_director", logtoRoleId: "organization_director", tokenScopePresent: true }, { rolePathId: "path_admin_no_scope", logtoRoleId: "organization_admin", tokenScopePresent: false }], permission: "org.documents.create", repository, roleIdToName });
  assert.equal(fragments.allowed, false);
  assert.deepEqual(fragments.evaluatedRolePaths.map((path) => path.reasonCode), [ENTITLEMENT_REASON_CODES.ROLE_PERMISSION_MISSING, ENTITLEMENT_REASON_CODES.TOKEN_SCOPE_MISSING]);
  const unknownRole = await evaluateOrganizationEntitlement({ organizationId: "orgA", subject: "user", tokenScopes: new Set(["org.documents.create"]), rolePaths: [{ rolePathId: "path_unknown", logtoRoleId: "stale_role_id", tokenScopePresent: true }], permission: "org.documents.create", repository, roleIdToName });
  assert.equal(unknownRole.evaluatedRolePaths[0].reasonCode, ENTITLEMENT_REASON_CODES.ORGANIZATION_ROLE_UNKNOWN);
});

test("tenant activation cannot exceed Owner ceiling and locked ceilings block tenant edits", async () => {
  const events = [];
  const repository = createInMemoryEntitlementRepository();
  const service = createEntitlementService({ repository, runtimeConsistencyPort: runtimePort(events), roleIdToName });
  await service.upsertOwnerLimits({ organizationId: "orgA", expectedPolicyVersion: 1, actorLogtoUserId: "owner", changes: [{ logtoRoleId: "organization_admin", permission: "org.documents.create", allowed: false, locked: false }] });
  await assert.rejects(() => service.upsertTenantActivations({ organizationId: "orgA", expectedPolicyVersion: 2, actorLogtoUserId: "admin", changes: [{ logtoRoleId: "organization_admin", permission: "org.documents.create", enabled: true }] }), /tenant_activation_exceeds_owner_ceiling/);
  await service.upsertOwnerLimits({ organizationId: "orgA", expectedPolicyVersion: 2, actorLogtoUserId: "owner", changes: [{ logtoRoleId: "organization_admin", permission: "org.documents.create", allowed: true, locked: true }] });
  await assert.rejects(() => service.upsertTenantActivations({ organizationId: "orgA", expectedPolicyVersion: 3, actorLogtoUserId: "admin", changes: [{ logtoRoleId: "organization_admin", permission: "org.documents.create", enabled: false }] }), /tenant_activation_locked/);
  assert.ok(repository.outbox.length > 0);
  assert.ok(repository.audits.length > 0);
});

test("Owner revocation immediately disables activation without token refresh", async () => {
  const repository = await seededRepo();
  let decision = await evaluateOrganizationEntitlement({ organizationId: "orgA", subject: "user", tokenScopes: new Set(["org.documents.create"]), rolePaths: [{ rolePathId: "path_admin", logtoRoleId: "organization_admin", tokenScopePresent: true }], permission: "org.documents.create", repository, roleIdToName });
  assert.equal(decision.allowed, true);
  const service = createEntitlementService({ repository, runtimeConsistencyPort: runtimePort(), roleIdToName });
  await service.upsertOwnerLimits({ organizationId: "orgA", expectedPolicyVersion: 3, actorLogtoUserId: "owner", changes: [{ logtoRoleId: "organization_admin", permission: "org.documents.create", allowed: false, locked: false }] });
  decision = await evaluateOrganizationEntitlement({ organizationId: "orgA", subject: "user", tokenScopes: new Set(["org.documents.create"]), rolePaths: [{ rolePathId: "path_admin", logtoRoleId: "organization_admin", tokenScopePresent: true }], permission: "org.documents.create", repository, roleIdToName });
  assert.equal(decision.allowed, false);
  assert.equal(decision.evaluatedRolePaths[0].reasonCode, ENTITLEMENT_REASON_CODES.OWNER_CEILING_DENIED);
});

test("#89 entitlement policy denies cross-tenant before overlay and allows only complete path", async () => {
  const repository = await seededRepo();
  const entitlementProvider = createEntitlementPolicyProvider({ repository, roleIdToName });
  const base = { principal: { subject: "user", tokenType: "organization", organizationId: "orgA", scopes: new Set(["org.documents.create"]), organizationRoleIds: ["organization_admin"] }, permission: "org.documents.create", surface: "organization", operation: "create", organizationId: "orgA", policies: ["same-organization", "org-role-entitlement-enabled"], providers: { entitlementProvider, membershipProvider: { async evaluateMembership() { return { status: "active" }; } }, dataScopeProvider: { async evaluate() { return { allowed: true, status: "valid" }; } } } };
  assert.equal((await authorize(base)).allowed, true);
  const wrongOrg = await authorize({ ...base, organizationId: "orgB" });
  assert.equal(wrongOrg.allowed, false);
  assert.equal(wrongOrg.reasonCode, "organization_route_mismatch");
  const noScope = await authorize({ ...base, principal: { ...base.principal, scopes: new Set() } });
  assert.equal(noScope.allowed, false);
  assert.equal(noScope.reasonCode, "permission_missing");
});

test("authorization context separates token and effective permissions", async () => {
  const repository = await seededRepo();
  const context = await buildAuthorizationContext({ organizationId: "orgA", repository, roleIdToName, principal: { subject: "user", scopes: new Set(["org.documents.create", "org.documents.read"]), organizationRoleIds: ["organization_admin"] }, permissions: ["org.documents.create", "org.documents.read"] });
  assert.deepEqual(context.tokenPermissions, ["org.documents.create", "org.documents.read"]);
  assert.deepEqual(context.effectivePermissions, ["org.documents.create"]);
});

test("domain and JIT provisioning roles remain RBAC candidates without ceilings or activations", async () => {
  const repository = createInMemoryEntitlementRepository();
  const domainProvisioned = await evaluateOrganizationEntitlement({ organizationId: "orgA", subject: "teacher", tokenScopes: new Set(["org.documents.read"]), rolePaths: [{ rolePathId: "domain_jit_teacher", logtoRoleId: "role_teacher", tokenScopePresent: true }], permission: "org.documents.read", repository, roleIdToName: { role_teacher: "organization_teacher" } });
  assert.equal(domainProvisioned.allowed, false);
  assert.equal(domainProvisioned.reasonCode, ENTITLEMENT_REASON_CODES.OWNER_CEILING_MISSING);
  const service = createEntitlementService({ repository, runtimeConsistencyPort: runtimePort(), roleIdToName: { role_teacher: "organization_teacher" } });
  await service.upsertOwnerLimits({ organizationId: "orgA", expectedPolicyVersion: 1, actorLogtoUserId: "owner", changes: [{ logtoRoleId: "role_teacher", permission: "org.documents.read", allowed: true }] });
  const jitWithCeilingOnly = await evaluateOrganizationEntitlement({ organizationId: "orgA", subject: "teacher", tokenScopes: new Set(["org.documents.read"]), rolePaths: [{ rolePathId: "sso_jit_teacher", logtoRoleId: "role_teacher", tokenScopePresent: true }], permission: "org.documents.read", repository, roleIdToName: { role_teacher: "organization_teacher" } });
  assert.equal(jitWithCeilingOnly.allowed, false);
  assert.equal(jitWithCeilingOnly.reasonCode, ENTITLEMENT_REASON_CODES.TENANT_ACTIVATION_MISSING);
});

test("group leader PBAC requires exact ceiling and activation and never grants update potential", async () => {
  const roleMap = { role_group: "organization_groupleader" };
  const repository = createInMemoryEntitlementRepository();
  const noCeiling = await evaluateOrganizationEntitlement({ organizationId: "orgA", subject: "ana", tokenScopes: new Set(["lms.groups.read"]), rolePaths: [{ rolePathId: "group", logtoRoleId: "role_group", tokenScopePresent: true }], permission: "lms.groups.read", repository, roleIdToName: roleMap });
  assert.equal(noCeiling.allowed, false);
  assert.equal(noCeiling.reasonCode, ENTITLEMENT_REASON_CODES.OWNER_CEILING_MISSING);
  const service = createEntitlementService({ repository, runtimeConsistencyPort: runtimePort(), roleIdToName: roleMap });
  await service.upsertOwnerLimits({ organizationId: "orgA", expectedPolicyVersion: 1, actorLogtoUserId: "owner", changes: [{ logtoRoleId: "role_group", permission: "lms.groups.read", allowed: true }] });
  const noActivation = await evaluateOrganizationEntitlement({ organizationId: "orgA", subject: "ana", tokenScopes: new Set(["lms.groups.read"]), rolePaths: [{ rolePathId: "group", logtoRoleId: "role_group", tokenScopePresent: true }], permission: "lms.groups.read", repository, roleIdToName: roleMap });
  assert.equal(noActivation.allowed, false);
  assert.equal(noActivation.reasonCode, ENTITLEMENT_REASON_CODES.TENANT_ACTIVATION_MISSING);
  await service.upsertTenantActivations({ organizationId: "orgA", expectedPolicyVersion: 2, actorLogtoUserId: "admin", changes: [{ logtoRoleId: "role_group", permission: "lms.groups.read", enabled: true }] });
  const allowed = await evaluateOrganizationEntitlement({ organizationId: "orgA", subject: "ana", tokenScopes: new Set(["lms.groups.read"]), rolePaths: [{ rolePathId: "group", logtoRoleId: "role_group", tokenScopePresent: true }], permission: "lms.groups.read", repository, roleIdToName: roleMap });
  assert.equal(allowed.allowed, true);
  const update = await evaluateOrganizationEntitlement({ organizationId: "orgA", subject: "ana", tokenScopes: new Set(["lms.grades.update"]), rolePaths: [{ rolePathId: "group", logtoRoleId: "role_group", tokenScopePresent: true }], permission: "lms.grades.update", repository, roleIdToName: roleMap });
  assert.equal(update.allowed, false);
  assert.equal(update.reasonCode, ENTITLEMENT_REASON_CODES.ROLE_PERMISSION_MISSING);
});

test("bootstrap profile is transactional and idempotent", async () => {
  const { createBootstrapProfileService } = require("../authorization/entitlements");
  const profile = { profileId: "owner-onboarding", version: "1", catalogVersion: "cat-1", ownerCeilings: [{ permission: "lms.groups.read" }], tenantActivations: [{ permission: "lms.groups.read" }], scopeTemplates: [{ capability: "lms", scopeKind: "dimension", dimensionKey: "academic.subject", dimensionValueId: "math" }] };
  const state = { memberships: [], owner: [], tenant: [], scopes: [], audits: [] };
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const transactionPort = { async transaction(fn) { const before = clone(state); try { return await fn(); } catch (error) { Object.assign(state, before); throw error; } } };
  const idempotencyPort = { results: new Map(), async runOnce({ idempotencyKey }, fn) { if (this.results.has(idempotencyKey)) return this.results.get(idempotencyKey); const result = await fn(); this.results.set(idempotencyKey, result); return result; } };
  const baseDeps = { transactionPort, idempotencyPort, membershipPort: { async ensureMembershipRoleBinding(input) { state.memberships.push(input); return { membershipId: input.membershipId || "membership-admin" }; } }, entitlementService: { async upsertOwnerLimits(input) { state.owner.push(input); return { policyVersion: 2 }; }, async upsertTenantActivations(input) { state.tenant.push(input); return { policyVersion: 3 }; } }, runtimeConsistencyPort: { async audit(event) { state.audits.push(event); } } };
  const failing = createBootstrapProfileService({ ...baseDeps, dataScopeService: { async createAssignment(input) { state.scopes.push(input); throw Object.assign(new Error("scope_target_invalid"), { code: "scope_target_invalid" }); } } });
  await assert.rejects(() => failing.applyProfile({ organizationId: "org", profile, actorLogtoUserId: "owner", initialUserId: "admin", initialRoleId: "role_admin", idempotencyKey: "boot-1" }), /scope_target_invalid/);
  assert.deepEqual(state, { memberships: [], owner: [], tenant: [], scopes: [], audits: [] });
  const ok = createBootstrapProfileService({ ...baseDeps, dataScopeService: { async createAssignment(input) { state.scopes.push(input); return { assignment: { id: `scope-${state.scopes.length}` } }; } } });
  await ok.applyProfile({ organizationId: "org", profile, actorLogtoUserId: "owner", initialUserId: "admin", initialRoleId: "role_admin", idempotencyKey: "boot-2" });
  await ok.applyProfile({ organizationId: "org", profile, actorLogtoUserId: "owner", initialUserId: "admin", initialRoleId: "role_admin", idempotencyKey: "boot-2" });
  assert.equal(state.memberships.length, 1);
  assert.equal(state.scopes.length, 1);
  assert.equal(state.audits.length, 1);
});
