const test = require("node:test");
const assert = require("node:assert/strict");
const {
  authorize,
  createPolicyRegistry,
  createDefaultPolicyRegistry,
  POLICY_REASON_CODES,
  providers,
  requireAuthorization,
} = require("../authorization/policies");
const { createInMemoryDelegationRepository } = require("../authorization/delegation");

const ORG = "org_A";
const principal = {
  subject: "user_A",
  tokenType: "organization",
  audience: ["https://civitas.didaxus.com/api"],
  organizationId: ORG,
  scopes: new Set(["org.documents.create", "org.documents.read"]),
  organizationRoleIds: ["organization_admin"],
};
const delegationProviders = () => ({
  membershipProvider: providers.createTokenMembershipProvider(),
  auditReadinessProvider: providers.createAuditReadinessProvider(),
  resourceOwnershipProvider: providers.createStaticResourceOwnershipProvider(),
  delegationProvider: providers.createDelegationPolicyProvider({ repository: createInMemoryDelegationRepository({ baselineRules: [{ grantorLogtoRoleId: "organization_admin", targetLogtoRoleId: "organization_teacher", canAssign: true, canRevoke: false, isActive: true }] }), knownRoleIds: new Set(["organization_admin", "organization_teacher"]) }),
  entitlementProvider: {
    async evaluate({ rolePaths }) { return { allowed: true, policyVersion: "test-v1", matchedRolePathId: rolePaths.find((path) => path.rolePotentialDecision?.allowed)?.rolePathId || rolePaths[0]?.rolePathId, evaluatedRolePaths: rolePaths.map((path) => ({ rolePathId: path.rolePathId, allowed: Boolean(path.rolePotentialDecision?.allowed), reasonCode: path.rolePotentialDecision?.reasonCode })) }; },
    async evaluateSnapshot() { return { status: "current", policyVersion: "test-v1" }; },
  },
  dataScopeProvider: { async evaluate() { return { allowed: true, status: "valid", strategy: "test" }; } },
});

function base(overrides = {}) {
  return {
    principal,
    permission: "org.documents.create",
    surface: "organization",
    operation: "create",
    organizationId: ORG,
    policies: ["same-organization", "membership-required"],
    providers: delegationProviders(),
    ...overrides,
  };
}

test("registry validates definitions, duplicate IDs, missing fields, freeze, and deterministic listing", () => {
  const registry = createPolicyRegistry();
  const policy = { id: "fixture-policy", version: "v1", requiredFacts: [], supportedSurfaces: ["organization"], evaluate: async () => ({ policyId: "fixture-policy", outcome: "allow", reasonCode: "authorization_allowed" }) };
  registry.registerPolicy(policy);
  assert.throws(() => registry.registerPolicy(policy), /Duplicate policy/);
  assert.throws(() => createPolicyRegistry().registerPolicy({ id: "bad", requiredFacts: [], supportedSurfaces: ["organization"], evaluate: async () => ({}) }), /version/);
  registry.freezeRegistry();
  assert.throws(() => registry.registerPolicy({ ...policy, id: "other" }), /frozen/);
  assert.deepEqual(registry.listPolicies().map((item) => item.id), ["fixture-policy"]);
});

test("default registry exposes core and extension policies without duplicate IDs", () => {
  const registry = createDefaultPolicyRegistry();
  const ids = registry.listPolicies().map((policy) => policy.id);
  assert.equal(ids.length, new Set(ids).size);
  for (const id of ["same-organization", "resource-belongs-to-organization", "membership-required", "target-role-delegable", "cannot-escalate-privileges", "cannot-modify-owner-global", "critical-operation-audited", "connector-enabled", "seat-availability", "feature-enabled", "org-role-entitlement-enabled", "authorization-data-scope-valid"]) assert.ok(ids.includes(id), id);
});

test("authorize denies missing scope before evaluating expensive policies", async () => {
  let called = false;
  const registry = createPolicyRegistry();
  registry.registerPolicy({ id: "expensive", version: "v1", requiredFacts: [], supportedSurfaces: ["organization"], evaluate: async () => { called = true; return { policyId: "expensive", outcome: "allow", reasonCode: "authorization_allowed" }; } });
  registry.freezeRegistry();
  const decision = await authorize(base({ registry, principal: { ...principal, scopes: new Set() }, policies: ["expensive"] }));
  assert.equal(decision.allowed, false);
  assert.equal(decision.reasonCode, POLICY_REASON_CODES.PERMISSION_MISSING);
  assert.equal(called, false);
});

