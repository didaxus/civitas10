import type { Icon } from "@tabler/icons-react";
import { IconDatabase, IconEyeCheck, IconListDetails, IconRoute, IconScale, IconSitemap, IconTags } from "@tabler/icons-react";
import { appRoutes } from "../../navigation/routes";
import type { GovernanceModuleKey, GovernanceSurface } from "./contracts";
import { ORGANIZATION_MAPPING_ACTIONS } from "../../generated/organization-mapping-contracts";

export type GovernanceWorkspaceItemId = "role-permissions" | "role-names" | "scope-assignments" | "data-scopes" | "structure-classification" | "people-segmentation" | "access-explorer" | "audit-log";

export type GovernanceWorkspaceItem = {
  id: GovernanceWorkspaceItemId;
  label: string;
  routeKey: keyof typeof appRoutes;
  tenantRouteKey?: keyof typeof appRoutes;
  tenantTab: string;
  moduleKey: GovernanceModuleKey | "unavailable";
  ownerPermissionRequirement: { mode: "all" | "any"; permissions: string[] };
  tenantPermissionRequirement: { mode: "all" | "any"; permissions: string[] };
  actionId: string;
  entity: string;
  endpoint: string;
  sourceOfTruth: string;
  icon: Icon;
};

export const GOVERNANCE_WORKSPACE_ITEMS: GovernanceWorkspaceItem[] = [
  { id: "role-permissions", label: "Roles & Permissions", routeKey: "ownerOrganizationGovernanceRoles", tenantTab: "role-permissions", moduleKey: "permissions", ownerPermissionRequirement: { mode: "all", permissions: ["owner.runtime.operations.execute"] }, tenantPermissionRequirement: { mode: "all", permissions: ["org.documents.create"] }, actionId: "governance.rolePermissions.view", entity: "org_role_entitlement_limits", endpoint: "/governance/read-model", sourceOfTruth: "durable governance read model", icon: IconScale },
  { id: "role-names", label: "Role Names", routeKey: "ownerOrganizationGovernanceRoleNames", tenantTab: "role-names", moduleKey: "aliases-navigation", ownerPermissionRequirement: { mode: "all", permissions: ["owner.runtime.operations.execute"] }, tenantPermissionRequirement: { mode: "all", permissions: ["org.documents.create"] }, actionId: "governance.roleNames.view", entity: "tenant role aliases", endpoint: "/governance/read-model", sourceOfTruth: "durable governance read model", icon: IconTags },
  { id: "scope-assignments", label: "Scope Assignments", routeKey: "ownerOrganizationGovernanceScopeAssignments", tenantTab: "scope-assignments", moduleKey: "data-scope", ownerPermissionRequirement: { mode: "all", permissions: ["owner.runtime.operations.execute"] }, tenantPermissionRequirement: { mode: "all", permissions: ["org.documents.create"] }, actionId: "governance.scopeAssignments.view", entity: "authorization_scope_assignments", endpoint: "/governance/read-model", sourceOfTruth: "authorization_scope_assignments", icon: IconDatabase },
  { id: "data-scopes", label: "Data Scopes", routeKey: "ownerOrganizationGovernanceDataScopes", tenantRouteKey: "tenantGovernanceDataScopes", tenantTab: "data-scopes", moduleKey: "data-scope", ownerPermissionRequirement: { mode: "all", permissions: [] }, tenantPermissionRequirement: { mode: "all", permissions: [] }, actionId: ORGANIZATION_MAPPING_ACTIONS["organizationModel.readDraft"].actionId, entity: "organization mapping policies", endpoint: "/organization-model/workspace-summary", sourceOfTruth: "organization mapping service", icon: IconDatabase },
  { id: "structure-classification", label: "Structure", routeKey: "ownerOrganizationGovernanceStructure", tenantRouteKey: "tenantGovernanceStructure", tenantTab: "structure-classification", moduleKey: "units", ownerPermissionRequirement: { mode: "all", permissions: [] }, tenantPermissionRequirement: { mode: "all", permissions: [] }, actionId: ORGANIZATION_MAPPING_ACTIONS["organizationModel.readDraft"].actionId, entity: "organization model graph and Scope Tree", endpoint: "/organization-model/structure-workspace", sourceOfTruth: "organization mapping service", icon: IconSitemap },
  { id: "people-segmentation", label: "Segmentation", routeKey: "ownerOrganizationGovernancePeopleSegmentation", tenantRouteKey: "tenantGovernancePeopleSegmentation", tenantTab: "people-segmentation", moduleKey: "people-segmentation", ownerPermissionRequirement: { mode: "all", permissions: [] }, tenantPermissionRequirement: { mode: "all", permissions: [] }, actionId: "governance.peopleSegmentation.view", entity: "people segmentation", endpoint: "/governance/read-model", sourceOfTruth: "governance read model", icon: IconRoute },
  { id: "access-explorer", label: "Access Explorer", routeKey: "ownerOrganizationGovernancePreview", tenantRouteKey: "tenantGovernanceAccessExplorer", tenantTab: "access-explorer", moduleKey: "access-preview", ownerPermissionRequirement: { mode: "all", permissions: [] }, tenantPermissionRequirement: { mode: "all", permissions: [] }, actionId: ORGANIZATION_MAPPING_ACTIONS["organizationModel.inspectAuditHistory"].actionId, entity: "authorization decisions", endpoint: "/organization-model/authorization-explanations/{actionId}", sourceOfTruth: "canonical authorization pipeline", icon: IconEyeCheck },
  { id: "audit-log", label: "Logs", routeKey: "ownerOrganizationGovernanceAudit", tenantTab: "audit-log", moduleKey: "audit", ownerPermissionRequirement: { mode: "all", permissions: ["owner.runtime.operations.execute"] }, tenantPermissionRequirement: { mode: "all", permissions: ["org.documents.read"] }, actionId: "governance.auditLog.view", entity: "audit events", endpoint: "/governance/read-model", sourceOfTruth: "audit/outbox read model", icon: IconListDetails },
];

export const flattenGovernanceWorkspaceItems = () => GOVERNANCE_WORKSPACE_ITEMS;
export const governanceWorkspaceItemForSurface = (surface: GovernanceSurface, id: GovernanceWorkspaceItemId) => {
  void surface;
  return GOVERNANCE_WORKSPACE_ITEMS.find((item) => item.id === id) ?? GOVERNANCE_WORKSPACE_ITEMS[0];
};
