const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeProvisioningInput, runCanonicalOrganizationProvisioning } = require("../services/organizationProvisioningCore");
const { createMemoryProvisioningRecorder } = require("../services/organizationProvisioningRecorder");
const { createMemoryOrganizationProvisioningDraftStore } = require("../services/organizationProvisioningDrafts");
const { buildBootstrapStatus } = require("../services/ownerBootstrapStatus");

function payload(overrides = {}) {
  return {
    name: "Colegio Uno",
    description: "Demo",
    appSubdomain: "colegio-uno",
    appBaseDomain: "didaxus.com",
    adminDomain: "colegiouno.edu",
    jitProvisioning: { defaultRoleNames: [] },
    administrativeContacts: [
      { firstName: "Ada", firstSurname: "Lovelace", email: "ada@example.test", organizationRoleName: "organization_admin" },
      { firstName: "Grace", firstSurname: "Hopper", email: "grace@example.test", organizationRoleName: "organization_billing" },
    ],
    ...overrides,
  };
}

function normalize(input = payload()) {
  const normalized = normalizeProvisioningInput(input);
  assert.deepEqual(normalized.errors, []);
  return normalized.value;
}

function logtoDeps(calls, { failOnAssignEmail = null } = {}) {
  return {
    async listLogtoOrganizationRoles() { calls.push("roles.list"); return [{ id: "role-admin", name: "organization_admin" }, { id: "role-billing", name: "organization_billing" }, { id: "role-member", name: "organization_member" }]; },
    async ensureOrganizationTemplate() { calls.push("template.validate"); return { ok: true }; },
    async createOrganization() { calls.push("organization.create"); return { id: "org-1", name: "Colegio Uno" }; },
    async replaceJitEmailDomainsForLogtoOrganization() { calls.push("jit.domains.replace"); },
    async replaceJitDefaultRolesForLogtoOrganization({ organizationRoleIds }) { calls.push(["jit.roles.replace", organizationRoleIds]); },
    async createOrResolveLogtoUserByEmail(user) { calls.push(["user.resolve", user.primaryEmail]); return { user: { id: `user-${user.primaryEmail.split("@")[0]}` }, created: true, source: "created" }; },
    async addUserToLogtoOrganization({ userId }) { calls.push(["membership.add", userId]); },
    async assignOrganizationRoleToUser({ userId, organizationRoleName }) {
      calls.push(["role.assign", userId, organizationRoleName]);
      if (failOnAssignEmail && userId.includes(failOnAssignEmail.split("@")[0])) throw Object.assign(new Error("role assignment failed"), { code: "ROLE_ASSIGN_FAILED" });
    },
  };
}

test("same idempotencyKey resume does not repeat completed external effects", async () => {
  const calls = [];
  const recorder = createMemoryProvisioningRecorder({ idempotencyKey: "idem-1" });
  const input = normalize();

  await assert.rejects(() => runCanonicalOrganizationProvisioning({ input, actor: { type: "owner_global" }, recorder, logto: logtoDeps(calls, { failOnAssignEmail: "grace@example.test" }) }), /role assignment failed/);
  assert.equal(calls.filter((call) => call === "organization.create").length, 1);
  assert.equal(recorder.operation.status, "failed");
  assert.equal(recorder.operation.logtoOrganizationId, "org-1");

  const retryCalls = [];
  const result = await runCanonicalOrganizationProvisioning({ input, actor: { type: "owner_global" }, recorder, logto: logtoDeps(retryCalls) });

  assert.equal(result.organizationId, "org-1");
  assert.equal(retryCalls.includes("organization.create"), false);
  assert.equal(retryCalls.some((call) => Array.isArray(call) && call[0] === "role.assign" && call[1] === "user-ada"), false);
  assert.equal(retryCalls.some((call) => Array.isArray(call) && call[0] === "role.assign" && call[1] === "user-grace"), true);
  assert.equal(recorder.operation.status, "completed");
});

test("empty jitProvisioning.defaultRoleNames falls back to approved organization_member", async () => {
  const calls = [];
  const recorder = createMemoryProvisioningRecorder({ idempotencyKey: "idem-empty-jit" });
  await runCanonicalOrganizationProvisioning({ input: normalize(), actor: { type: "owner_global" }, recorder, logto: logtoDeps(calls) });

  assert.deepEqual(calls.find((call) => Array.isArray(call) && call[0] === "jit.roles.replace"), ["jit.roles.replace", ["role-member"]]);
});

test("first administrative contact is primary operational contact but has no implicit role", async () => {
  const recorder = createMemoryProvisioningRecorder({ idempotencyKey: "idem-primary" });
  const result = await runCanonicalOrganizationProvisioning({ input: normalize(), actor: { type: "owner_global" }, recorder, logto: logtoDeps([]) });

  assert.equal(result.administrativeContactAssignments[0].primaryOperationalContact, true);
  assert.equal(result.administrativeContactAssignments[0].roleName, "organization_admin");
  assert.equal(result.administrativeContactAssignments[1].roleName, "organization_billing");
});

test("drafts generate idempotencyKey and can be resumed by stage", async () => {
  const store = createMemoryOrganizationProvisioningDraftStore();
  const draft = await store.saveOrganizationProvisioningDraft({ currentStage: "canonical", stagePayload: { name: "Colegio Uno" }, actor: { logtoUserId: "owner-1" } });
  assert.match(draft.idempotencyKey, /^orgwiz_/);

  await store.saveOrganizationProvisioningDraft({ idempotencyKey: draft.idempotencyKey, currentStage: "admins", stagePayload: { administrativeContacts: [{ email: "ada@example.test" }] }, consolidatedPayload: { name: "Colegio Uno" } });
  const resumed = await store.getOrganizationProvisioningDraft({ idempotencyKey: draft.idempotencyKey });
  assert.equal(resumed.currentStage, "admins");
  assert.equal(resumed.stagePayloads.canonical.name, "Colegio Uno");
  assert.equal(resumed.stagePayloads.admins.administrativeContacts[0].email, "ada@example.test");
});

test("owner bootstrap status combines live Logto organization identity with failed operational trace", () => {
  const status = buildBootstrapStatus({ logtoOrganization: { id: "org-1", name: "Live name from Logto" }, operations: [{ id: "op-1", operationType: "organization.bootstrap", logtoOrganizationId: "org-1", idempotencyKey: "idem-1", status: "failed", outputJson: { organizationId: "org-1" }, lastErrorJson: { message: "role failed" }, updatedAt: "2026-07-08T00:00:00.000Z" }] });

  assert.equal(status.canonicalSource, "logto");
  assert.equal(status.status, "bootstrap_incomplete");
  assert.equal(status.blockers[0].code, "bootstrap_incomplete");
  assert.equal(status.nextActions.some((action) => action.type === "resume_bootstrap"), true);
  assert.equal(status.nextActions.some((action) => action.type === "open_logto_resource"), true);
});
