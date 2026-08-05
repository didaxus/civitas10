import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "react-router";
import { SectionCard } from "../../shared/ui";
import { useGovernanceApi } from "./api";
import { isGovernanceOperationActive } from "./governance-capabilities";
import type { GovernanceModuleKey, GovernanceReadModel, GovernanceSurface } from "./contracts";
import { PermissionMatrixModule } from "./modules/permission-matrix/PermissionMatrixModule";
import { UnitsModule } from "./modules/units/UnitsModule";
import { DataScopeModule } from "./modules/data-scope/DataScopeModule";
import { AliasesNavigationModule } from "./modules/aliases-navigation/AliasesNavigationModule";
import { AccessPreviewModule, AccessPreviewUnavailable } from "./modules/access-preview/AccessPreviewModule";
import { AuditDiagnosticsModule } from "./modules/audit/AuditDiagnosticsModule";
import { PeopleSegmentationModule } from "./modules/people-segmentation/PeopleSegmentationModule";
import { GOVERNANCE_WORKSPACE_ITEMS, type GovernanceWorkspaceItemId } from "./governance-workspace-contract";

const emptyGovernanceModel = (organizationId: string, surface: GovernanceSurface): GovernanceReadModel => ({
  organizationId, surface, organizationName: null,
  versions: { catalogVersion: "unavailable", runtimeStatus: "pending" }, modules: {}, permissionMatrix: [], taxonomy: [], units: [], dataScopes: [],
  aliasesNavigation: { aliasesTenantEditable: false, navigationTenantEditable: false, visualPreferences: [] }, segmentation: { organizationId, segments: [], cohortRule: "" }, roleNames: { globalVersion: "0", organizationVersion: "0", organizationId, rows: [], diagnostics: [] }, accessPreviews: [], auditEvents: [], diagnostics: [],
});

const itemFromPath = (pathname: string): GovernanceWorkspaceItemId => {
  if (pathname.endsWith("/role-names")) return "role-names";
  if (pathname.endsWith("/scope-assignments")) return "scope-assignments";
  if (pathname.endsWith("/structure")) return "structure-classification";
  if (pathname.endsWith("/segments")) return "people-segmentation";
  if (pathname.endsWith("/access-explorer")) return "access-explorer";
  if (pathname.endsWith("/audit")) return "audit-log";
  return "role-permissions";
};

export const GovernanceStudioPage = ({ surface }: { surface: GovernanceSurface }) => {
  const { organizationId = "" } = useParams();
  const { pathname } = useLocation();
  const api = useGovernanceApi();
  const [model, setModel] = useState(() => emptyGovernanceModel(organizationId, surface));
  const [error, setError] = useState("");
  const activeItemId = itemFromPath(pathname);
  const item = useMemo(() => GOVERNANCE_WORKSPACE_ITEMS.find((candidate) => candidate.id === activeItemId) ?? GOVERNANCE_WORKSPACE_ITEMS[0], [activeItemId]);

  useEffect(() => {
    let active = true;
    if (!organizationId || !isGovernanceOperationActive(surface, "governance.readModel")) return () => { active = false; };
    const load = surface === "owner" ? api.getOwnerGovernance : api.getTenantGovernance;
    void load(organizationId).then((value) => { if (active) setModel(value); }).catch(() => { if (active) setError("Governance data could not be loaded."); });
    return () => { active = false; };
  }, [api, organizationId, surface]);

  const refresh = async () => {
    const load = surface === "owner" ? api.getOwnerGovernance : api.getTenantGovernance;
    setModel(await load(organizationId));
  };
  const moduleKey = item.moduleKey as GovernanceModuleKey | "unavailable";
  let content;
  if (moduleKey === "permissions") content = <PermissionMatrixModule organizationId={organizationId} rows={model.permissionMatrix} roles={model.roles || []} surface={surface} versions={model.versions} onSaveOwnerCeilings={async (input) => { await api.updateOwnerCeilings(organizationId, input); await refresh(); }} onSaveTenantActivations={async (input) => { await api.updateTenantActivations(organizationId, input); await refresh(); }} onReload={refresh} />;
  else if (moduleKey === "aliases-navigation") content = <AliasesNavigationModule roleNames={model.roleNames} surface={surface} organizationId={organizationId} organizationName={model.organizationName} onUpdateOwnerRoleLabel={api.updateOwnerRoleLabel} onUpdateOrganizationRoleAlias={async (input) => api.updateOrganizationRoleAlias(organizationId, input)} onReload={refresh} />;
  else if (moduleKey === "data-scope") content = <DataScopeModule assignments={model.dataScopes} roles={model.roles || []} />;
  else if (moduleKey === "taxonomy") content = <UnitsModule units={model.units} taxonomy={model.taxonomy} surface={surface} />;
  else if (moduleKey === "access-preview") content = isGovernanceOperationActive(surface, "governance.accessPreview") ? <AccessPreviewModule organizationId={organizationId} surface={surface} previews={model.accessPreviews} onPreview={surface === "owner" ? api.previewOwnerAccessReadOnly : api.previewTenantAccessReadOnly} /> : <AccessPreviewUnavailable />;
  else if (moduleKey === "audit") content = <AuditDiagnosticsModule events={model.auditEvents} />;
  else if (moduleKey === "people-segmentation") content = <PeopleSegmentationModule segmentation={model.segmentation} />;
  else content = <PeopleSegmentationModule segmentation={model.segmentation} />;

  return <section className="min-w-0" aria-labelledby="governance-screen-title"><h1 id="governance-screen-title" className="sr-only">{item.label}</h1>{error ? <SectionCard title="Unable to load governance" description={error}><p>Please try again.</p></SectionCard> : content}</section>;
};
