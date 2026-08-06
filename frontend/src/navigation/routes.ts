import type { IconKey } from "../authorization/contracts/ids";
import { defineRoute, type DefinedRoute, type RouteParams } from "./route-builders";

export const OWNER_NAVIGATION_CONTRACT_VERSION = 2;
export const TENANT_NAVIGATION_CONTRACT_VERSION = 1;

export type AppRoute = {
  path: string;
  label: string;
  description?: string;
  route?: DefinedRoute;
  build?: (params?: RouteParams) => string;
  iconKey: IconKey;
  active?: boolean;
};

export type NavigationNode = AppRoute & {
  children?: NavigationNode[];
  structural?: boolean;
  contextual?: boolean;
};

const staticRoute = (path: string) => defineRoute(path);

const ownerRoute = staticRoute("/owner");
const ownerGovernanceRoute = staticRoute("/owner/governance");
const ownerOrganizationsRoute = staticRoute("/owner/organizations");
const ownerCreateOrganizationRoute = staticRoute("/owner/create");
const ownerOrganizationStateRoute = defineRoute("/owner/organizations/:organizationId");
const ownerOrganizationGovernanceRoute = defineRoute("/owner/organizations/:organizationId/governance");
const ownerOrganizationGovernanceRolesRoute = defineRoute("/owner/organizations/:organizationId/governance/access-policy/roles");
const ownerOrganizationGovernanceStructureRoute = defineRoute("/owner/organizations/:organizationId/governance/organization-model/structure");
const ownerOrganizationGovernanceDataScopesRoute = defineRoute("/owner/organizations/:organizationId/governance/organization-model/data-scopes");
const ownerOrganizationGovernanceScopeAssignmentsRoute = defineRoute("/owner/organizations/:organizationId/governance/access-policy/scope-assignments");
const ownerOrganizationGovernanceRoleNamesRoute = defineRoute("/owner/organizations/:organizationId/governance/access-policy/role-names");
const ownerOrganizationGovernancePreviewRoute = defineRoute("/owner/organizations/:organizationId/governance/access-policy/access-explorer");
const ownerOrganizationGovernanceAuditRoute = defineRoute("/owner/organizations/:organizationId/governance/control/audit");
const ownerOrganizationGovernancePeopleSegmentationRoute = defineRoute("/owner/organizations/:organizationId/governance/organization-model/segments");
const ownerOrganizationOperationsRoute = defineRoute("/owner/organizations/:organizationId/operations");
const ownerOrganizationMembersRoute = defineRoute("/owner/organizations/:organizationId/members");
const tenantGovernanceRoute = defineRoute("/o/:organizationId/settings/governance");
const tenantGovernanceRolesRoute = defineRoute("/o/:organizationId/settings/governance/access-policy/roles");
const tenantGovernanceRoleNamesRoute = defineRoute("/o/:organizationId/settings/governance/access-policy/role-names");
const tenantGovernanceStructureRoute = defineRoute("/o/:organizationId/settings/governance/organization-model/structure");
const tenantGovernanceDataScopesRoute = defineRoute("/o/:organizationId/settings/governance/organization-model/data-scopes");
const tenantGovernanceScopeAssignmentsRoute = defineRoute("/o/:organizationId/settings/governance/access-policy/scope-assignments");
const tenantGovernanceAccessExplorerRoute = defineRoute("/o/:organizationId/settings/governance/access-policy/access-explorer");
const tenantGovernancePeopleSegmentationRoute = defineRoute("/o/:organizationId/settings/governance/organization-model/segments");
const tenantGovernanceProvisioningRoute = defineRoute("/o/:organizationId/settings/governance/identity-provisioning");
const tenantLmsGradesRoute = defineRoute("/o/:organizationId/lms/grades");
const tenantLmsGroupsRoute = defineRoute("/o/:organizationId/lms/groups");
const ownerLogsRoute = staticRoute("/owner/logs");
const ownerSystemRoute = staticRoute("/owner/system");
const ownerWorkerQueuesRoute = staticRoute("/owner/system/worker-queues");
const ownerBrandingRoute = staticRoute("/owner/branding");
const ownerRoleMappingRoute = staticRoute("/owner/role-mapping");
const ownerPlatformSettingsRoute = staticRoute("/owner/settings");
const selectOrganizationRoute = staticRoute("/select-organization");
const accountRoute = staticRoute("/account");