test("authorize denies unknown policy, inactive/unknown permission, and provider failure", async () => {
  assert.equal((await authorize(base({ policies: ["missing-policy"] }))).reasonCode, POLICY_REASON_CODES.POLICY_UNKNOWN);
  assert.equal((await authorize(base({ permission: "org.members.read", principal: { ...principal, scopes: new Set(["org.members.read"]) } }))).reasonCode, POLICY_REASON_CODES.PERMISSION_INACTIVE);
  assert.equal((await authorize(base({ policies: ["membership-required"], providers: {} }))).reasonCode, POLICY_REASON_CODES.POLICY_PROVIDER_MISSING);
});

test("same-organization and resource ownership fail closed on cross-tenant or spoofed body data", async () => {
  assert.equal((await authorize(base({ organizationId: "other" }))).reasonCode, POLICY_REASON_CODES.ORGANIZATION_ROUTE_MISMATCH);
  const cross = await authorize(base({ policies: ["resource-belongs-to-organization"], resource: { type: "document", id: "doc1", organizationId: "other" } }));
  assert.equal(cross.reasonCode, POLICY_REASON_CODES.RESOURCE_ORGANIZATION_MISMATCH);
  const ok = await authorize(base({ policies: ["resource-belongs-to-organization"], resource: { type: "document", id: "doc1", organizationId: ORG } }));
  assert.equal(ok.allowed, true);
});

test("membership provider states deny except active and never need Management API", async () => {
  const revoked = providers.createTokenMembershipProvider({ evaluateMembership: async () => ({ status: "revoked" }) });
  const stale = providers.createTokenMembershipProvider({ evaluateMembership: async () => ({ status: "stale" }) });
  assert.equal((await authorize(base({ providers: { ...delegationProviders(), membershipProvider: revoked } }))).reasonCode, POLICY_REASON_CODES.MEMBERSHIP_REVOKED);
  assert.equal((await authorize(base({ providers: { ...delegationProviders(), membershipProvider: stale } }))).reasonCode, POLICY_REASON_CODES.MEMBERSHIP_STALE);
});

test("delegation, cannot-escalate and owner_global policies consume #92 and preserve role-path provenance", async () => {
  const allowed = await authorize(base({ operation: "assign", policies: ["target-role-delegable", "cannot-escalate-privileges"], target: { type: "role_assignment", roleId: "organization_teacher", userId: "target_user" } }));
  assert.equal(allowed.allowed, true);
  assert.ok(allowed.matchedRolePathId);
  assert.equal(allowed.evaluatedRolePaths[0].delegationDecision.allowed, true);
  const missing = await authorize(base({ operation: "assign", policies: ["target-role-delegable"], target: { type: "role_assignment", roleId: "role_unknown", userId: "target_user" } }));
  assert.equal(missing.allowed, false);
  const owner = await authorize(base({ operation: "assign", policies: ["cannot-modify-owner-global"], target: { type: "role_assignment", roleId: "owner_global", userId: "target_user" } }));
  assert.equal(owner.reasonCode, POLICY_REASON_CODES.OWNER_GLOBAL_MODIFICATION_FORBIDDEN);
  const self = await authorize(base({ operation: "assign", policies: ["target-role-delegable", "cannot-escalate-privileges"], target: { type: "role_assignment", roleId: "organization_teacher", userId: "user_A" } }));
  assert.equal(self.reasonCode, POLICY_REASON_CODES.SELF_PRIVILEGE_CHANGE_FORBIDDEN);
});

