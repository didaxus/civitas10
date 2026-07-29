"use strict";

const crypto = require("node:crypto");

const AGGREGATE_VERSION = "authorization-explanation/v2";

function unavailable(name) { return { available: false, source: null, reason: `${name}_not_available` }; }
function firstFailure(checks) { return checks.find((check) => check.passed !== true)?.reasonCode || "authorization_allowed"; }
function pathKey(path) { return `${path.membershipId || ""}\u0000${path.canonicalRoleId || ""}`; }
function safePath(path) {
  return { rolePathId: path.rolePathId, membershipId: path.membershipId, canonicalRoleId: path.canonicalRoleId, logtoRoleId: path.logtoRoleId };
}

/** Read-only query over the same entitlement and data-scope evaluators used by enforcement. */
class AuthorizationExplainabilityQuery {
  constructor({ entitlementEvaluator, dataScopeEvaluator, diagnosticAuthorizer, subjectResolver, resourceResolver, snapshotStore, versions = {} } = {}) {
    this.entitlementEvaluator = entitlementEvaluator;
    this.dataScopeEvaluator = dataScopeEvaluator;
    this.diagnosticAuthorizer = diagnosticAuthorizer;
    this.subjectResolver = subjectResolver;
    this.resourceResolver = resourceResolver;
    this.snapshotStore = snapshotStore;
    this.versions = versions;
  }

  async execute(input = {}) {
    if (input.decisionId) return this.#historical(input);
    if (input.snapshot) throw Object.assign(new Error("immutable_snapshot_requires_decision_id"), { code: "immutable_snapshot_requires_decision_id", status: 400 });
    const diagnostic = await this.diagnosticAuthorizer?.(input);
    if (diagnostic?.allowed !== true) throw Object.assign(new Error("diagnostic_not_authorized"), { code: "diagnostic_not_authorized", status: 404 });

    // Deliberately resolve protected subjects/resources only after diagnostic authorization.
    const subject = await this.subjectResolver?.(input);
    if (!subject || subject.organizationId !== input.organizationId) throw Object.assign(new Error("diagnostic_target_not_disclosed"), { code: "diagnostic_target_not_disclosed", status: 404 });
    const resource = input.resourceRef ? await this.resourceResolver?.(input) : undefined;
    if (input.resourceRef && (!resource || resource.organizationId !== input.organizationId)) throw Object.assign(new Error("diagnostic_target_not_disclosed"), { code: "diagnostic_target_not_disclosed", status: 404 });

    const rolePaths = (subject.rolePaths || []).map(safePath);
    const seen = new Set();
    for (const path of rolePaths) {
      if (!path.membershipId || !path.canonicalRoleId || seen.has(path.rolePathId)) throw Object.assign(new Error("role_path_identity_invalid"), { code: "role_path_identity_invalid", status: 409 });
      seen.add(path.rolePathId);
    }
    const entitlement = await this.entitlementEvaluator({ ...input, subject: subject.subject, tokenScopes: subject.scopes, rolePaths });
    const scope = await this.dataScopeEvaluator({ ...input, principal: { ...subject, rolePaths }, resource });
    const scopeByPath = new Map((scope.rolePaths || []).map((path) => [path.rolePathId, path]));
    const matrix = (entitlement.evaluatedRolePaths || []).map((entry) => {
      const identity = rolePaths.find((path) => path.rolePathId === entry.rolePathId);
      const scoped = scopeByPath.get(entry.rolePathId);
      const identityMatches = identity && scoped && pathKey(identity) === pathKey(scoped);
      const checks = [
        { layer: "rbac_owner_tenant", passed: entry.allowed === true, reasonCode: entry.reasonCode },
        { layer: "abac_data_scope", passed: identityMatches && scoped.allowed === true, reasonCode: identityMatches ? scoped.reasonCode : "role_path_identity_mismatch" },
      ];
      return { ...identity, allowed: checks.every((check) => check.passed), firstDecisiveReason: firstFailure(checks), checks, sources: { entitlement: entry.source || unavailable("entitlement"), dataScope: scoped?.source || unavailable("data_scope") } };
    });
    const selected = matrix.find((path) => path.allowed) || matrix[0];
    const allowed = Boolean(matrix.find((path) => path.allowed));
    const aggregate = {
      aggregateVersion: AGGREGATE_VERSION,
      queryMode: "current",
      decisionId: input.generatedDecisionId || `explain_${crypto.randomUUID()}`,
      organizationId: input.organizationId,
      subjectId: subject.displaySubjectId || subject.subject,
      permission: input.permission,
      summary: { allowed, firstDecisiveReason: allowed ? "authorization_allowed" : (selected?.firstDecisiveReason || "role_path_missing"), selectedRolePathId: selected?.rolePathId || null },
      rolePathMatrix: matrix,
      selectedDependencyGraph: selected ? { rolePathId: selected.rolePathId, membershipId: selected.membershipId, canonicalRoleId: selected.canonicalRoleId, nodes: selected.checks.map((check, index) => ({ id: `${selected.rolePathId}:${index}`, ...check })), edges: selected.checks.slice(1).map((_check, index) => ({ from: `${selected.rolePathId}:${index}`, to: `${selected.rolePathId}:${index + 1}` })) } : null,
      versions: { catalog: this.versions.catalog || unavailable("catalog_version"), policy: entitlement.policyVersion || this.versions.policy || unavailable("policy_version"), scopes: scope.version || this.versions.scopes || unavailable("scope_version"), structure: this.versions.structure || unavailable("structure_version") },
      provenance: { subject: subject.source || unavailable("subject"), resource: resource ? (resource.source || unavailable("resource")) : { available: false, source: null, reason: "resource_not_requested" } },
      mutated: false,
    };
    await this.snapshotStore?.save?.(aggregate.decisionId, structuredClone(aggregate));
    return Object.freeze(aggregate);
  }

  async #historical(input) {
    const diagnostic = await this.diagnosticAuthorizer?.(input);
    if (diagnostic?.allowed !== true) throw Object.assign(new Error("diagnostic_not_authorized"), { code: "diagnostic_not_authorized", status: 404 });
    const snapshot = await this.snapshotStore?.get?.(input.decisionId);
    if (!snapshot || snapshot.organizationId !== input.organizationId) throw Object.assign(new Error("decision_not_disclosed"), { code: "decision_not_disclosed", status: 404 });
    return Object.freeze({ ...structuredClone(snapshot), queryMode: "historical" });
  }
}

module.exports = { AuthorizationExplainabilityQuery, AGGREGATE_VERSION };
