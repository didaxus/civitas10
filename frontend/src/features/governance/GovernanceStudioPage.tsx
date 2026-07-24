import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { OwnerLayout } from "../../layouts/OwnerLayout";
import { OrganizationLayout } from "../../layouts/OrganizationLayout";
import { OrganizationContextHeader, SectionCard, StateRegion, StatusPill } from "../../shared/ui";
import { useOwnerApi } from "../../api/owner";
import { validateOperationalResponse, type ConsolidatedOperationalResponse } from "../../contracts/operational";
import { isInvalidOrganizationId, OperationalModules, OperationalOverview } from "../owner/organization/operationalCards";
import { useGovernanceApi } from "./api";
import { appRoutes } from "../../navigation/routes";
import { governanceModuleStatus, isGovernanceOperationActive } from "./governance-capabilities";
import type { GovernanceModuleKey, GovernanceReadModel, GovernanceSurface } from "./contracts";
import { PermissionMatrixModule } from "./modules/permission-matrix/PermissionMatrixModule";
import { MembersRoleAssignmentsModule } from "./modules/members/MembersRoleAssignmentsModule";
import { UnitsModule } from "./modules/units/UnitsModule";
import { DataScopeModule } from "./modules/data-scope/DataScopeModule";
import { AliasesNavigationModule } from "./modules/aliases-navigation/AliasesNavigationModule";
import { AccessPreviewModule, AccessPreviewUnavailable } from "./modules/access-preview/AccessPreviewModule";
import { AuditDiagnosticsModule } from "./modules/audit/AuditDiagnosticsModule";
import { IdentityProvisioningModule } from "./modules/identity-provisioning/IdentityProvisioningModule";
import { governanceDisplayName } from "./adapters/governance-view-model";
import { flattenGovernanceWorkspaceItems, type GovernanceWorkspaceItemId } from "./governance-workspace-contract";

type LegacyGovernanceTabId = "overview" | "roles-permissions" | "taxonomy" | "structure" | "groups" | "data-scopes" | "aliases-navigation" | "access-preview" | "audit-diagnostics" | "members";

const legacyTabToWorkspaceItem: Record<LegacyGovernanceTabId, GovernanceWorkspaceItemId> = {
  overview: "organization-overview",
  "roles-permissions": "role-permissions",
  members: "role-names",
  taxonomy: "structure-classification",
  structure: "structure-classification",
  groups: "groups-courses",
  "data-scopes": "scope-assignments",
  "aliases-navigation": "role-names",
  "access-preview": "access-explorer",
  "audit-diagnostics": "audit-log",
};

const ownerPathSegmentToItem: Record<string, GovernanceWorkspaceItemId> = {
  roles: "role-permissions",
  taxonomy: "structure-classification",
  structure: "structure-classification",
  groups: "groups-courses",
  "data-scopes": "scope-assignments",
  navigation: "role-names",
  "role-names": "role-names",
  preview: "access-explorer",
  audit: "audit-log",
  "people-segmentation": "people-segmentation",
  "identity-provisioning": "identity-provisioning",
  operations: "operations",
};


const buildOrganizationSurfacePath = (surface: GovernanceSurface, organizationId: string) => {
  if (!organizationId) return appRoutes.ownerOrganizations.path;
  return surface === "owner" ? appRoutes.ownerOrganizationState.build?.({ organizationId }) ?? appRoutes.ownerOrganizations.path : `/o/${encodeURIComponent(organizationId)}`;
};

const workspaceItems = flattenGovernanceWorkspaceItems();
const workspaceItemById = Object.fromEntries(workspaceItems.map((item) => [item.id, item])) as Record<GovernanceWorkspaceItemId, (typeof workspaceItems)[number]>;



const activeItemFromLocation = (surface: GovernanceSurface, pathname: string, search: string): GovernanceWorkspaceItemId => {
  if (surface === "tenant") {
    const pathParts = pathname.split("/").filter(Boolean);
    if (pathParts.includes("identity-provisioning")) return "identity-provisioning";
    if (pathParts.includes("roles")) return "role-permissions";
    if (pathParts.includes("role-names")) return "role-names";
    if (pathParts.includes("structure")) return "structure-classification";
    const params = new URLSearchParams(search);
    const tab = (params.get("section") || params.get("tab")) as LegacyGovernanceTabId | GovernanceWorkspaceItemId | null;
    if (tab && workspaceItemById[tab as GovernanceWorkspaceItemId]) return tab as GovernanceWorkspaceItemId;
    if (tab && legacyTabToWorkspaceItem[tab as LegacyGovernanceTabId]) return legacyTabToWorkspaceItem[tab as LegacyGovernanceTabId];
    return "role-permissions";
  }
  const pathParts = pathname.split("/").filter(Boolean);
  if (pathParts.includes("governance")) {
    const last = pathParts[pathParts.length - 1] || "governance";
    return ownerPathSegmentToItem[last] ?? "role-permissions";
  }
  const last = pathParts[pathParts.length - 1] || "";
  return ownerPathSegmentToItem[last] ?? "organization-overview";
};

