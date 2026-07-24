"use strict";

const MASS_DEPROVISION_GUARD_EVENT = "scim.mass_deprovision_guard.triggered";
const DEFAULT_GUARD_CONFIG = Object.freeze({
  maxAbsoluteRemovals: 25,
  maxActiveUsersAffectedPercent: 10,
  maxMembershipsAffectedPercent: 10,
  manualApprovalThreshold: 10,
  reactivationCooldownMinutes: 60,
});
const DESTRUCTIVE_OPERATION_TYPES = Object.freeze([
  "user.delete",
  "group.delete",
  "user.active_false",
  "membership.remove",
  "membership.replace",
  "reconciliation.apply",
]);

function asArray(value) { return Array.isArray(value) ? value : []; }
function numberOrDefault(value, fallback) { const n = Number(value); return Number.isFinite(n) && n >= 0 ? n : fallback; }
function percent(count, total) { return total > 0 ? (count / total) * 100 : 0; }
function subjectId(item) { return item?.userId || item?.groupId || item?.subjectId || item?.id || item?.membershipId || null; }
function uniq(values) { return [...new Set(values.filter(Boolean))]; }
function normalizeGuardConfig(config = {}) {
  return Object.freeze({
    maxAbsoluteRemovals: numberOrDefault(config.maxAbsoluteRemovals, DEFAULT_GUARD_CONFIG.maxAbsoluteRemovals),
    maxActiveUsersAffectedPercent: numberOrDefault(config.maxActiveUsersAffectedPercent, DEFAULT_GUARD_CONFIG.maxActiveUsersAffectedPercent),
    maxMembershipsAffectedPercent: numberOrDefault(config.maxMembershipsAffectedPercent, DEFAULT_GUARD_CONFIG.maxMembershipsAffectedPercent),
    manualApprovalThreshold: numberOrDefault(config.manualApprovalThreshold, DEFAULT_GUARD_CONFIG.manualApprovalThreshold),
    reactivationCooldownMinutes: numberOrDefault(config.reactivationCooldownMinutes, DEFAULT_GUARD_CONFIG.reactivationCooldownMinutes),
  });
}

function destructiveItems(plan = {}) {
  return [
    ...asArray(plan.userDeletes).map((item) => ({ ...item, operationType: "user.delete" })),
    ...asArray(plan.groupDeletes).map((item) => ({ ...item, operationType: "group.delete" })),
    ...asArray(plan.activeFalseUsers).map((item) => ({ ...item, operationType: "user.active_false" })),
    ...asArray(plan.membershipRemoves).map((item) => ({ ...item, operationType: "membership.remove" })),
    ...asArray(plan.removes).map((item) => ({ ...item, operationType: item.operationType || "membership.remove" })),
    ...asArray(plan.membershipReplace?.removes).map((item) => ({ ...item, operationType: "membership.replace" })),
  ].filter((item) => DESTRUCTIVE_OPERATION_TYPES.includes(item.operationType));
}

function buildDryRunPlan({ plan = {}, destructive = [], metrics = {}, violations = [], requiresManualApproval = false, cooldownBlocks = [] }) {
  return Object.freeze({
    mode: "dry_run",
    organizationId: plan.organizationId || null,
    connectionId: plan.connectionId || null,
    blocked: violations.length > 0 || cooldownBlocks.length > 0,
    requiresManualApproval,
    destructiveOperationCount: destructive.length,
    affectedSubjects: Object.freeze(destructive.map((item) => Object.freeze({ operationType: item.operationType, subjectId: subjectId(item), userId: item.userId || null, groupId: item.groupId || null, membershipId: item.membershipId || item.assignmentId || null, roleId: item.roleId || null }))),
    metrics: Object.freeze(metrics),
    violations: Object.freeze(violations),
    cooldownBlocks: Object.freeze(cooldownBlocks),
  });
}

function evaluateMassDeprovisionGuard({ plan = {}, guardConfig = {}, currentState = {}, approval = {}, now = new Date() }) {
  const config = normalizeGuardConfig(guardConfig);
  const destructive = destructiveItems(plan);
  const affectedUsers = uniq(destructive.filter((i) => i.userId).map((i) => i.userId));
  const affectedMemberships = destructive.filter((i) => i.operationType === "membership.remove" || i.operationType === "membership.replace").length;
  const metrics = {
    absoluteRemovals: destructive.length,
    affectedActiveUsers: affectedUsers.length,
    activeUsersTotal: Number(currentState.activeUsersTotal || plan.activeUsersTotal || 0),
    affectedActiveUsersPercent: percent(affectedUsers.length, Number(currentState.activeUsersTotal || plan.activeUsersTotal || 0)),
    affectedMemberships,
    membershipsTotal: Number(currentState.membershipsTotal || plan.membershipsTotal || 0),
    affectedMembershipsPercent: percent(affectedMemberships, Number(currentState.membershipsTotal || plan.membershipsTotal || 0)),
  };
  const violations = [];
  if (metrics.absoluteRemovals > config.maxAbsoluteRemovals) violations.push({ guard: "max_absolute_removals", actual: metrics.absoluteRemovals, limit: config.maxAbsoluteRemovals });
  if (metrics.affectedActiveUsersPercent > config.maxActiveUsersAffectedPercent) violations.push({ guard: "max_active_users_affected_percent", actual: metrics.affectedActiveUsersPercent, limit: config.maxActiveUsersAffectedPercent });
  if (metrics.affectedMembershipsPercent > config.maxMembershipsAffectedPercent) violations.push({ guard: "max_memberships_affected_percent", actual: metrics.affectedMembershipsPercent, limit: config.maxMembershipsAffectedPercent });
  const requiresManualApproval = metrics.absoluteRemovals >= config.manualApprovalThreshold;
  if (requiresManualApproval && approval.manualApproval !== true) violations.push({ guard: "manual_approval_threshold", actual: metrics.absoluteRemovals, limit: config.manualApprovalThreshold });
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const cooldownMs = config.reactivationCooldownMinutes * 60 * 1000;
  const cooldownBlocks = destructive.filter((item) => item.reactivatedAt && nowMs - new Date(item.reactivatedAt).getTime() < cooldownMs).map((item) => ({ subjectId: subjectId(item), operationType: item.operationType, reactivatedAt: item.reactivatedAt, cooldownMinutes: config.reactivationCooldownMinutes }));
  const emergencyFailClosedApproved = approval.emergencyFailClosed === true && approval.manualApproval === true;
  const dryRunPlan = buildDryRunPlan({ plan, destructive, metrics, violations, requiresManualApproval, cooldownBlocks });
  return Object.freeze({
    allowed: (violations.length === 0 && cooldownBlocks.length === 0) || emergencyFailClosedApproved,
    preserveExistingAccess: violations.length > 0 && !emergencyFailClosedApproved,
    emergencyFailClosedApproved,
    event: violations.length > 0 || cooldownBlocks.length > 0 ? Object.freeze({ type: MASS_DEPROVISION_GUARD_EVENT, organizationId: plan.organizationId || null, connectionId: plan.connectionId || null, metrics, violations, affectedSubjects: dryRunPlan.affectedSubjects }) : null,
    dryRunPlan,
  });
}

module.exports = { DEFAULT_GUARD_CONFIG, DESTRUCTIVE_OPERATION_TYPES, MASS_DEPROVISION_GUARD_EVENT, normalizeGuardConfig, evaluateMassDeprovisionGuard };
