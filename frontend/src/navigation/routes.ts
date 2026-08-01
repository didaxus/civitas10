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
const ownerOrganizationGovernanceGroupsRoute = defineRoute("/owner/organizations/:organizationId/governance/organization-model/groups");
const ownerOrganizationGovernanceDataScopesRoute = defineRoute("/owner/organizations/:organizationId/governance/access-policy/scope-assignments");
const ownerOrganizationGovernanceRoleNamesRoute = defineRoute("/owner/organizations/:organizationId/governance/access-policy/role-names");
const ownerOrganizationGovernancePreviewRoute = defineRoute("/owner/organizations/:organizationId/governance/control/access-explorer");
const ownerOrganizationGovernanceAuditRoute = defineRoute("/owner/organizations/:organizationId/governance/control/audit");
const ownerOrganizationGovernancePeopleSegmentationRoute = defineRoute("/owner/organizations/:organizationId/governance/organization-model/segments");
const ownerOrganizationGovernanceProvisioningRoute = defineRoute("/owner/organizations/:organizationId/governance/identity-provisioning");
const ownerOrganizationOperationsRoute = defineRoute("/owner/organizations/:organizationId/operations");
const ownerOrganizationGovernanceLegacyGroupsRoute = defineRoute("/owner/organizations/:organizationId/governance/groups");
const ownerOrganizationGovernanceLegacyDataScopesRoute = defineRoute("/owner/organizations/:organizationId/governance/data-scopes");
const ownerOrganizationGovernanceLegacyPreviewRoute = defineRoute("/owner/organizations/:organizationId/governance/preview");
const ownerOrganizationGovernanceLegacyAuditRoute = defineRoute("/owner/organizations/:organizationId/governance/audit");
const ownerOrganizationGovernanceLegacyPeopleSegmentationRoute = defineRoute("/owner/organizations/:organizationId/governance/people-segmentation");
const tenantGovernanceRoute = defineRoute("/o/:organizationId/settings/governance");
const tenantGovernanceRolesRoute = defineRoute("/o/:organizationId/settings/governance/access-policy/roles");
const tenantGovernanceRoleNamesRoute = defineRoute("/o/:organizationId/settings/governance/access-policy/role-names");
const tenantGovernanceStructureRoute = defineRoute("/o/:organizationId/settings/governance/organization-model/structure");
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
  owner: appRoute(ownerRoute, "Overview", "overview", "Resumen ejecutivo del backbone owner y accesos a Governance, Operations y Organizations."),
  ownerGovernance: appRoute(ownerGovernanceRoute, "Governance selector", "governance", "Redirects to Directory because Governance requires a selected organization.", false),
  ownerOrganizations: appRoute(ownerOrganizationsRoute, "Directory", "directory", "Directorio owner_global de organizaciones canónicas de Logto con señales Civitas."),
  ownerCreateOrganization: appRoute(ownerCreateOrganizationRoute, "Create", "create", "Alta canónica en Logto con bootstrap limpio."),
  ownerOrganizationState: appRoute(ownerOrganizationStateRoute, "Vista general", "organizations", "Estado operacional consolidado por organización."),
  ownerOrganizationGovernance: appRoute(ownerOrganizationGovernanceRoute, "Gobierno", "governance", "Workspace operational contextual para una organización seleccionada."),
  ownerOrganizationGovernanceRoles: appRoute(ownerOrganizationGovernanceRolesRoute, "Roles y permisos", "governance", "Owner ceiling, tenant activation and permission matrix for the selected organization."),
  ownerOrganizationGovernanceStructure: appRoute(ownerOrganizationGovernanceStructureRoute, "Estructura y clasificación", "governance", "Read-only audit view of organization units, hierarchy and classification."),
  ownerOrganizationGovernanceGroups: appRoute(ownerOrganizationGovernanceGroupsRoute, "Grupos y clases", "governance", "LMS group and course read models for the selected organization."),
  ownerOrganizationGovernanceDataScopes: appRoute(ownerOrganizationGovernanceDataScopesRoute, "Alcances de datos", "governance", "Data-scope assignments for the selected organization."),
  ownerOrganizationGovernanceRoleNames: appRoute(ownerOrganizationGovernanceRoleNamesRoute, "Nombres de roles", "governance", "Read-only audit context for tenant-facing canonical role aliases."),
  ownerOrganizationGovernancePreview: appRoute(ownerOrganizationGovernancePreviewRoute, "Explorador de acceso", "governance", "Read-only access explorer for the selected organization."),
  ownerOrganizationGovernanceAudit: appRoute(ownerOrganizationGovernanceAuditRoute, "Auditoría", "governance", "Audit and diagnostics for the selected organization."),
  ownerOrganizationGovernancePeopleSegmentation: appRoute(ownerOrganizationGovernancePeopleSegmentationRoute, "Segmentación de personas", "governance", "Capacidad planeada.", true),
  ownerOrganizationGovernanceProvisioning: appRoute(ownerOrganizationGovernanceProvisioningRoute, "Identity provisioning", "governance", "SCIM provisioning lifecycle, credentials, mappings and operations for the selected organization."),
  ownerOrganizationOperations: appRoute(ownerOrganizationOperationsRoute, "Operaciones", "operations", "Operational health and capability runtime for the selected organization."),
  ownerOrganizationGovernanceLegacyGroups: appRoute(ownerOrganizationGovernanceLegacyGroupsRoute, "Legacy groups redirect", "governance", "Compatibility redirect to the canonical groups workspace.", false),
  ownerOrganizationGovernanceLegacyDataScopes: appRoute(ownerOrganizationGovernanceLegacyDataScopesRoute, "Legacy data scopes redirect", "governance", "Compatibility redirect to the canonical scope assignments workspace.", false),
  ownerOrganizationGovernanceLegacyPreview: appRoute(ownerOrganizationGovernanceLegacyPreviewRoute, "Legacy access preview redirect", "governance", "Compatibility redirect to the canonical access explorer workspace.", false),
  ownerOrganizationGovernanceLegacyAudit: appRoute(ownerOrganizationGovernanceLegacyAuditRoute, "Legacy audit redirect", "governance", "Compatibility redirect to the canonical audit workspace.", false),
  ownerOrganizationGovernanceLegacyPeopleSegmentation: appRoute(ownerOrganizationGovernanceLegacyPeopleSegmentationRoute, "Legacy people segmentation redirect", "governance", "Compatibility redirect to the canonical people segmentation workspace.", false),
  tenantGovernance: appRoute(tenantGovernanceRoute, "Governance", "governance", "Studio tenant para activaciones, asignaciones y navegación restrictiva dentro de la organización."),
  tenantGovernanceRoles: appRoute(tenantGovernanceRolesRoute, "Roles y permisos", "governance", "Tenant activation editor for role permissions within Owner Ceiling."),
  tenantGovernanceRoleNames: appRoute(tenantGovernanceRoleNamesRoute, "Nombres de roles", "governance", "Tenant role alias editor for display-only canonical role labels."),
  tenantGovernanceStructure: appRoute(tenantGovernanceStructureRoute, "Estructura y clasificación", "governance", "Tenant organization-unit structure and classification workspace."),
  tenantGovernanceProvisioning: appRoute(tenantGovernanceProvisioningRoute, "Identity provisioning", "governance", "SCIM provisioning lifecycle, credentials, mappings and operations."),
  tenantLmsGrades: appRoute(tenantLmsGradesRoute, "Grades", "grades", "Superficie tenant LMS para calificaciones bajo contexto organizacional."),
  tenantLmsGroups: appRoute(tenantLmsGroupsRoute, "Groups", "groups", "LMS groups visible through server-side group leadership authorization."),
  ownerLogs: appRoute(ownerLogsRoute, "Audit / diagnostics", "operations", "Trazabilidad global de eventos operativos owner.", false),
  ownerSystem: appRoute(ownerSystemRoute, "Operations", "operations", "Dashboard operativo consolidado para runtime, colas y diagnósticos."),
  ownerWorkerQueues: appRoute(ownerWorkerQueuesRoute, "Worker queues", "operations", "Observabilidad global del runtime operativo.", false),
  ownerBranding: appRoute(ownerBrandingRoute, "Branding", "settings", "Configuración visual y de identidad del entorno.", false),
  ownerRoleMapping: appRoute(ownerRoleMappingRoute, "Role mappings", "settings", "Mapeo de roles y permisos owner a capacidades operativas.", false),
  ownerPlatformSettings: appRoute(ownerPlatformSettingsRoute, "Platform settings", "settings", "Ajustes globales de plataforma owner.", false),
  selectOrganization: appRoute(selectOrganizationRoute, "Vista general", "organizations", "Selector visual de organizaciones reales de Logto.", false),
  account: appRoute(accountRoute, "Profile", "profile", "Resumen del perfil autenticado.", false),
} as const satisfies Record<string, AppRoute>;

