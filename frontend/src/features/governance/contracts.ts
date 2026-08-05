import type { ActionId, PermissionKey, ScreenId } from "../../authorization/contracts/ids";
import type { VisualDecisionReason } from "../../authorization/contracts/visual-decision";

export type GovernanceSurface = "owner" | "tenant";
export type GovernanceModuleKey = "overview" | "permissions" | "members" | "taxonomy" | "units" | "lms-groups" | "data-scope" | "aliases-navigation" | "access-preview" | "audit" | "identity-provisioning";

export const GOVERNANCE_READ_MODEL_CONTRACT_VERSION = "2026-07-civitas10-governance-read-model-v1" as const;
export const GOVERNANCE_OPERATION_REGISTRY_VERSION = "2026-07-civitas10-governance-operations-v1" as const;

export type GovernanceVersionSummary = {
  catalogVersion: string;
  ceilingVersion?: string;
  activationVersion?: string;
  dataScopeVersion?: string;
  taxonomyVersion?: string;
  unitsVersion?: string;
  visualVersion?: string;
  policyVersion?: string;
  runtimeStatus?: "current" | "pending" | "stale" | "drift";
  readModelVersion?: string;
  operationRegistryVersion?: string;
};

export type PermissionMatrixReasonCode =
  | "allowed"
  | "not_canonical"
  | "ceiling_not_authorized"
  | "activation_disabled"
  | "policy_denied"
  | "delegation_denied"
  | "data_scope_unavailable"
  | "authorization_context_stale"
  | "owning_operation_not_mounted"
  | "not_executable"
  | "runtime_unavailable"
  | "globally_locked"
  | "permission_not_executable"
  | "owner_ceiling_not_authorized"
  | "owner_ceiling_locked"
  | "tenant_activation_disabled";

export type PermissionMatrixReason = {
  code: PermissionMatrixReasonCode;
  sourceVersions: {
    catalogVersion?: string;
    ceilingVersion?: string;
    activationVersion?: string;
    policyVersion?: string;
  };
};


export type GovernanceRoleNameRow = { logtoRoleId: string; logtoRoleName: string; canonicalRoleKey: string; canonicalBaselineLabel: string; civitasDefaultLabel: string; organizationAlias: string | null; effectiveLabel: string; source: "organization_alias" | "civitas_default" | "canonical_baseline"; assignedMemberCount: number; canEditGlobalDefault: boolean; canEditOrganizationAlias: boolean; globalVersion: string; organizationVersion: string; updatedAt: string | null; updatedBy: string | null };
export type GovernanceRoleNamesReadModel = { globalVersion: string; organizationVersion: string; organizationId: string; rows: GovernanceRoleNameRow[]; diagnostics: Array<{ code: string; severity: "info" | "warning" | "error"; message: string }> };

export type GovernanceRoleSummary = { id: string; canonicalKey: string; displayName: string; canonicalBaselineLabel?: string; assignedMemberCount: number; potentialPermissionCount: number; executablePermissionCount: number; ownerAuthorizedPermissionCount: number; tenantEnabledPermissionCount: number };
export type GovernanceMemberSummary = { id: string; display: string; roleIds: string[]; roleAliases: string[]; dataScopeSummary: string; allowedAssignmentActions: string[] };

export type GovernancePermissionMatrixRow = {
  permissionId: PermissionKey;
  roleId: string;
  groupKey: string;
  groupLabel: string;
  groupOrder: number;
  label: string;
  description: string;
  order: number;
  enabled: boolean;
  canChange: boolean;
  rolePotential: true;
  catalogLifecycle: "active" | "planned";
  executable: boolean;
  runtimeAvailable: boolean;
  controlState: "editable" | "not_executable" | "runtime_unavailable" | "blocked_by_owner" | "globally_locked";
  reasonCode: "permission_not_executable" | "owning_operation_not_mounted" | "owner_ceiling_not_authorized" | "owner_ceiling_locked" | "tenant_activation_disabled" | null;
  ownerAllowed: boolean;
  tenantEnabled: boolean;
  effective: boolean;
  policyVersion: string;
};

