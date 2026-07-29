import type { NavigationNode } from "./routes";
import { appRoutes, ownerNavigationTree } from "./routes";
import { GOVERNANCE_WORKSPACE_GROUPS, type GovernanceWorkspaceItem } from "../features/governance/governance-workspace-contract";
import { isConcreteRouteParam } from "./route-builders";

export const materializeNavigationTree = (items: readonly NavigationNode[], params: Record<string, string | undefined> = {}): NavigationNode[] => items.flatMap((item) => {
  let path = item.path;
  if (item.build) {
    try {
      path = item.build(params as Record<string, string>);
    } catch {
      return [];
    }
  }
  return [{ ...item, path, children: item.children ? materializeNavigationTree(item.children, params) : undefined }];
});


export type OwnerNavigationTreeInput = {
  organizationId?: string;
  organizationName?: string | null;
};

export const buildOwnerNavigationTree = ({ organizationId, organizationName }: OwnerNavigationTreeInput = {}): NavigationNode[] => {
  const baseTree = ownerNavigationTree.map((item) => ({ ...item, children: item.children ? [...item.children] : undefined }));
  if (!isConcreteRouteParam(organizationId)) return baseTree;

  const governanceItemToNavigationNode = (item: GovernanceWorkspaceItem): NavigationNode => ({
    ...appRoutes[item.routeKey],
    id: item.id,
    label: item.label,
    status: item.status,
    actionId: item.actionId,
    ownerPermissionRequirement: item.ownerPermissionRequirement,
    tenantPermissionRequirement: item.tenantPermissionRequirement,
  } as NavigationNode);
  const governanceChildren = GOVERNANCE_WORKSPACE_GROUPS
    .filter((group) => group.id !== "operations")
    .map((group) => ({
      path: `/owner/organizations/${encodeURIComponent(organizationId)}/governance/${group.id}-section`,
      label: group.label,
      iconKey: "governance",
      structural: true,
      children: group.items.filter((item) => item.id !== "identity-provisioning").map(governanceItemToNavigationNode),
    } as NavigationNode));

  void organizationName;
  return [
    { path: appRoutes.ownerOrganizations.path, label: "Volver al directorio", iconKey: "directory" },
    appRoutes.ownerOrganizationState,
    { ...appRoutes.ownerOrganizationGovernance, path: `/owner/organizations/${encodeURIComponent(organizationId)}/governance-section`, build: undefined, route: undefined, label: "Gobierno", structural: true, children: governanceChildren },
    appRoutes.ownerOrganizationOperations,
  ];
};