const appRoute = (route: DefinedRoute, label: string, iconKey: IconKey, description?: string, active = true): AppRoute => ({ path: route.pattern, label, description, route, build: route.build, iconKey, active });
const structuralRoute = (path: string, label: string, iconKey: IconKey, description?: string, children: NavigationNode[] = [], active = true): NavigationNode => ({ path, label, description, iconKey, active, structural: true, children });

export const appRoutes = {
  owner: appRoute(ownerRoute, "Overview", "overview", "Executive summary of the owner backbone and access to Governance, Operations, and Organizations."),
  ownerGovernance: appRoute(ownerGovernanceRoute, "Governance selector", "governance", "Redirects to Directory because Governance requires a selected organization.", false),
  ownerOrganizations: appRoute(ownerOrganizationsRoute, "Directory", "directory", "Directory of canonical Logto organizations with Civitas signals."),
  ownerCreateOrganization: appRoute(ownerCreateOrganizationRoute, "Create", "create", "Canonical Logto organization creation."),
  ownerOrganizationState: appRoute(ownerOrganizationStateRoute, "Overview", "overview", "Consolidated operational state for the organization."),
  ownerOrganizationGovernance: appRoute(ownerOrganizationGovernanceRoute, "Governance", "governance", "Governance for the selected organization."),
  ownerOrganizationGovernanceRoles: appRoute(ownerOrganizationGovernanceRolesRoute, "Roles & Permissions", "roles", "Owner ceiling, tenant activation and permission matrix for the selected organization."),
  ownerOrganizationGovernanceStructure: appRoute(ownerOrganizationGovernanceStructureRoute, "Structure", "structure", "Read-only audit view of organization units, hierarchy and classification."),
  ownerOrganizationGovernanceDataScopes: appRoute(ownerOrganizationGovernanceDataScopesRoute, "Data Scopes", "dataScopes", "Organization mapping policies and canonical dimensions for the selected organization."),
  ownerOrganizationGovernanceScopeAssignments: appRoute(ownerOrganizationGovernanceScopeAssignmentsRoute, "Scope Assignments", "dataScopes", "Per-user authorization scope assignments for the selected organization."),
  ownerOrganizationGovernanceRoleNames: appRoute(ownerOrganizationGovernanceRoleNamesRoute, "Role Names", "roleNames", "Read-only audit context for tenant-facing canonical role aliases."),
  ownerOrganizationGovernancePreview: appRoute(ownerOrganizationGovernancePreviewRoute, "Access Explorer", "accessExplorer", "Read-only access explorer for the selected organization."),
  ownerOrganizationGovernanceAudit: appRoute(ownerOrganizationGovernanceAuditRoute, "Logs", "logs", "Audit and diagnostics for the selected organization."),
  ownerOrganizationGovernancePeopleSegmentation: appRoute(ownerOrganizationGovernancePeopleSegmentationRoute, "Segmentation", "segmentation", "People segmentation workspace."),
  ownerOrganizationMembers: appRoute(ownerOrganizationMembersRoute, "Members", "members", "Organization member role assignments."),
  ownerOrganizationOperations: appRoute(ownerOrganizationOperationsRoute, "Operations", "operations", "Operational health and capability runtime for the selected organization."),
  tenantGovernance: appRoute(tenantGovernanceRoute, "Governance", "governance", "Tenant studio for organization-scoped activations and assignments."),
  tenantGovernanceRoles: appRoute(tenantGovernanceRolesRoute, "Roles & Permissions", "governance", "Tenant activation editor for role permissions within Owner Ceiling."),
  tenantGovernanceRoleNames: appRoute(tenantGovernanceRoleNamesRoute, "Role Names", "governance", "Tenant role alias editor for display-only canonical role labels."),
  tenantGovernanceStructure: appRoute(tenantGovernanceStructureRoute, "Structure", "governance", "Tenant organization-unit structure and classification workspace."),
  tenantGovernanceDataScopes: appRoute(tenantGovernanceDataScopesRoute, "Data Scopes", "governance", "Organization mapping policies and canonical dimensions."),
  tenantGovernanceScopeAssignments: appRoute(tenantGovernanceScopeAssignmentsRoute, "Scope Assignments", "governance", "Per-user authorization scope assignments."),
  tenantGovernanceAccessExplorer: appRoute(tenantGovernanceAccessExplorerRoute, "Access Explorer", "governance", "Backend authorization decision explorer."),
  tenantGovernancePeopleSegmentation: appRoute(tenantGovernancePeopleSegmentationRoute, "Segmentation", "governance", "Tenant role segmentation workspace."),
  tenantGovernanceProvisioning: appRoute(tenantGovernanceProvisioningRoute, "Identity provisioning", "governance", "SCIM provisioning lifecycle, credentials, mappings and operations."),
  tenantLmsGrades: appRoute(tenantLmsGradesRoute, "Grades", "grades", "Tenant LMS grades within organization context."),
  tenantLmsGroups: appRoute(tenantLmsGroupsRoute, "Groups", "groups", "LMS groups visible through server-side group leadership authorization."),
  ownerLogs: appRoute(ownerLogsRoute, "Audit / diagnostics", "operations", "Global owner operational event traceability.", false),
  ownerSystem: appRoute(ownerSystemRoute, "Operations", "operations", "Consolidated operational dashboard for runtime, queues, and diagnostics."),
  ownerWorkerQueues: appRoute(ownerWorkerQueuesRoute, "Worker queues", "operations", "Global operational runtime observability.", false),
  ownerBranding: appRoute(ownerBrandingRoute, "Branding", "settings", "Environment visual and identity configuration.", false),
  ownerRoleMapping: appRoute(ownerRoleMappingRoute, "Role mappings", "settings", "Owner role and permission mapping to operational capabilities.", false),
  ownerPlatformSettings: appRoute(ownerPlatformSettingsRoute, "Platform settings", "settings", "Global owner platform settings.", false),
  selectOrganization: appRoute(selectOrganizationRoute, "Overview", "organizations", "Selector for Logto organizations.", false),
  account: appRoute(accountRoute, "Profile", "profile", "Authenticated profile summary.", false),
} as const satisfies Record<string, AppRoute>;