export type GovernanceTaxonomyItem = { id: string; dimension: string; stableKey?: string; label: string; parentId?: string; status: "draft" | "active" | "deprecating" | "archived"; assignable: boolean; sourceVersion?: string };
export type GovernanceManagementLevel = "organization" | "strategic" | "tactical" | "coordination" | "operational" | "administrative";
export type GovernanceUnitItem = { id: string; label: string; stableKey?: string; unitType?: string; managementLevel?: GovernanceManagementLevel; levelOrder?: number; hierarchyKey?: string; validation?: { state: "valid" | "invalid" | "reconciliation_required"; reasons: string[] }; parentId?: string; status: "draft" | "active" | "archived"; memberCount?: number; relationshipCount?: number; capabilityGroupCount?: number; reconciliationStatus?: string; sourceVersion?: string };
export type GovernanceDataScopeAssignment = { id?: string; principalId: string; membershipId?: string | null; roleId?: string | null; canonicalRoleId?: string | null; scopeTemplateId?: string; scopeTemplateVersion?: string; strategy?: string; targetKind?: "dimension" | "unit" | "resource" | "relationship"; dimensionValueId?: string | null; unitId?: string | null; relationshipKey?: string | null; capability: string; action?: string; scopeType?: string; taxonomyIds: string[]; unitIds: string[]; resourceSummary: string; effective: boolean; source?: string; reason: string; unresolvedReason?: string | null; sourceVersion?: string; changedBy?: string; changedAt?: string };
export type GovernanceAliasNavigationPolicy = { aliasesTenantEditable: boolean; navigationTenantEditable: boolean; aliases?: Array<{ roleId: string; canonicalKey: string; displayName: string; editableBy?: "owner" | "tenant"; defaultLabel?: string; description?: string; status?: "active" | "deprecated" | "planned"; updatedAt?: string; lastChangedAt?: string }>; visualPreferences: Array<{ screenId: ScreenId; canonicalLabel?: string; routeId?: string; hidden?: boolean; order?: number; locked: boolean; hideable?: boolean; authorizationEffect?: "presentation_only" }> ; version?: string; updatedAt?: string };
export type GovernanceAccessPreview = { contractVersion?: string; generatedAt?: string; organizationId?: string; surface?: GovernanceSurface; subjectId: string; actionId?: ActionId; screenId?: ScreenId; decision: { allowed: boolean; reason: VisualDecisionReason | PermissionMatrixReasonCode | string; sourceVersions: PermissionMatrixReason["sourceVersions"] & { visualVersion?: string; readModelVersion?: string } }; provenance?: unknown; diagnostics?: unknown; mutated?: false };
export type IdentityFederationReadStatus = "not_configured" | "active" | "degraded" | "suspended" | "credentials_expiring" | "reconciliation_required";
export type GovernanceIdentityProvisioningSummary = { status: IdentityFederationReadStatus; connectionId?: string | null; protocol?: "oidc" | "saml" | null; providerKind?: string | null; claimsContractVersion?: number; mappingVersion?: number; provisioningPolicyVersion?: number; lastValidatedAt?: string | null; lastSuccessfulLoginAt?: string | null; credentialExpiresAt?: string | null; latestReconciliationRunId?: string | null; latestReconciliationStatus?: string | null; driftItemCount?: number; reason?: string };
export type GovernanceAuditEvent = { id: string; actorId: string; organizationId: string; target: string; targetType?: string; targetId?: string | null; action: string; before?: unknown; after?: unknown; result?: string; reason: string; contractVersion: string; createdAt: string };

export type GovernanceModuleStatus = "active" | "planned" | "unavailable" | "denied" | "stale" | "error" | "ready" | "pending" | "blocked";
export type GovernanceReadModel = {
  contractVersion?: typeof GOVERNANCE_READ_MODEL_CONTRACT_VERSION;
  generatedAt?: string;
  organization?: { logtoOrganizationId: string | null; name?: string | null; surface?: GovernanceSurface };
  organizationId: string;
  organizationName?: string | null;
  surface: GovernanceSurface;
  versions: GovernanceVersionSummary;
  runtimeStatus?: "current" | "pending" | "stale" | "drift";
  modules: Partial<Record<GovernanceModuleKey, { status: GovernanceModuleStatus; reason?: string; dependencyVersions?: GovernanceVersionSummary }>>;
  roles?: GovernanceRoleSummary[];
  members?: GovernanceMemberSummary[];
  operationRegistry?: { registryVersion: string; operations: Array<Record<string, unknown>> };
  moduleInventory?: Array<Record<string, unknown>>;
  summary?: Record<string, unknown>;
  permissionMatrix: GovernancePermissionMatrixRow[];
  taxonomy: GovernanceTaxonomyItem[];
  units: GovernanceUnitItem[];
  dataScopes: GovernanceDataScopeAssignment[];
  aliasesNavigation: GovernanceAliasNavigationPolicy;
  roleNames?: GovernanceRoleNamesReadModel;
  accessPreviews: GovernanceAccessPreview[];
  identityProvisioning?: GovernanceIdentityProvisioningSummary;
  auditSummary?: Record<string, unknown>;
  auditEvents: GovernanceAuditEvent[];
  diagnostics: Array<string | { code: string; severity?: string; message?: string }>;
};

export type GovernanceAccessPreviewRequest = { organizationId: string; surface: GovernanceSurface; subjectId: string; actionId?: ActionId; screenId?: ScreenId };


const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const fail = (path: string, version: string | null, reason: string) => ({ ok: false as const, path, version, reason });
export type GovernanceContractValidation = { ok: true; value: GovernanceReadModel } | { ok: false; path: string; version: string | null; reason: string };

