const test = require("node:test");
const assert = require("node:assert/strict");

const {
  InvalidInitialOrganizationRoleError,
  normalizeProvisioningInput,
  runCanonicalOrganizationProvisioning,
} = require("../services/organizationProvisioningCore");

function validBody(roleName = "organization_admin") {
  return {
    name: "Colegio Uno",
    entryUrl: "https://colegio.didaxus.com",
    appSubdomain: "colegio",
    appBaseDomain: "didaxus.com",
    adminDomain: "colegio.didaxus.com",
    administrativeContacts: [{ firstName: "Ada", firstSurname: "Lovelace", email: "ada@example.test", organizationRoleName: roleName }],
    jitProvisioning: { defaultRoleNames: ["organization_member"] },
  };
}

function fakeLogto({ roles = ["organization_admin", "organization_member"] } = {}) {
  const calls = [];
  const roleRows = roles.map((name, index) => ({ id: `role-${index + 1}`, name }));
  return {
    calls,
    deps: {
      async listLogtoOrganizationRoles() { calls.push(["listLogtoOrganizationRoles"]); return roleRows; },
      async ensureOrganizationTemplate({ requiredRoleNames }) { calls.push(["ensureOrganizationTemplate", requiredRoleNames]); return { ok: true, requiredRoleNames, roles: roleRows }; },
      async createOrganization() { calls.push(["createOrganization"]); return { id: "org-1", name: "Colegio Uno" }; },
      async replaceJitEmailDomainsForLogtoOrganization(input) { calls.push(["replaceJitEmailDomainsForLogtoOrganization", input]); return {}; },
      async replaceJitDefaultRolesForLogtoOrganization(input) { calls.push(["replaceJitDefaultRolesForLogtoOrganization", input]); return {}; },
      async createOrResolveLogtoUserByEmail() { calls.push(["createOrResolveLogtoUserByEmail"]); return { user: { id: "user-1" }, created: true, source: "created" }; },
      async addUserToLogtoOrganization(input) { calls.push(["addUserToLogtoOrganization", input]); return {}; },
      async assignOrganizationRoleToUser(input) { calls.push(["assignOrganizationRoleToUser", input]); return {}; },
    },
  };
}

test("provisioning does not default a tenant role from hardcoded backend constants", () => {
  const normalized = normalizeProvisioningInput({ ...validBody(), administrativeContacts: [{ firstName: "Ada", firstSurname: "Lovelace", email: "ada@example.test" }] });
  assert.ok(normalized.errors.some((error) => error.field === "administrativeContacts.0.organizationRoleName"));
});

test("provisioning validates selected initial organization role against Logto roles", async () => {
  const normalized = normalizeProvisioningInput(validBody("organization_director"));
  assert.deepEqual(normalized.errors, []);
  const logto = fakeLogto({ roles: ["organization_admin", "organization_member"] });

  await assert.rejects(
    () => runCanonicalOrganizationProvisioning({ input: normalized.value, logto: logto.deps }),
    (error) => {
      assert.ok(error instanceof InvalidInitialOrganizationRoleError);
      assert.equal(error.error, "invalid_initial_organization_role");
      assert.equal(error.requestedRole, "organization_director");
      assert.deepEqual(error.availableRoles, ["organization_admin", "organization_member"]);
      return true;
    },
  );
  assert.deepEqual(logto.calls.map(([name]) => name), ["listLogtoOrganizationRoles"]);
});

test("provisioning assigns only explicit Logto organization role and does not convert owner_global into tenant membership", async () => {
  const normalized = normalizeProvisioningInput(validBody("organization_admin"));
  assert.deepEqual(normalized.errors, []);
  const logto = fakeLogto({ roles: ["organization_admin", "organization_member"] });
  const steps = [];

  const result = await runCanonicalOrganizationProvisioning({
    input: normalized.value,
    actor: { type: "owner_global", logtoUserId: "owner-1" },
    recorder: { async startOperation(event) { steps.push(["start", event]); }, async recordStep(event) { steps.push(["step", event]); }, async completeOperation(event) { steps.push(["complete", event]); } },
    logto: logto.deps,
  });

  assert.equal(result.organizationId, "org-1");
  assert.deepEqual(result.availableOrganizationRoles, ["organization_admin", "organization_member"]);
  const assignCall = logto.calls.find(([name]) => name === "assignOrganizationRoleToUser");
  assert.equal(assignCall[1].organizationRoleName, "organization_admin");
  assert.equal(assignCall[1].userId, "user-1");
  assert.ok(!logto.calls.some(([, input]) => input?.userId === "owner-1"));
  assert.ok(steps.some(([kind, event]) => kind === "start" && event.operationType === "organization.bootstrap"));
  assert.ok(steps.some(([kind, event]) => kind === "step" && event.stepName === "logto.organization_roles.list" && event.status === "completed"));
});