const emptyGovernanceModel = (organizationId: string, surface: GovernanceSurface): GovernanceReadModel => ({
  organizationId,
  surface,
  organizationName: null,
  versions: { catalogVersion: "unavailable", runtimeStatus: "pending" },
  modules: governanceModuleStatus(surface),
  permissionMatrix: [],
  taxonomy: [],
  units: [],
  dataScopes: [],
  aliasesNavigation: { aliasesTenantEditable: false, navigationTenantEditable: false, visualPreferences: [] },
  accessPreviews: [],
  auditEvents: [],
  diagnostics: [{ code: "read_model_pending", severity: "info", message: "Governance read model has not been loaded." }],
});

const UnavailableWorkspacePanel = ({ title, description }: { title: string; description: string }) => (
  <SectionCard title={title} description={description}>
    <p className="text-sm text-muted-strong">This workspace task is not available yet. No data is loaded for planned capabilities.</p>
  </SectionCard>
);

const GovernanceModules = ({ activeItemId, model, operationalModel, previewOwnerAccess, previewTenantAccess, updateOwnerCeilings, updateTenantActivations, refetchReadModel }: { activeItemId: GovernanceWorkspaceItemId; model: GovernanceReadModel; operationalModel: ConsolidatedOperationalResponse | null; previewOwnerAccess: ReturnType<typeof useGovernanceApi>["previewOwnerAccessReadOnly"]; previewTenantAccess: ReturnType<typeof useGovernanceApi>["previewTenantAccessReadOnly"]; updateOwnerCeilings: ReturnType<typeof useGovernanceApi>["updateOwnerCeilings"]; updateTenantActivations: ReturnType<typeof useGovernanceApi>["updateTenantActivations"]; refetchReadModel: () => Promise<void> }) => {
  const item = workspaceItemById[activeItemId] ?? workspaceItems[0];
  const activeModule = item.moduleKey as GovernanceModuleKey | "unavailable" | "organization-overview" | "operations";
  if (activeModule === "organization-overview") return operationalModel ? <OperationalOverview organization={operationalModel} /> : <StateRegion><p className="text-sm text-muted-strong">Preparing organization overview...</p></StateRegion>;
  if (activeModule === "operations") return operationalModel ? <OperationalModules organization={operationalModel} /> : <StateRegion><p className="text-sm text-muted-strong">Preparing operations...</p></StateRegion>;
  const previewModel = { ...model, previewOwnerAccess, previewTenantAccess };
  if (activeModule === "permissions") return <PermissionMatrixModule organizationId={model.organizationId} rows={model.permissionMatrix} roles={model.roles || []} surface={model.surface} versions={model.versions} onSaveOwnerCeilings={async (input) => { await updateOwnerCeilings(model.organizationId, input); await refetchReadModel(); }} onSaveTenantActivations={async (input) => { await updateTenantActivations(model.organizationId, input); await refetchReadModel(); }} />;
  if (activeModule === "members") return <MembersRoleAssignmentsModule members={model.members || []} />;
  if (activeModule === "taxonomy") return <UnitsModule units={model.units} taxonomy={model.taxonomy} surface={model.surface} />;
  if (activeModule === "units") return <UnitsModule units={model.units} taxonomy={model.taxonomy} surface={model.surface} />;
  if (activeModule === "lms-groups") return <UnitsModule units={model.units} taxonomy={model.taxonomy} surface={model.surface} />;
  if (activeModule === "data-scope") return <DataScopeModule assignments={model.dataScopes} roles={model.roles || []} />;
  if (activeModule === "aliases-navigation") return <AliasesNavigationModule roles={model.roles ?? []} policy={model.aliasesNavigation} surface={model.surface} />;
  if (activeModule === "access-preview") {
    if (!isGovernanceOperationActive(model.surface, "governance.accessPreview")) return <AccessPreviewUnavailable />;
    return <AccessPreviewModule organizationId={model.organizationId} surface={model.surface} previews={model.accessPreviews} onPreview={previewModel.surface === "owner" ? previewOwnerAccess : previewTenantAccess} />;
  }
  if (activeModule === "identity-provisioning") return <IdentityProvisioningModule organizationId={model.organizationId} surface={model.surface} summary={model.identityProvisioning} />;
  if (activeModule === "audit") return <AuditDiagnosticsModule events={model.auditEvents} />;
  return <UnavailableWorkspacePanel title={item.label} description="People segmentation is not available yet." />;
};

