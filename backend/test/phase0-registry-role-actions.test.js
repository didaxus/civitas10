const test = require("node:test");
const assert = require("node:assert/strict");
const { connectorRegistry, codes } = require("../connectors/registry");
const { createMemoryRoleMappingStore } = require("../authorization/roleMappingStore");
const { resolveRoleMapping } = require("../authorization/roleMappingResolver");
const { getActionJobId, selectQueueForAction } = require("../queues/actionQueue");
const { getActionDefinition } = require("../worker/actionCatalog");

const seedMappings = [
  { logtoOrganizationId: "org-x", capability: "lms", connectorKey: "mock", canonicalRoleName: "organization_student", downstreamRoleName: "organization_studentA" },
  { logtoOrganizationId: "org-x", capability: "community", connectorKey: "mock", canonicalRoleName: "organization_student", downstreamRoleName: "organization_student" },
  { logtoOrganizationId: "org-x", capability: "crm", connectorKey: "mock", canonicalRoleName: "organization_student", downstreamRoleName: "ROL.A" },
  { logtoOrganizationId: "org-y", capability: "lms", connectorKey: "mock", canonicalRoleName: "organization_student", downstreamRoleName: "ROL_ESTUDIANTE" },
  { logtoOrganizationId: "org-y", capability: "crm", connectorKey: "mock", canonicalRoleName: "organization_student", downstreamRoleName: "STUDENT_SEGMENT" },
  { capability: "support", canonicalRoleName: "organization_student", downstreamRoleName: "SUPPORT_DEFAULT" },
];

test("connector registry resolves base identity/logto adapter", () => {
  const adapter = connectorRegistry.resolve({ capability: "identity", provider: "logto", config: { endpoint: "https://logto.example", managementApiResource: "https://logto.example/api" } });
  assert.equal(adapter.capability, "identity");
  assert.equal(adapter.provider, "logto");
  assert.ok(Array.isArray(adapter.actions));
  assert.equal(typeof adapter.healthcheck, "function");
  assert.equal(typeof adapter.execute, "function");
});

test("connector registry throws typed unsupported capability/provider/config errors", () => {
  assert.throws(() => connectorRegistry.resolve({ capability: "erp", provider: "odoo" }), { code: codes.CAPABILITY_UNSUPPORTED });
  assert.throws(() => connectorRegistry.resolve({ capability: "crm", provider: "salesforce" }), { code: codes.PROVIDER_UNSUPPORTED });
  assert.throws(() => connectorRegistry.resolve({ capability: "crm", provider: "fluentcrm", config: {} }), { code: codes.CONFIG_INVALID });
});

test("role mapping resolves the same canonical role differently by org and capability", async () => {
  const store = createMemoryRoleMappingStore(seedMappings);
  const common = { connectorKey: "mock", canonicalRoleName: "organization_student", membershipContext: { membershipId: "mem-1", status: "active" } };
  assert.equal((await resolveRoleMapping({ ...common, orgId: "org-x", logtoOrganizationId: "org-x", capability: "lms" }, { store })).downstream.roleName, "organization_studentA");
  assert.equal((await resolveRoleMapping({ ...common, orgId: "org-x", logtoOrganizationId: "org-x", capability: "community" }, { store })).downstream.roleName, "organization_student");
  assert.equal((await resolveRoleMapping({ ...common, orgId: "org-x", logtoOrganizationId: "org-x", capability: "crm" }, { store })).downstream.roleName, "ROL.A");
  assert.equal((await resolveRoleMapping({ ...common, orgId: "org-y", logtoOrganizationId: "org-y", capability: "lms" }, { store })).downstream.roleName, "ROL_ESTUDIANTE");
  assert.equal((await resolveRoleMapping({ ...common, orgId: "org-y", logtoOrganizationId: "org-y", capability: "crm" }, { store })).downstream.roleName, "STUDENT_SEGMENT");
});

test("role mapping uses capability default and separates canonical/membership/downstream", async () => {
  const store = createMemoryRoleMappingStore(seedMappings);
  const result = await resolveRoleMapping({ orgId: "org-z", logtoOrganizationId: "org-z", capability: "support", canonicalRoleId: "role-a", canonicalRoleName: "organization_student", membershipContext: { membershipId: "mem-z", status: "active" } }, { store });
  assert.equal(result.canonical.roleName, "organization_student");
  assert.equal(result.membership.source, "logto");
  assert.equal(result.downstream.roleName, "SUPPORT_DEFAULT");
  assert.equal(result.mappingSource, "capability_default");
});

test("action definitions expose canonical queues and idempotency keys", () => {
  assert.equal(getActionJobId({ id: "op-1" }), "action-operation-op-1");
  assert.equal(selectQueueForAction("system.echo"), "priority_commands");
  assert.equal(selectQueueForAction("system.fail_retryable"), "background_events");
  const roleMapping = getActionDefinition("role_mapping.resolve");
  assert.equal(roleMapping.queue, "priority_commands");
  assert.equal(roleMapping.idempotencyKey({ orgId: "org-x", capability: "lms", canonicalRoleName: "organization_student" }), "role_mapping.resolve:org-x:default:lms:organization_student");
});

test("role mapping rejects legacy display names, group labels, and aliases as canonical roles", async () => {
  const prohibited = ["Admin-org", "Student-org", "Organization admin", "Organization student", "Administrators", "Students", "org" + "_admin", "org" + "_student"];
  for (const canonicalRoleName of prohibited) {
    const store = createMemoryRoleMappingStore([{ capability: "lms", canonicalRoleName, downstreamRoleName: "DOWNSTREAM" }]);
    await assert.rejects(
      () => resolveRoleMapping({ orgId: "org-x", capability: "lms", canonicalRoleName }, { store }),
      { code: "ROLE_MAPPING_CANONICAL_ROLE_INVALID" },
      canonicalRoleName,
    );
  }
});
