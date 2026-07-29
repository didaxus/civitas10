import { IconBuilding, IconClipboardCheck, IconDatabase, IconEyeCheck, IconListDetails, IconRoute, IconScale, IconSitemap, IconUsersGroup, IconUserCog, type Icon } from "@tabler/icons-react";
import { appRoutes } from "../../navigation/routes";
import type { GovernanceModuleKey, GovernanceSurface } from "./contracts";

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
  endpoint: string;
  sourceOfTruth: string;
  status: "active" | "planned";
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
      { id: "organization-overview", label: "Overview", routeKey: "ownerOrganizationState", tenantTab: "overview", moduleKey: "organization-overview", ownerPermissionRequirement: { mode: "all", permissions: ["owner.profile.read"] }, tenantPermissionRequirement: { mode: "all", permissions: [] }, actionId: "organization.overview.view", entity: "owner organization operational summary", endpoint: appRoutes.ownerOrganizationState.path, sourceOfTruth: "owner operational read model", status: "active", icon: IconBuilding },
      { id: "operations", label: "Operations", routeKey: "ownerOrganizationOperations", tenantTab: "operations", moduleKey: "operations", ownerPermissionRequirement: { mode: "all", permissions: ["owner.profile.read"] }, tenantPermissionRequirement: { mode: "all", permissions: [] }, actionId: "organization.operations.view", entity: "owner organization capabilities", endpoint: appRoutes.ownerOrganizationState.path, sourceOfTruth: "owner operational read model", status: "active", icon: IconClipboardCheck },
    ],
  },
  {
    id: "access-policy",
    label: "Política de acceso",
    items: [
      { id: "role-permissions", label: "Roles y permisos", routeKey: "ownerOrganizationGovernanceRoles", tenantTab: "role-permissions", moduleKey: "permissions", ownerPermissionRequirement: { mode: "all", permissions: ["owner.runtime.operations.execute"] }, tenantPermissionRequirement: { mode: "all", permissions: ["org.documents.create"] }, actionId: "governance.rolePermissions.view", entity: "org_role_entitlement_limits", endpoint: "/governance/read-model", sourceOfTruth: "durable governance read model", status: "active", icon: IconScale },
      { id: "role-names", label: "Nombres de roles", routeKey: "ownerOrganizationGovernanceRoleNames", tenantTab: "role-names", moduleKey: "aliases-navigation", ownerPermissionRequirement: { mode: "all", permissions: ["owner.runtime.operations.execute"] }, tenantPermissionRequirement: { mode: "all", permissions: ["org.documents.create"] }, actionId: "governance.roleNames.view", entity: "tenant role aliases", endpoint: "/governance/read-model", sourceOfTruth: "durable governance read model", status: "active", icon: IconListDetails },
      { id: "scope-assignments", label: "Alcances de datos", routeKey: "ownerOrganizationGovernanceDataScopes", tenantTab: "scope-assignments", moduleKey: "data-scope", ownerPermissionRequirement: { mode: "all", permissions: ["owner.runtime.operations.execute"] }, tenantPermissionRequirement: { mode: "all", permissions: ["org.documents.create"] }, actionId: "governance.scopeAssignments.view", entity: "authorization_scope_assignments", endpoint: "/governance/read-model", sourceOfTruth: "authorization_scope_assignments", status: "active", icon: IconDatabase },
    ],
  },
  {
    id: "organization-model",
    label: "Modelo de organización",
    items: [
      { id: "structure-classification", label: "Estructura y clasificación", routeKey: "ownerOrganizationGovernanceStructure", tenantTab: "structure-classification", moduleKey: "taxonomy", ownerPermissionRequirement: { mode: "all", permissions: ["owner.runtime.operations.execute"] }, tenantPermissionRequirement: { mode: "all", permissions: ["org.documents.read"] }, actionId: "governance.structureClassification.view", entity: "organization_dimension_values + organization_units", endpoint: "/governance/read-model", sourceOfTruth: "taxonomy and organization structure tables", status: "active", icon: IconSitemap },
      { id: "groups-courses", label: "Grupos y clases", routeKey: "ownerOrganizationGovernanceGroups", tenantTab: "groups-courses", moduleKey: "lms-groups", ownerPermissionRequirement: { mode: "all", permissions: ["owner.runtime.operations.execute"] }, tenantPermissionRequirement: { mode: "all", permissions: ["lms.groups.read"] }, actionId: "governance.groupsCourses.view", entity: "lms_academic_groups + lms_course_offerings", endpoint: appRoutes.tenantLmsGroups.path, sourceOfTruth: "LMS group leadership read model", status: "active", icon: IconUsersGroup },
      { id: "people-segmentation", label: "Segmentación de personas", routeKey: "ownerOrganizationGovernancePeopleSegmentation", tenantTab: "people-segmentation", moduleKey: "unavailable", ownerPermissionRequirement: { mode: "all", permissions: [] }, tenantPermissionRequirement: { mode: "all", permissions: [] }, actionId: "governance.peopleSegmentation.pending", entity: "people segmentation grammar", endpoint: "planned", sourceOfTruth: "pending privacy/grammar ADR", status: "planned", icon: IconRoute },
    ],
  },
  {
    id: "control-evidence",
    label: "Control y evidencia",
    items: [
      { id: "access-explorer", label: "Explorador de acceso", routeKey: "ownerOrganizationGovernancePreview", tenantTab: "access-explorer", moduleKey: "access-preview", ownerPermissionRequirement: { mode: "all", permissions: ["owner.runtime.operations.execute"] }, tenantPermissionRequirement: { mode: "all", permissions: ["org.documents.read"] }, actionId: "governance.accessExplorer.view", entity: "authorization decisions", endpoint: "/governance/access-preview", sourceOfTruth: "server-side authorization evaluator", status: "active", icon: IconEyeCheck },
      { id: "identity-provisioning", label: "Identity provisioning", routeKey: "ownerOrganizationGovernanceProvisioning", tenantTab: "identity-provisioning", moduleKey: "identity-provisioning", ownerPermissionRequirement: { mode: "all", permissions: ["owner.runtime.operations.execute"] }, tenantPermissionRequirement: { mode: "all", permissions: ["org.documents.create"] }, actionId: "governance.identityProvisioning.view", entity: "scim connections and provisioning operations", endpoint: "/governance/identity-provisioning", sourceOfTruth: "identity federation provisioning read model", status: "active", icon: IconUserCog },
      { id: "audit-log", label: "Auditoría", routeKey: "ownerOrganizationGovernanceAudit", tenantTab: "audit-log", moduleKey: "audit", ownerPermissionRequirement: { mode: "all", permissions: ["owner.runtime.operations.execute"] }, tenantPermissionRequirement: { mode: "all", permissions: ["org.documents.read"] }, actionId: "governance.auditLog.view", entity: "audit events", endpoint: "/governance/read-model", sourceOfTruth: "audit/outbox read model", status: "active", icon: IconListDetails },
    ],
  },
];

export const flattenGovernanceWorkspaceItems = () => GOVERNANCE_WORKSPACE_GROUPS.flatMap((group) => group.items);

export const governanceWorkspaceItemForSurface = (surface: GovernanceSurface, id: GovernanceWorkspaceItemId) => {
  void surface;
  return flattenGovernanceWorkspaceItems().find((item) => item.id === id) ?? GOVERNANCE_WORKSPACE_GROUPS[0].items[0];
};
