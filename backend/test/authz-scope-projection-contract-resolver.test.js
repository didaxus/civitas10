"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createScopeProjectionContractResolver, PROJECTION_CONTRACT_REASON_CODES } = require("../organization-structure/scopeProjectionContractResolver");
const { validateCandidate, INTEGRATION_REASON_CODES } = require("../organization-structure/scopeCandidateIntegration");
const { createOwnerScopeTemplateRegistry, OWNER_SCOPE_TEMPLATES, templateKey } = require("../authorization/data-scope/scopeTemplateRegistry");
const { DATA_SCOPE_STRATEGY_REGISTRY } = require("../authorization/data-scope/dataScopeStrategyRegistry");

const teacherTemplate = OWNER_SCOPE_TEMPLATES.find((template) => template.id === "teacher_lms_restricted_v2");
const candidate = Object.freeze({ organizationId: "org_a", subjectId: "teacher_a", logtoRoleId: "logto_teacher", capability: "lms", target: { kind: "dimension", dimensionKey: "academic.class", dimensionValueId: "class_7b" }, source: { type: "teaching_assignment", id: "assignment_7b" }, translation: { ruleId: "teaching-assignment-to-class", ruleVersion: "1" } });

function fixture(overrides = {}) {
  const key = templateKey({ organizationId: "org_a", scopeTemplateId: teacherTemplate.id, scopeTemplateVersion: teacherTemplate.version });
  const templateRegistry = overrides.scopeTemplateRegistry || createOwnerScopeTemplateRegistry({ availability: new Map([[key, true]]), tenantConfigurations: new Map([[key, { enabled: true }]]) });
  return createScopeProjectionContractResolver({
    membershipBindingPort: overrides.membershipBindingPort || { async resolveOrganizationMembership() { return { membershipId: "membership_real_a", organizationId: "org_a", subjectId: "teacher_a", logtoRoleIds: ["logto_teacher"], status: "active" }; } },
    canonicalRoleBindingPort: overrides.canonicalRoleBindingPort || { async resolveCanonicalRole() { return { membershipId: "membership_real_a", organizationId: "org_a", subjectId: "teacher_a", logtoRoleId: "logto_teacher", canonicalRoleId: "organization_teacher", status: "active" }; } },
    scopeTemplateRegistry: templateRegistry,
    strategyRegistry: overrides.strategyRegistry || DATA_SCOPE_STRATEGY_REGISTRY,
    snapshotPort: overrides.snapshotPort || { async getCurrentSnapshotVersion() { return "42"; }, async isCurrent() { return true; } },
  });
}

test("teacher projection resolves a real membership, canonical role, published class template and snapshot", async () => {
  assert.deepEqual(await fixture().resolve(candidate), { membershipId: "membership_real_a", canonicalRoleId: "organization_teacher", scopeTemplateId: "teacher_lms_restricted_v2", scopeTemplateVersion: teacherTemplate.version, strategyId: "teaching_assignments", snapshotVersion: "42" });
});

test("projection contract fails closed for missing membership, template, wrong binding, strategy, tenant and stale snapshot", async (t) => {
  const emptyTemplates = createOwnerScopeTemplateRegistry();
  const cases = [
    ["missing membership", fixture({ membershipBindingPort: { async resolveOrganizationMembership() { return null; } } }), candidate, PROJECTION_CONTRACT_REASON_CODES.MEMBERSHIP_NOT_FOUND],
    ["missing template", fixture({ scopeTemplateRegistry: emptyTemplates }), candidate, PROJECTION_CONTRACT_REASON_CODES.TEMPLATE_NOT_FOUND],
    ["wrong canonical role", fixture({ canonicalRoleBindingPort: { async resolveCanonicalRole() { return { membershipId: "membership_real_a", organizationId: "org_a", subjectId: "teacher_a", logtoRoleId: "logto_teacher", canonicalRoleId: "organization_headteacher", status: "active" }; } } }), candidate, PROJECTION_CONTRACT_REASON_CODES.ROLE_NOT_ALLOWED],
    ["wrong tenant", fixture({ membershipBindingPort: { async resolveOrganizationMembership() { return { membershipId: "membership_real_a", organizationId: "org_b", subjectId: "teacher_a", logtoRoleIds: ["logto_teacher"], status: "active" }; } } }), candidate, PROJECTION_CONTRACT_REASON_CODES.MEMBERSHIP_MISMATCH],
    ["wrong strategy", fixture({ strategyRegistry: { ...DATA_SCOPE_STRATEGY_REGISTRY, teaching_assignments: null } }), candidate, PROJECTION_CONTRACT_REASON_CODES.STRATEGY_MISMATCH],
    ["stale snapshot", fixture({ snapshotPort: { async getCurrentSnapshotVersion() { return "41"; }, async isCurrent() { return false; } } }), candidate, PROJECTION_CONTRACT_REASON_CODES.SNAPSHOT_STALE],
    ["wrong capability", fixture(), { ...candidate, capability: "planning" }, PROJECTION_CONTRACT_REASON_CODES.TEMPLATE_NOT_FOUND],
    ["teacher subject-wide", fixture(), { ...candidate, target: { kind: "dimension", dimensionKey: "academic.subject", dimensionValueId: "math" }, translation: { ruleId: "academic-department-teaches-to-subject", ruleVersion: "1" } }, PROJECTION_CONTRACT_REASON_CODES.ROLE_NOT_ALLOWED],
  ];
  for (const [name, resolver, input, code] of cases) await t.test(name, async () => assert.rejects(() => resolver.resolve(input), (error) => error.code === code));
});

test("candidate validation rejects an inactive taxonomy value before contract resolution", async () => {
  const result = await validateCandidate(candidate, { organizationId: "org_a", taxonomyPort: { async resolvePublishedDimensionValue() { return { status: "archived" }; } } });
  assert.equal(result.valid, false);
  assert.equal(result.reasonCode, INTEGRATION_REASON_CODES.TARGET_INVALID);
});