test("cannot-escalate does not combine fragments from different role paths", async () => {
  const multi = { ...principal, organizationRoleIds: ["organization_member", "organization_admin"] };
  const provider = providers.createDelegationPolicyProvider({ repository: createInMemoryDelegationRepository({ baselineRules: [{ grantorLogtoRoleId: "organization_admin", targetLogtoRoleId: "organization_teacher", canAssign: true, isActive: true }] }), knownRoleIds: new Set(["organization_member", "organization_admin", "organization_teacher"]) });
  const decision = await authorize(base({ principal: multi, operation: "assign", target: { type: "role_assignment", roleId: "organization_teacher", userId: "target" }, policies: ["target-role-delegable", "cannot-escalate-privileges"], providers: { ...delegationProviders(), delegationProvider: provider } }));
  assert.equal(decision.allowed, true);
  assert.equal(decision.matchedRolePathId, "role_path_1_organization_admin");
});

test("critical audit, connector, seat and feature policies only deny/continue and never recover missing scopes", async () => {
  const audited = await authorize(base({ policies: ["critical-operation-audited"], facts: { auditIntent: { action: "documents.create", reason: "ok", reasonRequired: true, idempotencyRequired: false } } }));
  assert.equal(audited.allowed, true);
  const missingAudit = await authorize(base({ policies: ["critical-operation-audited"], facts: {} }));
  assert.equal(missingAudit.reasonCode, POLICY_REASON_CODES.AUDIT_INTENT_MISSING);
  const disabledConnector = await authorize(base({ policies: ["connector-enabled"], target: { capability: "lms" }, providers: { ...delegationProviders(), connectorProvider: providers.createConnectorProvider({ lms: false }) } }));
  assert.equal(disabledConnector.reasonCode, POLICY_REASON_CODES.CONNECTOR_DISABLED);
  const noSeats = await authorize(base({ policies: ["seat-availability"], providers: { ...delegationProviders(), seatProvider: providers.createSeatProvider({ available: false }) } }));
  assert.equal(noSeats.reasonCode, POLICY_REASON_CODES.SEAT_UNAVAILABLE);
  const featureWithoutScope = await authorize(base({ policies: ["feature-enabled"], target: { feature: "beta" }, principal: { ...principal, scopes: new Set() }, providers: { ...delegationProviders(), featureFlagProvider: providers.createFeatureFlagProvider({ beta: true }) } }));
  assert.equal(featureWithoutScope.reasonCode, POLICY_REASON_CODES.PERMISSION_MISSING);
});

test("extension and impersonation interfaces fail closed until #90/#94/#95/#100 provide real adapters", async () => {
  assert.equal((await authorize(base({ policies: ["org-role-entitlement-enabled"], providers: { ...delegationProviders(), entitlementProvider: providers.createUnavailableEntitlementProvider() } }))).reasonCode, POLICY_REASON_CODES.POLICY_PROVIDER_MISSING);
  assert.equal((await authorize(base({ policies: ["authorization-data-scope-valid"], providers: { ...delegationProviders(), dataScopeProvider: providers.createUnavailableDataScopeProvider() } }))).reasonCode, POLICY_REASON_CODES.RESOURCE_NOT_FOUND_OR_NOT_ACCESSIBLE);
  const ownerPrincipal = { subject: "owner", tokenType: "global", audience: ["https://civitas.didaxus.com/api"], scopes: new Set(["owner.organizations.read"]), globalRoleIds: ["owner_global"] };
  const imp = await authorize({ principal: ownerPrincipal, permission: "owner.organizations.read", surface: "owner", operation: "execute", policies: ["impersonation-allowed"] });
  assert.equal(imp.reasonCode, POLICY_REASON_CODES.POLICY_PROVIDER_MISSING);
});