export const primaryNavigation: AppRoute[] = [];

const settingsChildren = [appRoutes.ownerBranding, appRoutes.ownerRoleMapping, appRoutes.ownerPlatformSettings].filter((route) => route.active);

export const ownerNavigationTree: NavigationNode[] = [
  appRoutes.owner,
  appRoutes.ownerSystem,
  structuralRoute("/owner/organizations-section", "Organizations", "organizations", "Directorio y creación de organizaciones.", [appRoutes.ownerOrganizations, appRoutes.ownerCreateOrganization]),
  ...(settingsChildren.length ? [structuralRoute("/owner/settings-section", "Settings", "settings", "Configuración owner estable.", settingsChildren)] : []),
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
  [appRoutes.ownerOrganizationGovernanceGroups.path]: { label: appRoutes.ownerOrganizationGovernanceGroups.label, parentPath: appRoutes.ownerOrganizationGovernance.path },
  [appRoutes.ownerOrganizationGovernanceDataScopes.path]: { label: appRoutes.ownerOrganizationGovernanceDataScopes.label, parentPath: appRoutes.ownerOrganizationGovernance.path },
  [appRoutes.ownerOrganizationGovernanceRoleNames.path]: { label: appRoutes.ownerOrganizationGovernanceRoleNames.label, parentPath: appRoutes.ownerOrganizationGovernance.path },
  [appRoutes.ownerOrganizationGovernancePreview.path]: { label: appRoutes.ownerOrganizationGovernancePreview.label, parentPath: appRoutes.ownerOrganizationGovernance.path },
  [appRoutes.ownerOrganizationGovernanceAudit.path]: { label: appRoutes.ownerOrganizationGovernanceAudit.label, parentPath: appRoutes.ownerOrganizationGovernance.path },
  [appRoutes.ownerOrganizationGovernancePeopleSegmentation.path]: { label: appRoutes.ownerOrganizationGovernancePeopleSegmentation.label, parentPath: appRoutes.ownerOrganizationGovernance.path },
  [appRoutes.ownerOrganizationGovernanceProvisioning.path]: { label: appRoutes.ownerOrganizationGovernanceProvisioning.label, parentPath: appRoutes.ownerOrganizationGovernance.path },
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
  [appRoutes.tenantGovernanceProvisioning.path]: { label: appRoutes.tenantGovernanceProvisioning.label, parentPath: appRoutes.tenantGovernance.path },
  [appRoutes.tenantLmsGroups.path]: { label: appRoutes.tenantLmsGroups.label },
  [appRoutes.tenantLmsGrades.path]: { label: appRoutes.tenantLmsGrades.label },
};
