"use strict";
const { CANONICAL_DIMENSION_IDS } = require("../../backend/taxonomy/taxonomyDimensionRegistry");
const { getSelector } = require("./selector-registry.cjs");
const { MAPPING_REASON_CODES } = require("./reason-codes.cjs");

const OUTCOMES = Object.freeze({ MATCHED: "matched", NOT_MATCHED: "not_matched", AMBIGUOUS: "ambiguous", INCOMPATIBLE: "incompatible" });
const FORBIDDEN_OUTPUT_KEYS = /(role|permission|scope|activation|ceiling|membership|authorization_scope_assignment|organizationWide|token)/i;
function readPath(object, path) { return String(path || "").split(".").filter(Boolean).reduce((value, key) => value == null ? undefined : value[key], object); }
function valuesEqual(actual, expected) { return Array.isArray(actual) ? actual.map(String).includes(String(expected)) : String(actual) === String(expected); }
function evaluateCondition(condition, facts) {
  const selector = getSelector(condition.selectorId);
  if (!selector) return { outcome: OUTCOMES.INCOMPATIBLE, reasonCode: MAPPING_REASON_CODES.SELECTOR_UNKNOWN };
  const actual = selector.parameterized ? readPath(facts, `${selector.factPath}.${condition.claim}`) : readPath(facts, selector.factPath);
  if (actual == null) return { outcome: OUTCOMES.NOT_MATCHED, reasonCode: MAPPING_REASON_CODES.NOT_MATCHED };
  if (condition.operator === "equals") return { outcome: valuesEqual(actual, condition.value) ? OUTCOMES.MATCHED : OUTCOMES.NOT_MATCHED, reasonCode: valuesEqual(actual, condition.value) ? MAPPING_REASON_CODES.MATCHED : MAPPING_REASON_CODES.NOT_MATCHED };
  if (condition.operator === "in") return { outcome: (condition.values || []).some((value) => valuesEqual(actual, value)) ? OUTCOMES.MATCHED : OUTCOMES.NOT_MATCHED, reasonCode: MAPPING_REASON_CODES.MATCHED };
  return { outcome: OUTCOMES.INCOMPATIBLE, reasonCode: MAPPING_REASON_CODES.UNSUPPORTED_OPERATOR };
}
function validateRule(rule) {
  if (!CANONICAL_DIMENSION_IDS.includes(rule.target?.dimensionId)) return { ok: false, reasonCode: MAPPING_REASON_CODES.DIMENSION_UNKNOWN };
  for (const key of Object.keys(rule.target || {})) if (FORBIDDEN_OUTPUT_KEYS.test(key)) return { ok: false, reasonCode: MAPPING_REASON_CODES.UNSAFE_GRANT_FIELD };
  return { ok: true };
}
function ruleSpecificity(rule) { return (rule.conditions || []).reduce((sum, c) => sum + (getSelector(c.selectorId)?.specificity || 0), 0) + (rule.specificity || 0); }
function evaluateRule(rule, context) {
  const valid = validateRule(rule);
  if (!valid.ok) return { ruleId: rule.ruleId, outcome: OUTCOMES.INCOMPATIBLE, reasonCode: valid.reasonCode };
  if (rule.tenantId && rule.tenantId !== context.organizationId) return { ruleId: rule.ruleId, outcome: OUTCOMES.INCOMPATIBLE, reasonCode: MAPPING_REASON_CODES.TENANT_MISMATCH };
  const conditionResults = (rule.conditions || []).map((condition) => evaluateCondition(condition, context.facts || {}));
  if (conditionResults.some((r) => r.outcome === OUTCOMES.INCOMPATIBLE)) return { ruleId: rule.ruleId, outcome: OUTCOMES.INCOMPATIBLE, reasonCode: conditionResults.find((r) => r.outcome === OUTCOMES.INCOMPATIBLE).reasonCode };
  if (conditionResults.every((r) => r.outcome === OUTCOMES.MATCHED)) return { ruleId: rule.ruleId, outcome: OUTCOMES.MATCHED, reasonCode: MAPPING_REASON_CODES.MATCHED, target: Object.freeze({ ...rule.target }), authority: rule.authority || "tenant", precedence: rule.precedence || 0, specificity: ruleSpecificity(rule) };
  return { ruleId: rule.ruleId, outcome: OUTCOMES.NOT_MATCHED, reasonCode: MAPPING_REASON_CODES.NOT_MATCHED };
}
function selectWinner(matches) {
  const sorted = [...matches].sort((a, b) => (b.authority === "tenant" ? 1 : 0) - (a.authority === "tenant" ? 1 : 0) || b.precedence - a.precedence || b.specificity - a.specificity || a.ruleId.localeCompare(b.ruleId));
  const [winner, runnerUp] = sorted;
  if (runnerUp && winner.authority === runnerUp.authority && winner.precedence === runnerUp.precedence && winner.specificity === runnerUp.specificity && JSON.stringify(winner.target) !== JSON.stringify(runnerUp.target)) {
    return { outcome: OUTCOMES.AMBIGUOUS, reasonCode: MAPPING_REASON_CODES.CONFLICT, conflicts: [winner.ruleId, runnerUp.ruleId] };
  }
  return { outcome: OUTCOMES.MATCHED, reasonCode: MAPPING_REASON_CODES.MATCHED, candidate: winner };
}
function evaluateMappingPolicy(policy, context = {}) {
  if (!context.facts?.claimsComplete) return Object.freeze({ outcome: OUTCOMES.AMBIGUOUS, reasonCode: MAPPING_REASON_CODES.INCOMPLETE_FACTS, candidates: [] });
  if (context.facts?.tenantId && context.organizationId && context.facts.tenantId !== context.organizationId) return Object.freeze({ outcome: OUTCOMES.INCOMPATIBLE, reasonCode: MAPPING_REASON_CODES.TENANT_MISMATCH, candidates: [] });
  const results = (policy.rules || []).map((rule) => evaluateRule(rule, context));
  const incompatible = results.find((r) => r.outcome === OUTCOMES.INCOMPATIBLE);
  if (incompatible) return Object.freeze({ outcome: OUTCOMES.INCOMPATIBLE, reasonCode: incompatible.reasonCode, candidates: [], ruleResults: Object.freeze(results) });
  const matches = results.filter((r) => r.outcome === OUTCOMES.MATCHED);
  if (!matches.length) return Object.freeze({ outcome: OUTCOMES.NOT_MATCHED, reasonCode: MAPPING_REASON_CODES.NOT_MATCHED, candidates: [], ruleResults: Object.freeze(results) });
  const selected = selectWinner(matches);
  return Object.freeze({ ...selected, candidates: Object.freeze(matches), ruleResults: Object.freeze(results) });
}
module.exports = { OUTCOMES, evaluateCondition, evaluateRule, evaluateMappingPolicy, selectWinner, MAPPING_REASON_CODES };
