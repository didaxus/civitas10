"use strict";

const { TRANSLATION_RULES } = require("./scopeCandidateResolver");
const { DATA_SCOPE_STRATEGY_REGISTRY } = require("../authorization/data-scope/dataScopeStrategyRegistry");

const PROJECTION_CONTRACT_REASON_CODES = Object.freeze({
  MEMBERSHIP_NOT_FOUND: "organization_membership_not_found",
  MEMBERSHIP_MISMATCH: "organization_membership_mismatch",
  ROLE_BINDING_NOT_FOUND: "canonical_role_binding_not_found",
  ROLE_NOT_ALLOWED: "scope_projection_role_not_allowed",
  TEMPLATE_NOT_FOUND: "scope_template_not_found",
  STRATEGY_MISMATCH: "scope_template_strategy_mismatch",
  SNAPSHOT_STALE: "scope_projection_snapshot_stale",
  RESOLVER_UNAVAILABLE: "scope_projection_contract_resolver_unavailable",
});

function fail(code) { throw Object.assign(new Error(code), { code }); }
function targetAllowed(template, target) {
  return template.allowedTargetKinds.includes(target.kind)
    && (!target.dimensionKey || template.allowedDimensionKeys.includes(target.dimensionKey))
    && (!target.relationshipKey || template.allowedRelationshipKeys.includes(target.relationshipKey));
}

function createScopeProjectionContractResolver({ membershipBindingPort, canonicalRoleBindingPort, scopeTemplateRegistry, strategyRegistry = DATA_SCOPE_STRATEGY_REGISTRY, snapshotPort } = {}) {
  async function resolve(candidate) {
    if (!membershipBindingPort?.resolveOrganizationMembership || !canonicalRoleBindingPort?.resolveCanonicalRole || !scopeTemplateRegistry?.listPublishedTemplates || !snapshotPort?.getCurrentSnapshotVersion) fail(PROJECTION_CONTRACT_REASON_CODES.RESOLVER_UNAVAILABLE);
    const membership = await membershipBindingPort.resolveOrganizationMembership({ organizationId: candidate.organizationId, subjectId: candidate.subjectId, logtoRoleId: candidate.logtoRoleId });
    if (!membership?.membershipId || membership.status !== "active") fail(PROJECTION_CONTRACT_REASON_CODES.MEMBERSHIP_NOT_FOUND);
    if (membership.organizationId !== candidate.organizationId || membership.subjectId !== candidate.subjectId || !membership.logtoRoleIds?.includes(candidate.logtoRoleId)) fail(PROJECTION_CONTRACT_REASON_CODES.MEMBERSHIP_MISMATCH);
    const roleBinding = await canonicalRoleBindingPort.resolveCanonicalRole({ organizationId: candidate.organizationId, subjectId: candidate.subjectId, membershipId: membership.membershipId, logtoRoleId: candidate.logtoRoleId });
    if (!roleBinding?.canonicalRoleId || roleBinding.status !== "active" || roleBinding.organizationId !== candidate.organizationId || roleBinding.subjectId !== candidate.subjectId || roleBinding.membershipId !== membership.membershipId || roleBinding.logtoRoleId !== candidate.logtoRoleId) fail(PROJECTION_CONTRACT_REASON_CODES.ROLE_BINDING_NOT_FOUND);
    const rule = TRANSLATION_RULES[candidate.translation?.ruleId];
    if (!rule?.allowedCanonicalRoleIds?.includes(roleBinding.canonicalRoleId)) fail(PROJECTION_CONTRACT_REASON_CODES.ROLE_NOT_ALLOWED);
    const compatible = scopeTemplateRegistry.listPublishedTemplates().filter((template) => { const lookup = { organizationId: candidate.organizationId, scopeTemplateId: template.id, scopeTemplateVersion: template.version }; return template.lifecycle === "published" && template.capability === candidate.capability && template.allowedRoleKeys.includes(roleBinding.canonicalRoleId) && targetAllowed(template, candidate.target) && scopeTemplateRegistry.isAvailable(lookup) && scopeTemplateRegistry.getTenantConfiguration(lookup)?.enabled === true; });
    if (compatible.length !== 1) fail(PROJECTION_CONTRACT_REASON_CODES.TEMPLATE_NOT_FOUND);
    const template = compatible[0];
    const strategy = strategyRegistry[template.strategyId];
    if (!strategy || (strategy.strategyId && strategy.strategyId !== template.strategyId)) fail(PROJECTION_CONTRACT_REASON_CODES.STRATEGY_MISMATCH);
    const snapshotVersion = await snapshotPort.getCurrentSnapshotVersion({ organizationId: candidate.organizationId });
    if (snapshotVersion === undefined || snapshotVersion === null || snapshotVersion === "" || (snapshotPort.isCurrent && !(await snapshotPort.isCurrent({ organizationId: candidate.organizationId, snapshotVersion })))) fail(PROJECTION_CONTRACT_REASON_CODES.SNAPSHOT_STALE);
    return Object.freeze({ membershipId: membership.membershipId, canonicalRoleId: roleBinding.canonicalRoleId, scopeTemplateId: template.id, scopeTemplateVersion: template.version, strategyId: template.strategyId, snapshotVersion: String(snapshotVersion) });
  }
  return Object.freeze({ resolve });
}

module.exports = { createScopeProjectionContractResolver, PROJECTION_CONTRACT_REASON_CODES };