export const primaryNavigation: AppRoute[] = [];

const settingsChildren = [appRoutes.ownerBranding, appRoutes.ownerRoleMapping, appRoutes.ownerPlatformSettings].filter((route) => route.active);

export const ownerNavigationTree: NavigationNode[] = [
  appRoutes.owner,
  appRoutes.ownerSystem,
  structuralRoute("/owner/organizations-section", "Organizations", "organizations", "Organization directory and creation.", [appRoutes.ownerOrganizations, appRoutes.ownerCreateOrganization]),
  ...(settingsChildren.length ? [structuralRoute("/owner/settings-section", "Settings", "settings", "Stable owner configuration.", settingsChildren)] : []),
  ...(appRoutes.account.active ? [appRoutes.account] : []),
];

export const tenantNavigationTree: NavigationNode[] = [
  appRoutes.tenantGovernance,
  appRoutes.tenantLmsGrades,
  appRoutes.tenantLmsGroups,
];

export const ownerNavigation: AppRoute[] = [appRoutes.owner, appRoutes.ownerSystem, appRoutes.ownerOrganizations, appRoutes.ownerCreateOrganization];

export type RouteMetadata = { label: string; parentPath?: string };

export const routeMetadata: Record<string, RouteMetadata> = {
  [appRoutes.owner.path]: { label: appRoutes.owner.label },
  [appRoutes.ownerGovernance.path]: { label: appRoutes.ownerGovernance.label, parentPath: appRoutes.ownerOrganizations.path },
  [appRoutes.ownerOrganizationGovernance.path]: { label: appRoutes.ownerOrganizationGovernance.label, parentPath: appRoutes.ownerOrganizationState.path },
  [appRoutes.ownerOrganizationGovernanceRoles.path]: { label: appRoutes.ownerOrganizationGovernanceRoles.label, parentPath: appRoutes.ownerOrganizationGovernance.path },
  [appRoutes.ownerOrganizationGovernanceStructure.path]: { label: appRoutes.ownerOrganizationGovernanceStructure.label, parentPath: appRoutes.ownerOrganizationGovernance.path },
  [appRoutes.ownerOrganizationGovernanceDataScopes.path]: { label: appRoutes.ownerOrganizationGovernanceDataScopes.label, parentPath: appRoutes.ownerOrganizationGovernance.path },
  [appRoutes.ownerOrganizationGovernanceScopeAssignments.path]: { label: appRoutes.ownerOrganizationGovernanceScopeAssignments.label, parentPath: appRoutes.ownerOrganizationGovernance.path },
  [appRoutes.ownerOrganizationGovernanceRoleNames.path]: { label: appRoutes.ownerOrganizationGovernanceRoleNames.label, parentPath: appRoutes.ownerOrganizationGovernance.path },
  [appRoutes.ownerOrganizationGovernancePreview.path]: { label: appRoutes.ownerOrganizationGovernancePreview.label, parentPath: appRoutes.ownerOrganizationGovernance.path },
  [appRoutes.ownerOrganizationGovernanceAudit.path]: { label: appRoutes.ownerOrganizationGovernanceAudit.label, parentPath: appRoutes.ownerOrganizationGovernance.path },
  [appRoutes.ownerOrganizationGovernancePeopleSegmentation.path]: { label: appRoutes.ownerOrganizationGovernancePeopleSegmentation.label, parentPath: appRoutes.ownerOrganizationGovernance.path },
  [appRoutes.ownerOrganizationMembers.path]: { label: appRoutes.ownerOrganizationMembers.label, parentPath: appRoutes.ownerOrganizationState.path },
  [appRoutes.ownerOrganizationOperations.path]: { label: appRoutes.ownerOrganizationOperations.label, parentPath: appRoutes.ownerOrganizationState.path },
  [appRoutes.ownerSystem.path]: { label: appRoutes.ownerSystem.label },
  [appRoutes.ownerWorkerQueues.path]: { label: appRoutes.ownerWorkerQueues.label, parentPath: appRoutes.ownerSystem.path },
  [appRoutes.ownerLogs.path]: { label: appRoutes.ownerLogs.label, parentPath: appRoutes.ownerSystem.path },
  [appRoutes.ownerOrganizations.path]: { label: appRoutes.ownerOrganizations.label, parentPath: "/owner/organizations-section" },
  [appRoutes.ownerCreateOrganization.path]: { label: appRoutes.ownerCreateOrganization.label, parentPath: appRoutes.ownerOrganizations.path },
  [appRoutes.ownerOrganizationState.path]: { label: appRoutes.ownerOrganizationState.label, parentPath: appRoutes.ownerOrganizations.path },
  [appRoutes.ownerBranding.path]: { label: appRoutes.ownerBranding.label, parentPath: "/owner/settings-section" },
  [appRoutes.ownerRoleMapping.path]: { label: appRoutes.ownerRoleMapping.label, parentPath: "/owner/settings-section" },
  [appRoutes.ownerPlatformSettings.path]: { label: appRoutes.ownerPlatformSettings.label, parentPath: "/owner/settings-section" },
  [appRoutes.account.path]: { label: appRoutes.account.label },
  [appRoutes.tenantGovernance.path]: { label: appRoutes.tenantGovernance.label },
  [appRoutes.tenantGovernanceRoles.path]: { label: appRoutes.tenantGovernanceRoles.label, parentPath: appRoutes.tenantGovernance.path },
  [appRoutes.tenantGovernanceRoleNames.path]: { label: appRoutes.tenantGovernanceRoleNames.label, parentPath: appRoutes.tenantGovernance.path },
  [appRoutes.tenantGovernanceStructure.path]: { label: appRoutes.tenantGovernanceStructure.label, parentPath: appRoutes.tenantGovernance.path },
  [appRoutes.tenantGovernanceDataScopes.path]: { label: appRoutes.tenantGovernanceDataScopes.label, parentPath: appRoutes.tenantGovernance.path },
  [appRoutes.tenantGovernanceScopeAssignments.path]: { label: appRoutes.tenantGovernanceScopeAssignments.label, parentPath: appRoutes.tenantGovernance.path },
  [appRoutes.tenantGovernanceAccessExplorer.path]: { label: appRoutes.tenantGovernanceAccessExplorer.label, parentPath: appRoutes.tenantGovernance.path },
  [appRoutes.tenantGovernancePeopleSegmentation.path]: { label: appRoutes.tenantGovernancePeopleSegmentation.label, parentPath: appRoutes.tenantGovernance.path },
  [appRoutes.tenantGovernanceProvisioning.path]: { label: appRoutes.tenantGovernanceProvisioning.label, parentPath: appRoutes.tenantGovernance.path },
  [appRoutes.tenantLmsGroups.path]: { label: appRoutes.tenantLmsGroups.label },
  [appRoutes.tenantLmsGrades.path]: { label: appRoutes.tenantLmsGrades.label },
};
