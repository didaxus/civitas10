"use strict";

const ACTION_REGISTRY_VERSION = "2026-08-civitas-organization-mapping-actions-v1";
const future = (label) => ({ placeholder: true, label });
const action = (actionId, requiredPermission, overrides = {}) => Object.freeze({
  actionId,
  surface: "organization-mapping",
  method: overrides.method || null,
  endpoint: overrides.endpoint || null,
  futureContract: overrides.futureContract || null,
  requiredPermission,
  ownerCeiling: overrides.ownerCeiling || "required",
  tenantActivation: overrides.tenantActivation || "required",
  abacBehavior: overrides.abacBehavior || "tenant-boundary-and-draft-version-match-fail-closed",
  runtimeDependency: overrides.runtimeDependency || "backend-authorization-runtime-current-snapshot",
  evidenceClassification: overrides.evidenceClassification || "metadata",
  allowedUiTreatment: overrides.allowedUiTreatment || "backend-decision-only-no-frontend-registry",
  riskClassification: overrides.riskClassification || "standard",
  auditRequirement: overrides.auditRequirement || "decision-and-result",
  reasonRequirement: overrides.reasonRequirement || "optional",
  idempotencyRequirement: overrides.idempotencyRequirement || "not-required",
});
const organizationMappingLifecycleActions = Object.freeze([
  action("organizationModel.readPublished", "org.orgmodel.read", { method: "GET", endpoint: "/o/{organizationId}/organization-model/published" }),
  action("organizationModel.readDraft", "org.orgmodel_draft.read", { futureContract: future("draft read endpoint") }),
  action("organizationModel.editDraft", "org.orgmodel_draft.manage", { futureContract: future("create or edit draft endpoint"), riskClassification: "elevated", auditRequirement: "full-diff", reasonRequirement: "required", idempotencyRequirement: "required-for-create" }),
  action("organizationModel.evaluateMappingPolicies", "org.orgmodel_mapping.evaluate", { futureContract: future("dry-run evaluation endpoint"), evidenceClassification: "derived-evidence", auditRequirement: "request-and-redacted-result" }),
  action("organizationModel.readSensitiveMappingEvidence", "org.orgmodel_evidence.read", { futureContract: future("sensitive evidence endpoint"), evidenceClassification: "sensitive-external-facts", allowedUiTreatment: "redacted-by-default", riskClassification: "high", auditRequirement: "who-what-when-why", reasonRequirement: "required" }),
  action("organizationModel.approveMapping", "org.orgmodel_mapping.approve", { futureContract: future("approve or reject endpoint"), riskClassification: "high", auditRequirement: "immutable-approval-event", reasonRequirement: "required", idempotencyRequirement: "required" }),
  action("organizationModel.publishVersion", "org.orgmodel.publish", { futureContract: future("exact version publication endpoint"), riskClassification: "critical", auditRequirement: "immutable-publication-event", reasonRequirement: "required", idempotencyRequirement: "required" }),
  action("organizationModel.reconcileUpstream", "org.orgmodel.reconcile", { futureContract: future("upstream reconciliation endpoint"), evidenceClassification: "external-facts", riskClassification: "elevated", auditRequirement: "reconciliation-summary", idempotencyRequirement: "required" }),
  action("organizationModel.inspectAuditHistory", "org.orgmodel_audit.read", { futureContract: future("audit history endpoint"), evidenceClassification: "audit", allowedUiTreatment: "redacted-audit-view" }),
  action("organizationModel.createRollbackDraft", "org.orgmodel_rollback.create", { futureContract: future("rollback draft from immutable version endpoint"), riskClassification: "critical", auditRequirement: "rollback-source-version-and-diff", reasonRequirement: "required", idempotencyRequirement: "required" }),
]);
module.exports = { ACTION_REGISTRY_VERSION, organizationMappingLifecycleActions };
