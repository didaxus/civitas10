import { IconBuilding, IconClipboardCheck, IconDatabase, IconEyeCheck, IconListDetails, IconRoute, IconScale, IconSitemap, IconUsersGroup, IconUserCog, type Icon } from "@tabler/icons-react";
import { appRoutes } from "../../navigation/routes";
import type { GovernanceModuleKey, GovernanceSurface } from "./contracts";
import { governanceOperationStatus, type GovernanceEffectiveStatus } from "./governance-capabilities";

export type GovernanceWorkspaceItemId =
  | "organization-overview"
  | "operations"
  | "role-permissions"
  | "role-names"
  | "scope-assignments"
  | "structure-classification"
  | "groups-courses"
  | "people-segmentation"
  | "access-explorer"
  | "audit-log"
  | "identity-provisioning";

export type GovernanceWorkspaceGroupId = "operations" | "access-policy" | "organization-model" | "control-evidence";

export type GovernanceWorkspaceItem = {
  id: GovernanceWorkspaceItemId;
  label: string;
  routeKey: keyof typeof appRoutes;
  tenantTab: string;
  moduleKey: GovernanceModuleKey | "unavailable" | "organization-overview" | "operations";
  ownerPermissionRequirement: { mode: "all" | "any"; permissions: string[] };
  tenantPermissionRequirement: { mode: "all" | "any"; permissions: string[] };
  actionId: string;
  entity: string;
  sourceOfTruth: string;
  declaredState: "planned" | "read-only" | "preview" | "unavailable" | "active";
  readOperation?: string;
  writeOperations: string[];
  icon: Icon;
};

export type GovernanceWorkspaceGroup = {
  id: GovernanceWorkspaceGroupId;
  label: string;
  items: GovernanceWorkspaceItem[];
};