test("HTTP middleware consumes req.auth without revalidating JWT and returns safe diagnostics", async () => {
  const now = new Date();
  const req = { auth: {
    tokenValidated: true,
    claims: {
      iss: "https://issuer.example/oidc", sub: principal.subject, aud: principal.audience,
      iat: Math.floor(now.getTime() / 1000) - 1, exp: Math.floor(now.getTime() / 1000) + 300,
      organization_id: ORG, scope: "org.documents.read", authz_snapshot_version: 1,
      "https://civitas.didaxus.com/claims/organization_membership_id": "membership_A",
      "https://civitas.didaxus.com/claims/organization_role_ids": ["organization_admin"],
      "https://civitas.didaxus.com/claims/authz_contract_version": "civitas-authorization-foundation/v2",
    },
    trustedMembershipBinding: {
      serverTrusted: true, membershipBindingId: "membership_A", subject: principal.subject,
      organizationId: ORG, membershipState: "active", snapshotVersion: 1,
      bindingRecordVersion: "binding-v1", rolePotentialVersion: "role-v1", checkedAt: now.toISOString(),
      roleAssignments: [{ state: "active", logtoRoleId: "organization_admin", canonicalRoleId: "organization_admin", rolePathId: "path_A", fragments: [{ surface: "rest", permissions: ["org.documents.read"], fragmentId: "fragment_A", version: "v1" }] }],
    },
  }, params: { organizationId: ORG } };
  const res = { statusCode: null, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  let called = false;
  await requireAuthorization({ permission: "org.documents.read", surface: "organization", operation: "read", policies: ["same-organization", "membership-required"], providers: delegationProviders() })(req, res, () => { called = true; });
  assert.equal(called, true);
  assert.ok(req.authorizationDecision.decisionId);
  assert.equal(JSON.stringify(req.authorizationDecision).includes("bearer"), false);
  assert.equal(JSON.stringify(req.authorizationDecision).includes("claims"), false);
});

test("PBAC catalog gate denies unknown, planned, surface-mismatched and registry-hash drift", async () => {
  const unknown = await authorize(base({ permission: "governance.preview.read", principal: { ...principal, scopes: new Set(["governance.preview.read"]) }, policies: [] }));
  assert.equal(unknown.reasonCode, POLICY_REASON_CODES.PERMISSION_UNKNOWN);

  const planned = await authorize(base({ permission: "lms.grades.export", principal: { ...principal, scopes: new Set(["lms.grades.export"]) }, policies: [] }));
  assert.equal(planned.reasonCode, POLICY_REASON_CODES.PERMISSION_INACTIVE);

  const surfaceMismatch = await authorize(base({ permission: "owner.runtime.read", surface: "organization", principal: { ...principal, scopes: new Set(["owner.runtime.read"]) }, policies: [] }));
  assert.equal(surfaceMismatch.reasonCode, POLICY_REASON_CODES.CONSUMER_SURFACE_MISMATCH);

  const hashMismatch = await authorize(base({ catalogHash: "sha256:not-the-runtime-catalog", policies: [] }));
  assert.equal(hashMismatch.reasonCode, POLICY_REASON_CODES.REGISTRY_CATALOG_MISMATCH);
});

test("PBAC decisions include catalog, role-model and snapshot provenance", async () => {
  const decision = await authorize(base({ policies: [], snapshotVersion: "snapshot-fixture-v1" }));
  assert.equal(decision.allowed, true);
  assert.match(decision.catalogHash, /^[a-f0-9]{64}$/);
  assert.equal(decision.roleModelVersion, "2026-07-civitas-phase3-role-bundles-v1");
  assert.equal(decision.snapshotProvenance.snapshotVersion, "snapshot-fixture-v1");
  assert.equal(decision.snapshotProvenance.catalogHash, decision.catalogHash);
});

test("owner runtime read and operation execution are independent guards", async () => {
  const ownerPrincipal = { subject: "owner", tokenType: "global", audience: ["https://civitas.didaxus.com/api"], scopes: new Set(["owner.runtime.read"]), globalRoleIds: ["owner_global"] };
  const ownerProviders = { entitlementProvider: { async evaluateSnapshot() { return { status: "current" }; } } };
  const read = await authorize({ principal: ownerPrincipal, permission: "owner.runtime.read", surface: "owner", operation: "read", policies: [], providers: ownerProviders });
  assert.equal(read.allowed, true);
  const execute = await authorize({ principal: ownerPrincipal, permission: "owner.runtime.operations.execute", surface: "owner", operation: "execute", policies: [], providers: ownerProviders });
  assert.equal(execute.allowed, false);
  assert.equal(execute.reasonCode, POLICY_REASON_CODES.PERMISSION_MISSING);
});

test("module availability is part of the PBAC denial pipeline", async () => {
  const unavailable = await authorize(base({ policies: [], providers: { ...delegationProviders(), moduleAvailabilityResolver: { resolve: async () => ({ status: "disabled", capability: "documents" }) } } }));
  assert.equal(unavailable.reasonCode, POLICY_REASON_CODES.MODULE_DISABLED);
});
