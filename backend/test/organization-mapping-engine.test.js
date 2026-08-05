"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluateMappingPolicy, OUTCOMES, MAPPING_REASON_CODES, selectorRegistryHash, externalFactSelectors } = require("../../core/organization-mapping/index.cjs");

const facts = Object.freeze({ provider: "oidc", externalSubjectId: "u1", tenantId: "org_a", externalGroupIds: ["g-teachers"], claimsComplete: true, claims: { department: "math" } });

test("selector registry is immutable, hashed, and reusable", () => {
  assert.ok(selectorRegistryHash);
  assert.equal(new Set(externalFactSelectors.map((s) => s.selectorId)).size, externalFactSelectors.length);
  assert.throws(() => externalFactSelectors.push({}), /not extensible|read only|object is not extensible/i);
});

test("engine produces organization-model candidates without grants", () => {
  const result = evaluateMappingPolicy({ rules: [{ ruleId: "r1", tenantId: "org_a", conditions: [{ selectorId: "external.group", operator: "equals", value: "g-teachers" }], target: { dimensionId: "academic.department", valueStableKey: "math" } }] }, { organizationId: "org_a", facts });
  assert.equal(result.outcome, OUTCOMES.MATCHED);
  assert.deepEqual(result.candidate.target, { dimensionId: "academic.department", valueStableKey: "math" });
});

test("incomplete, cross-tenant, and grant-shaped states fail closed", () => {
  assert.equal(evaluateMappingPolicy({ rules: [] }, { organizationId: "org_a", facts: { ...facts, claimsComplete: false } }).outcome, OUTCOMES.AMBIGUOUS);
  assert.equal(evaluateMappingPolicy({ rules: [] }, { organizationId: "org_b", facts }).reasonCode, MAPPING_REASON_CODES.TENANT_MISMATCH);
  const unsafe = evaluateMappingPolicy({ rules: [{ ruleId: "unsafe", conditions: [], target: { dimensionId: "academic.stage", canonicalRoleName: "organization_admin" } }] }, { organizationId: "org_a", facts });
  assert.equal(unsafe.outcome, OUTCOMES.INCOMPATIBLE);
  assert.equal(unsafe.reasonCode, MAPPING_REASON_CODES.UNSAFE_GRANT_FIELD);
});

test("authority, precedence, specificity, and conflicts are deterministic", () => {
  const baseRule = { conditions: [{ selectorId: "external.group", operator: "equals", value: "g-teachers" }], target: { dimensionId: "academic.stage", valueStableKey: "secondary" } };
  const selected = evaluateMappingPolicy({ rules: [{ ...baseRule, ruleId: "global", authority: "global", precedence: 100 }, { ...baseRule, ruleId: "tenant", authority: "tenant", precedence: 1, target: { dimensionId: "academic.stage", valueStableKey: "tenant-secondary" } }] }, { organizationId: "org_a", facts });
  assert.equal(selected.candidate.ruleId, "tenant");
  const conflict = evaluateMappingPolicy({ rules: [{ ...baseRule, ruleId: "a", authority: "tenant" }, { ...baseRule, ruleId: "b", authority: "tenant", target: { dimensionId: "academic.stage", valueStableKey: "other" } }] }, { organizationId: "org_a", facts });
  assert.equal(conflict.outcome, OUTCOMES.AMBIGUOUS);
  assert.equal(conflict.reasonCode, MAPPING_REASON_CODES.CONFLICT);
});
