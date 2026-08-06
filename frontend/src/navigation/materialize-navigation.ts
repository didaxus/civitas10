import type { NavigationNode } from "./routes";
import { appRoutes, ownerNavigationTree } from "./routes";
import { GOVERNANCE_WORKSPACE_ITEMS } from "../features/governance/governance-workspace-contract";
import { isConcreteRouteParam } from "./route-builders";

export const materializeNavigationTree = (items: readonly NavigationNode[], params: Record<string, string | undefined> = {}): NavigationNode[] => items.flatMap((item) => {
  let path = item.path;
  if (item.build) {
    try { path = item.build(params as Record<string, string>); } catch { return []; }
  }
  return [{ ...item, path, children: item.children ? materializeNavigationTree(item.children, params) : undefined }];
});

export type OwnerNavigationTreeInput = { organizationId?: string; organizationName?: string | null; visibleOrganizationModelActions?: ReadonlySet<string> };

export const buildOwnerNavigationTree = ({ organizationId, visibleOrganizationModelActions }: OwnerNavigationTreeInput = {}): NavigationNode[] => {
  if (!isConcreteRouteParam(organizationId)) return ownerNavigationTree;
  const governanceChildren = GOVERNANCE_WORKSPACE_ITEMS.filter((item) => !item.actionId.startsWith("organizationModel.") || visibleOrganizationModelActions?.has(item.actionId)).map((item) => ({ ...appRoutes[item.routeKey], label: item.label }));
  return [
    { ...appRoutes.ownerOrganizations, label: "Back to Directory", iconKey: "back", contextual: true },
    appRoutes.ownerOrganizationState,
    { ...appRoutes.ownerOrganizationGovernance, path: "", build: undefined, route: undefined, structural: true, children: governanceChildren },
    appRoutes.ownerOrganizationMembers,
    appRoutes.ownerOrganizationOperations,
  ];
};
