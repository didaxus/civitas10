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
  const result = evaluateMappingPolicy({ rules: [{ ruleId: "r1", tenantId: "org_a", conditions: [{ selectorId: "scim.group", operator: "equals", value: "g-teachers" }], target: { dimensionId: "academic.department", valueStableKey: "math" } }] }, { organizationId: "org_a", facts });
  assert.equal(result.outcome, OUTCOMES.MATCHED);
  assert.deepEqual(result.candidate.outcome, { type: "map_to_existing_canonical_value", dimensionId: "academic.department", valueStableKey: "math" });
});

test("incomplete, cross-tenant, and grant-shaped states fail closed", () => {
  assert.equal(evaluateMappingPolicy({ rules: [] }, { organizationId: "org_a", facts: { ...facts, claimsComplete: false } }).outcome, OUTCOMES.AMBIGUOUS);
  assert.equal(evaluateMappingPolicy({ rules: [] }, { organizationId: "org_b", facts }).reasonCode, MAPPING_REASON_CODES.TENANT_MISMATCH);
  const unsafe = evaluateMappingPolicy({ rules: [{ ruleId: "unsafe", conditions: [{ selectorId: "scim.group", operator: "equals", value: "g-teachers" }], target: { dimensionId: "academic.stage", canonicalRoleName: "organization_admin" } }] }, { organizationId: "org_a", facts });
  assert.equal(unsafe.outcome, OUTCOMES.AMBIGUOUS);
  assert.equal(unsafe.reasonCode, MAPPING_REASON_CODES.UNSAFE_GRANT_FIELD);
});

test("authority, precedence, specificity, and conflicts are deterministic", () => {
  const baseRule = { conditions: [{ selectorId: "scim.group", operator: "equals", value: "g-teachers" }], target: { dimensionId: "academic.stage", valueStableKey: "secondary" } };
  const selected = evaluateMappingPolicy({ rules: [{ ...baseRule, ruleId: "global", authority: "connection_mapping_policy", precedence: 100 }, { ...baseRule, ruleId: "tenant", authority: "explicit_reviewed_mapping", precedence: 1, target: { dimensionId: "academic.stage", valueStableKey: "tenant-secondary" } }] }, { organizationId: "org_a", facts });
  assert.equal(selected.candidate.ruleId, "tenant");
  const conflict = evaluateMappingPolicy({ rules: [{ ...baseRule, ruleId: "a", authority: "explicit_reviewed_mapping" }, { ...baseRule, ruleId: "b", authority: "explicit_reviewed_mapping", target: { dimensionId: "academic.stage", valueStableKey: "other" } }] }, { organizationId: "org_a", facts });
  assert.equal(conflict.outcome, OUTCOMES.AMBIGUOUS);
  assert.equal(conflict.reasonCode, "mapping_outcome_conflict");
});