export const GovernanceStudioPage = ({ surface }: { surface: GovernanceSurface }) => {
  const params = useParams();
  const location = useLocation();
  const organizationId = params.organizationId ?? params.orgId ?? "";
  const governanceApi = useGovernanceApi();
  const ownerApi = useOwnerApi();
  const activeItemId = activeItemFromLocation(surface, location.pathname, location.search);
  const [model, setModel] = useState<GovernanceReadModel>(() => emptyGovernanceModel(organizationId, surface));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [operationalModel, setOperationalModel] = useState<ConsolidatedOperationalResponse | null>(null);

  const refetchGovernanceReadModel = useCallback(() => {
    if (!organizationId || !isGovernanceOperationActive(surface, "governance.readModel")) return Promise.resolve();
    setLoading(true);
    setError(null);
    const load = surface === "owner" ? governanceApi.getOwnerGovernance : governanceApi.getTenantGovernance;
    return load(organizationId)
      .then((response) => { setModel(response); })
      .catch((caught) => { setError(caught instanceof Error ? caught.message : "Governance read model unavailable."); })
      .finally(() => { setLoading(false); });
  }, [governanceApi, organizationId, surface]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    if (!organizationId || !isGovernanceOperationActive(surface, "governance.readModel")) {
      setModel(emptyGovernanceModel(organizationId, surface));
      setError(!organizationId ? "Choose an organization from Directory to open its Governance workspace." : null);
      setLoading(false);
      return () => { active = false; };
    }
    const load = surface === "owner" ? governanceApi.getOwnerGovernance : governanceApi.getTenantGovernance;
    void load(organizationId)
      .then((response) => { if (active) setModel(response); })
      .catch((caught) => { if (active) { setError(caught instanceof Error ? caught.message : "Governance read model unavailable."); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [governanceApi, organizationId, surface]);


  useEffect(() => {
    let active = true;
    if (surface !== "owner" || isInvalidOrganizationId(organizationId)) {
      setOperationalModel(null);
      return () => { active = false; };
    }
    void ownerApi.getOrganizationOperationalState(organizationId)
      .then((response) => {
        const contract = validateOperationalResponse(response);
        if (active) setOperationalModel(contract.ok ? contract.value : null);
      })
      .catch(() => { if (active) setOperationalModel(null); });
    return () => { active = false; };
  }, [organizationId, ownerApi, surface]);

  const Layout = surface === "owner" ? OwnerLayout : OrganizationLayout;
  const displayName = governanceDisplayName(model, organizationId);
  const activeItem = workspaceItemById[activeItemId] ?? workspaceItems[0];
  const organizationSurfacePath = buildOrganizationSurfacePath(surface, organizationId);
  const selectOrganizationPath = surface === "owner" ? appRoutes.ownerOrganizations.path : organizationSurfacePath;

  return (
    <Layout organizationId={organizationId} isAdmin={surface === "tenant"}>
      <OrganizationContextHeader eyebrow="Organizations / Governance" organizationName={displayName} breadcrumb={<><Link to={selectOrganizationPath} className="text-primary-strong">Organizations</Link> / <span>{displayName}</span> / <span>Governance</span> / <span>{activeItem.label}</span></>} status={<StatusPill status={model.versions.runtimeStatus === "current" ? "success" : "warning"}>{model.versions.runtimeStatus ?? "pending"}</StatusPill>} actions={<Link className="civitas-secondary-button" to={selectOrganizationPath}>{surface === "owner" ? "Back to Directory" : "Open organization"}</Link>} description="Operational governance workspace for access policy, organization model, control and evidence. The overview and operations share this persistent organization shell." />
      {error ? <SectionCard title="Select an organization" description={error}><Link className="civitas-secondary-button" to={selectOrganizationPath}>Open organization surface</Link></SectionCard> : null}
      {loading ? <StateRegion><p className="text-sm text-muted-strong">Preparing governance data...</p></StateRegion> : null}
      <section className="min-w-0" aria-labelledby="workspace-section-title">
        <h2 id="workspace-section-title" className="sr-only">{activeItem.label}</h2>
        <GovernanceModules activeItemId={activeItemId} model={model} operationalModel={operationalModel} previewOwnerAccess={governanceApi.previewOwnerAccessReadOnly} previewTenantAccess={governanceApi.previewTenantAccessReadOnly} updateOwnerCeilings={governanceApi.updateOwnerCeilings} updateTenantActivations={governanceApi.updateTenantActivations} refetchReadModel={refetchGovernanceReadModel} />
      </section>
      <p className="text-xs text-muted">Need operational context? <Link className="text-primary-strong" to={organizationSurfacePath}>Open organization surface</Link>. Visibility is resolved by the screen/action registry and backend decisions; this workspace never evaluates roles or JWT claims in the presentation layer.</p>
    </Layout>
  );
};