const { assertProvisionedRoleAllowed, assertFederationRoleMappingAllowed, sanitizeExternalProvisioningClaims } = require("../authorization/provisioningGuard");

test("provisioning rejects owner roles and external permission injection", () => {
  assert.throws(() => normalizeProvisioningInput({ ...validBody(), jitProvisioning: { defaultRoleNames: ["owner_global"] } }), /provisioning_role_not_canonical|provisioning_owner_role_forbidden/);
  assert.throws(() => normalizeProvisioningInput({ ...validBody(), jitProvisioning: { defaultRoleNames: ["organization_unknown"] } }), /provisioning_role_not_canonical/);
  const normalized = normalizeProvisioningInput(validBody("owner_global"));
  assert.ok(normalized.errors.some((error) => error.message === "provisioning_role_not_canonical" || error.message === "provisioning_owner_role_forbidden"));
  assert.throws(() => sanitizeExternalProvisioningClaims({ sub: "user", permissions: ["owner.profile.read"], owner_global: true }), /provisioning_claim_forbidden/);
  assert.throws(() => sanitizeExternalProvisioningClaims({ sub: "user", organizationId: "other" }), /provisioning_claim_forbidden/);
});


test("provisioning blocks sensitive roles as automatic JIT fallback unless owner policy is explicit", () => {
  assert.throws(
    () => normalizeProvisioningInput({ ...validBody(), jitProvisioning: { defaultRoleNames: ["organization_admin"] } }),
    /provisioning_sensitive_role_requires_owner_policy/,
  );
  assert.doesNotThrow(() => assertProvisionedRoleAllowed({
    roleName: "organization_admin",
    source: "jit_default_roles",
    approvalPolicy: { ownerApproved: true, policyVersion: "owner-policy-v1" },
  }));
});

test("provisioning keeps owner_global forbidden even with explicit owner policy", () => {
  assert.throws(
    () => assertProvisionedRoleAllowed({ roleName: "owner_global", source: "federated_jit", approvalPolicy: { ownerApproved: true } }),
    /provisioning_owner_role_forbidden/,
  );
});

test("provisioning allows standard organization_member as fallback when policy permits it", () => {
  assert.doesNotThrow(() => normalizeProvisioningInput({ ...validBody(), jitProvisioning: { defaultRoleNames: ["organization_member"] } }));
  assert.doesNotThrow(() => assertProvisionedRoleAllowed({ roleName: "organization_member", source: "jit_default_roles", autoProvisioningMode: "automatic", firstLogin: true }));
});

test("federation mapping guard requires review metadata and audits sensitive role mappings", () => {
  assert.throws(
    () => assertFederationRoleMappingAllowed({ roleName: "organization_admin", approvalPolicy: { ownerApproved: true } }),
    /federation_sensitive_mapping_actor_required/,
  );
  const events = [];
  assert.doesNotThrow(() => assertFederationRoleMappingAllowed({
    roleName: "organization_admin",
    actor: { type: "owner", logtoUserId: "owner-1" },
    reason: "approved federation role mapping",
    policyVersion: "policy-7",
    mappingVersion: "mapping-3",
    approvalPolicy: { ownerApproved: true },
    audit: { record(event) { events.push(event); } },
  }));
  assert.equal(events[0].action, "federation.role_mapping.sensitive_review_required");
  assert.equal(events[0].policyVersion, "policy-7");
  assert.equal(events[0].mappingVersion, "mapping-3");
});