export const GOVERNANCE_WORKSPACE_GROUPS: GovernanceWorkspaceGroup[] = [
  {
    id: "operations",
    label: "Operations",
    items: [
      { id: "organization-overview", label: "Overview", routeKey: "ownerOrganizationState", tenantTab: "overview", moduleKey: "organization-overview", ownerPermissionRequirement: { mode: "all", permissions: ["owner.profile.read"] }, tenantPermissionRequirement: { mode: "all", permissions: [] }, actionId: "organization.overview.view", entity: "owner organization operational summary", sourceOfTruth: "owner operational read model", declaredState: "read-only", readOperation: "governance.readModel", writeOperations: [], icon: IconBuilding },
      { id: "operations", label: "Operations", routeKey: "ownerOrganizationOperations", tenantTab: "operations", moduleKey: "operations", ownerPermissionRequirement: { mode: "all", permissions: ["owner.profile.read"] }, tenantPermissionRequirement: { mode: "all", permissions: [] }, actionId: "organization.operations.view", entity: "owner organization capabilities", sourceOfTruth: "owner operational read model", declaredState: "read-only", readOperation: "governance.readModel", writeOperations: [], icon: IconClipboardCheck },
    ],
  },
  {
    id: "access-policy",
    label: "Access policy",
    items: [
      { id: "role-permissions", label: "Role permissions", routeKey: "ownerOrganizationGovernanceRoles", tenantTab: "role-permissions", moduleKey: "permissions", ownerPermissionRequirement: { mode: "all", permissions: ["owner.runtime.operations.execute"] }, tenantPermissionRequirement: { mode: "all", permissions: ["org.documents.create"] }, actionId: "governance.rolePermissions.view", entity: "org_role_entitlement_limits", sourceOfTruth: "durable governance read model", declaredState: "active", readOperation: "governance.readModel", writeOperations: ["governance.entitlementCeilings", "governance.roleActivations"], icon: IconScale },
      { id: "role-names", label: "Role names", routeKey: "ownerOrganizationGovernanceRoleNames", tenantTab: "role-names", moduleKey: "aliases-navigation", ownerPermissionRequirement: { mode: "all", permissions: ["owner.runtime.operations.execute"] }, tenantPermissionRequirement: { mode: "all", permissions: ["org.documents.create"] }, actionId: "governance.roleNames.view", entity: "tenant role aliases", sourceOfTruth: "durable governance read model", declaredState: "read-only", readOperation: "governance.readModel", writeOperations: [], icon: IconListDetails },
      { id: "scope-assignments", label: "Scope assignments", routeKey: "ownerOrganizationGovernanceDataScopes", tenantTab: "scope-assignments", moduleKey: "data-scope", ownerPermissionRequirement: { mode: "all", permissions: ["owner.runtime.operations.execute"] }, tenantPermissionRequirement: { mode: "all", permissions: ["org.documents.create"] }, actionId: "governance.scopeAssignments.view", entity: "authorization_scope_assignments", sourceOfTruth: "authorization_scope_assignments", declaredState: "read-only", readOperation: "governance.readModel", writeOperations: [], icon: IconDatabase },
    ],
  },
  {
    id: "organization-model",
    label: "Organization model",
    items: [
      { id: "structure-classification", label: "Structure and classification", routeKey: "ownerOrganizationGovernanceStructure", tenantTab: "structure-classification", moduleKey: "taxonomy", ownerPermissionRequirement: { mode: "all", permissions: ["owner.runtime.operations.execute"] }, tenantPermissionRequirement: { mode: "all", permissions: ["org.documents.read"] }, actionId: "governance.structureClassification.view", entity: "organization_dimension_values + organization_units", sourceOfTruth: "taxonomy and organization structure tables", declaredState: "read-only", readOperation: "governance.readModel", writeOperations: [], icon: IconSitemap },
      { id: "groups-courses", label: "Groups and courses", routeKey: "ownerOrganizationGovernanceGroups", tenantTab: "groups-courses", moduleKey: "lms-groups", ownerPermissionRequirement: { mode: "all", permissions: ["owner.runtime.operations.execute"] }, tenantPermissionRequirement: { mode: "all", permissions: ["lms.groups.read"] }, actionId: "governance.groupsCourses.view", entity: "lms_academic_groups + lms_course_offerings", sourceOfTruth: "LMS group leadership read model", declaredState: "read-only", readOperation: "governance.readModel", writeOperations: [], icon: IconUsersGroup },
      { id: "people-segmentation", label: "People segmentation", routeKey: "ownerOrganizationGovernancePeopleSegmentation", tenantTab: "people-segmentation", moduleKey: "unavailable", ownerPermissionRequirement: { mode: "all", permissions: [] }, tenantPermissionRequirement: { mode: "all", permissions: [] }, actionId: "governance.peopleSegmentation.pending", entity: "people segmentation grammar", sourceOfTruth: "pending privacy/grammar ADR", declaredState: "planned", writeOperations: [], icon: IconRoute },
    ],
  },
  {
    id: "control-evidence",
    label: "Control and evidence",
    items: [
      { id: "access-explorer", label: "Access explorer", routeKey: "ownerOrganizationGovernancePreview", tenantTab: "access-explorer", moduleKey: "access-preview", ownerPermissionRequirement: { mode: "all", permissions: ["owner.runtime.operations.execute"] }, tenantPermissionRequirement: { mode: "all", permissions: ["org.documents.read"] }, actionId: "governance.accessExplorer.view", entity: "authorization decisions", sourceOfTruth: "server-side authorization evaluator", declaredState: "preview", readOperation: "governance.accessPreview", writeOperations: [], icon: IconEyeCheck },
      { id: "identity-provisioning", label: "Identity provisioning", routeKey: "ownerOrganizationGovernanceProvisioning", tenantTab: "identity-provisioning", moduleKey: "identity-provisioning", ownerPermissionRequirement: { mode: "all", permissions: ["owner.runtime.operations.execute"] }, tenantPermissionRequirement: { mode: "all", permissions: ["org.documents.create"] }, actionId: "governance.identityProvisioning.view", entity: "scim connections and provisioning operations", sourceOfTruth: "identity federation provisioning read model", declaredState: "unavailable", readOperation: "governance.identityProvisioning", writeOperations: [], icon: IconUserCog },
      { id: "audit-log", label: "Audit log", routeKey: "ownerOrganizationGovernanceAudit", tenantTab: "audit-log", moduleKey: "audit", ownerPermissionRequirement: { mode: "all", permissions: ["owner.runtime.operations.execute"] }, tenantPermissionRequirement: { mode: "all", permissions: ["org.documents.read"] }, actionId: "governance.auditLog.view", entity: "audit events", sourceOfTruth: "audit/outbox read model", declaredState: "read-only", readOperation: "governance.audit", writeOperations: [], icon: IconListDetails },
    ],
  },
];

export const flattenGovernanceWorkspaceItems = () => GOVERNANCE_WORKSPACE_GROUPS.flatMap((group) => group.items);

export const governanceWorkspaceAvailability = (surface: GovernanceSurface, item: GovernanceWorkspaceItem): GovernanceEffectiveStatus => {
  const operationStates = [item.readOperation, ...item.writeOperations].filter(Boolean).map((operationId) => governanceOperationStatus(surface, operationId!));
  if (!operationStates.length) return item.declaredState === "planned" ? "planned" : "unavailable";
  if (item.writeOperations.some((operationId) => governanceOperationStatus(surface, operationId) === "active")) return "active";
  if (operationStates.includes("preview")) return "preview";
  if (operationStates.includes("read-only")) return "read-only";
  if (operationStates.includes("planned")) return item.declaredState === "unavailable" ? "unavailable" : "planned";
  return "unavailable";
};

export const governanceWorkspaceItemForSurface = (surface: GovernanceSurface, id: GovernanceWorkspaceItemId) => {
  void surface;
  return flattenGovernanceWorkspaceItems().find((item) => item.id === id) ?? GOVERNANCE_WORKSPACE_GROUPS[0].items[0];
};