export const validateGovernanceReadModel = (value: unknown): GovernanceContractValidation => {
  const version = isRecord(value) && typeof value.contractVersion === "string" ? value.contractVersion : null;
  if (!isRecord(value)) return fail("$", version, "response must be an object");
  if (value.contractVersion !== GOVERNANCE_READ_MODEL_CONTRACT_VERSION) return fail("$.contractVersion", version, `unsupported contract version; expected ${GOVERNANCE_READ_MODEL_CONTRACT_VERSION}`);
  if (typeof value.generatedAt !== "string") return fail("$.generatedAt", version, "generatedAt must be a string");
  if (!isRecord(value.organization)) return fail("$.organization", version, "organization must be an object");
  if (value.surface !== "owner" && value.surface !== "tenant") return fail("$.surface", version, "surface must be owner or tenant");
  if (!isRecord(value.versions)) return fail("$.versions", version, "versions must be an object");
  if (typeof value.versions.catalogVersion !== "string") return fail("$.versions.catalogVersion", version, "catalogVersion must be a string");
  if (!["current", "pending", "stale", "drift"].includes(String(value.runtimeStatus))) return fail("$.runtimeStatus", version, "runtimeStatus must be current, pending, stale or drift");
  if (!isRecord(value.modules)) return fail("$.modules", version, "modules must be an object");
  if (!isRecord(value.operationRegistry)) return fail("$.operationRegistry", version, "operationRegistry must be an object");
  if (!Array.isArray(value.operationRegistry.operations)) return fail("$.operationRegistry.operations", version, "operationRegistry.operations must be an array");
  for (const [key, module] of Object.entries(value.modules)) {
    if (!isRecord(module)) return fail(`$.modules.${key}`, version, "module must be an object");
    if (!["active", "planned", "unavailable", "denied", "stale", "error", "ready", "pending", "blocked"].includes(String(module.status))) return fail(`$.modules.${key}.status`, version, "module status is invalid");
    if (module.reason !== undefined && typeof module.reason !== "string") return fail(`$.modules.${key}.reason`, version, "module reason must be a string");
  }
  if (value.roles !== undefined && !Array.isArray(value.roles)) return fail("$.roles", version, "roles must be an array");
  if (value.members !== undefined && !Array.isArray(value.members)) return fail("$.members", version, "members must be an array");
  const permissionMatrix = value.permissionMatrix;
  if (!Array.isArray(permissionMatrix)) return fail("$.permissionMatrix", version, "permissionMatrix must be an array");
  for (const [index, row] of permissionMatrix.entries()) {
    if (!isRecord(row)) return fail(`$.permissionMatrix[${index}]`, version, "permission matrix row must be an object");
    for (const key of ["permissionId", "roleId", "groupKey", "groupLabel", "label", "description", "controlState", "policyVersion"] as const) if (typeof row[key] !== "string") return fail(`$.permissionMatrix[${index}].${key}`, version, `${key} must be a string`);
    for (const key of ["groupOrder", "order"] as const) if (typeof row[key] !== "number") return fail(`$.permissionMatrix[${index}].${key}`, version, `${key} must be a number`);
    for (const key of ["enabled", "canChange", "rolePotential", "executable", "runtimeAvailable", "ownerAllowed", "tenantEnabled", "effective"] as const) if (typeof row[key] !== "boolean") return fail(`$.permissionMatrix[${index}].${key}`, version, `${key} must be a boolean`);
    if (!["active", "planned"].includes(String(row.catalogLifecycle))) return fail(`$.permissionMatrix[${index}].catalogLifecycle`, version, "catalogLifecycle must be active or planned");
    if (!["editable", "not_executable", "runtime_unavailable", "blocked_by_owner", "globally_locked"].includes(String(row.controlState))) return fail(`$.permissionMatrix[${index}].controlState`, version, "controlState is invalid");
    if (row.reasonCode !== null && !["permission_not_executable", "owning_operation_not_mounted", "owner_ceiling_not_authorized", "owner_ceiling_locked", "tenant_activation_disabled"].includes(String(row.reasonCode))) return fail(`$.permissionMatrix[${index}].reasonCode`, version, "reasonCode is invalid");
  }
  for (const key of ["taxonomy", "units", "dataScopes", "accessPreviews", "auditEvents", "diagnostics"] as const) if (!Array.isArray(value[key])) return fail(`$.${key}`, version, `${key} must be an array`);
  if (!isRecord(value.aliasesNavigation)) return fail("$.aliasesNavigation", version, "aliasesNavigation must be an object");
  if (value.roleNames !== undefined && !isRecord(value.roleNames)) return fail("$.roleNames", version, "roleNames must be an object");
  if (isRecord(value.roleNames) && !Array.isArray(value.roleNames.rows)) return fail("$.roleNames.rows", version, "roleNames.rows must be an array");
  return { ok: true, value: value as GovernanceReadModel };
};
