import { appRoutes } from "./routes";
import type { RouteReference } from "../authorization/contracts/screen-definition";
import type { RouteId } from "../authorization/contracts/ids";

const route = (routeId: string, path: string, scope: RouteReference["scope"], contextScope: RouteReference["contextScope"] = scope === "tenant" ? "tenant" : "platform"): RouteReference => ({ routeId: routeId as RouteId, path, scope, contextScope });

export const routeCatalog = {
  ownerOverview: route("owner.overview", appRoutes.owner.path, "owner", "platform"),
  ownerOrganizations: route("owner.organizations", appRoutes.ownerOrganizations.path, "owner", "platform"),
  ownerCreateOrganization: route("owner.organizations.create", appRoutes.ownerCreateOrganization.path, "owner", "platform"),
  ownerOrganizationState: route("owner.organizations.state", appRoutes.ownerOrganizationState.path, "owner", "platform"),
  ownerGovernance: route("owner.governance", appRoutes.ownerGovernance.path, "owner", "platform"),
  ownerOrganizationGovernance: route("owner.organizations.governance", appRoutes.ownerOrganizationGovernance.path, "owner", "platform"),
  ownerSystem: route("owner.system", appRoutes.ownerSystem.path, "owner", "platform"),
  ownerWorkerQueues: route("owner.system.worker_queues", appRoutes.ownerWorkerQueues.path, "owner", "platform"),
  account: route("account.profile", appRoutes.account.path, "account", "platform"),
  tenantGovernance: route("tenant.settings.governance", appRoutes.tenantGovernance.path, "tenant", "tenant"),
  tenantGovernanceRoles: route("tenant.settings.governance.roles", appRoutes.tenantGovernanceRoles.path, "tenant", "tenant"),
  tenantGovernanceRoleNames: route("tenant.settings.governance.role_names", appRoutes.tenantGovernanceRoleNames.path, "tenant", "tenant"),
  tenantGovernanceStructure: route("tenant.settings.governance.organization_model.structure", appRoutes.tenantGovernanceStructure.path, "tenant", "tenant"),
  tenantGovernancePeopleSegmentation: route("tenant.settings.governance.organization_model.segments", appRoutes.tenantGovernancePeopleSegmentation.path, "tenant", "tenant"),
  tenantGovernanceProvisioning: route("tenant.settings.governance.identity_provisioning", appRoutes.tenantGovernanceProvisioning.path, "tenant", "tenant"),
  lmsGrades: route("tenant.lms.grades", appRoutes.tenantLmsGrades.path, "tenant", "tenant"),
  lmsGroups: route("tenant.lms.groups", appRoutes.tenantLmsGroups.path, "tenant", "tenant"),
} as const;
