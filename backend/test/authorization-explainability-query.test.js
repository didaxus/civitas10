"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { AuthorizationExplainabilityQuery, AGGREGATE_VERSION } = require("../authorization/explainability/AuthorizationExplainabilityQuery");

function fixture(overrides = {}) {
  const snapshots = new Map();
  const subject = { subject: "ana", displaySubjectId: "sub_hash", organizationId: "org-a", scopes: ["docs.read"], source: { available: true, source: "membership-repository/v7" }, rolePaths: [
    { rolePathId: "teacher", membershipId: "m-teacher", canonicalRoleId: "organization_teacher", logtoRoleId: "r-teacher" },
    { rolePathId: "head", membershipId: "m-head", canonicalRoleId: "organization_headteacher", logtoRoleId: "r-head" },
  ] };
  return new AuthorizationExplainabilityQuery({
    diagnosticAuthorizer: async () => ({ allowed: true }), subjectResolver: async () => subject,
    resourceResolver: async () => ({ organizationId: "org-a", source: { available: true, source: "documents/v3" } }),
    entitlementEvaluator: async ({ rolePaths }) => ({ policyVersion: "policy/9", evaluatedRolePaths: rolePaths.map((p) => ({ ...p, allowed: p.rolePathId === "teacher", reasonCode: p.rolePathId === "teacher" ? "entitlement_allowed" : "owner_ceiling_denied" })) }),
    dataScopeEvaluator: async ({ principal }) => ({ version: "scopes/4", rolePaths: principal.rolePaths.map((p) => ({ ...p, allowed: p.rolePathId === "head", reasonCode: p.rolePathId === "head" ? "data_scope_allowed" : "data_scope_denied" })) }),
    snapshotStore: { async save(id, value) { snapshots.set(id, value); }, async get(id) { return snapshots.get(id); } },
    versions: { catalog: "catalog/3", structure: "structure/8" }, ...overrides,
  });
}

test("complete role paths cannot borrow entitlement from one path and scope from another", async () => {
  const result = await fixture().execute({ organizationId: "org-a", permission: "docs.read" });
  assert.equal(result.summary.allowed, false);
  assert.deepEqual(result.rolePathMatrix.map((p) => p.allowed), [false, false]);
});

test("summary, role matrix and selected graph have parity", async () => {
  const query = fixture({ dataScopeEvaluator: async ({ principal }) => ({ version: "scopes/4", rolePaths: principal.rolePaths.map((p) => ({ ...p, allowed: p.rolePathId === "teacher", reasonCode: p.rolePathId === "teacher" ? "data_scope_allowed" : "data_scope_denied" })) }) });
  const result = await query.execute({ organizationId: "org-a", permission: "docs.read" });
  const selected = result.rolePathMatrix.find((p) => p.rolePathId === result.summary.selectedRolePathId);
  assert.equal(result.aggregateVersion, AGGREGATE_VERSION); assert.equal(result.summary.allowed, selected.allowed);
  assert.equal(result.selectedDependencyGraph.membershipId, selected.membershipId); assert.equal(result.selectedDependencyGraph.canonicalRoleId, selected.canonicalRoleId);
});

test("cross-tenant resource is not disclosed", async () => {
  const query = fixture({ resourceResolver: async () => ({ organizationId: "org-b" }) });
  await assert.rejects(() => query.execute({ organizationId: "org-a", permission: "docs.read", resourceRef: "secret" }), (error) => error.status === 404 && error.code === "diagnostic_target_not_disclosed");
});

test("unknown reasons and unavailable provenance are explicit", async () => {
  const query = fixture({ entitlementEvaluator: async ({ rolePaths }) => ({ evaluatedRolePaths: rolePaths.map((p) => ({ ...p, allowed: false })) }) });
  const result = await query.execute({ organizationId: "org-a", permission: "docs.read" });
  assert.equal(result.summary.allowed, false); assert.equal(result.rolePathMatrix[0].sources.entitlement.available, false);
  assert.equal(JSON.stringify(result).includes('"preview"'), false);
});

test("historical decision returns its immutable snapshot instead of current evaluation", async () => {
  const query = fixture(); const current = await query.execute({ organizationId: "org-a", permission: "docs.read", generatedDecisionId: "decision-1" });
  const historical = await query.execute({ organizationId: "org-a", decisionId: "decision-1" });
  assert.equal(historical.queryMode, "historical"); assert.equal(historical.summary.allowed, current.summary.allowed); assert.equal(historical.decisionId, "decision-1");
});
