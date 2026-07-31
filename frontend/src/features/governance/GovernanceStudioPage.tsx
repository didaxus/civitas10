import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useParams, Navigate } from "react-router";
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
import { PeopleSegmentationPlaceholder } from "./modules/people-segmentation/PeopleSegmentationPlaceholder";
import { governanceDisplayName } from "./adapters/governance-view-model";
import { flattenGovernanceWorkspaceItems, type GovernanceWorkspaceItemId, GOVERNANCE_WORKSPACE_GROUPS } from "./governance-workspace-contract";
import { useAsyncOperation, useUrlParam } from "../../shared/hooks";

// ============================================================================
// SINGLE SOURCE OF TRUTH: Route pattern to workspace item mapping
// ÚNICO sistema de resolución de rutas - reemplaza legacyTabToWorkspaceItem y ownerPathSegmentToItem
// ============================================================================

/**
 * Maps route patterns (regex) to workspace item IDs.
 * Order matters: more specific patterns should come first.
 */
const ROUTE_PATTERN_TO_ITEM: Array<{
  pattern: RegExp;
  itemId: GovernanceWorkspaceItemId;
}> = [
  // Identity provisioning
  { pattern: /\/governance\/identity-provisioning$/, itemId: "identity-provisioning" },
  { pattern: /\/identity-provisioning$/, itemId: "identity-provisioning" },
  
  // Access policy - Roles and permissions
  { pattern: /\/governance\/access-policy\/roles$/, itemId: "role-permissions" },
  { pattern: /\/roles$/, itemId: "role-permissions" },
  
  // Access policy - Role names
  { pattern: /\/governance\/access-policy\/role-names$/, itemId: "role-names" },
  { pattern: /\/role-names$/, itemId: "role-names" },
  { pattern: /\/navigation$/, itemId: "role-names" },
  
  // Access policy - Scope assignments
  { pattern: /\/governance\/access-policy\/scope-assignments$/, itemId: "scope-assignments" },
  { pattern: /\/data-scopes$/, itemId: "scope-assignments" },
  
  // Organization model - Structure and classification
  { pattern: /\/governance\/organization-model\/structure$/, itemId: "structure-classification" },
  { pattern: /\/structure$/, itemId: "structure-classification" },
  { pattern: /\/taxonomy$/, itemId: "structure-classification" },
  
  // Organization model - Groups and courses
  { pattern: /\/governance\/organization-model\/groups$/, itemId: "groups-courses" },
  { pattern: /\/groups$/, itemId: "groups-courses" },
  
  // Organization model - People segmentation (planned)
  { pattern: /\/governance\/organization-model\/segments$/, itemId: "people-segmentation" },
  { pattern: /\/segments$/, itemId: "people-segmentation" },
  
  // Control and evidence - Access explorer
  { pattern: /\/governance\/control\/access-explorer$/, itemId: "access-explorer" },
  { pattern: /\/preview$/, itemId: "access-explorer" },
  { pattern: /\/access-explorer$/, itemId: "access-explorer" },
  
  // Control and evidence - Audit log
  { pattern: /\/governance\/control\/audit$/, itemId: "audit-log" },
  { pattern: /\/audit$/, itemId: "audit-log" },
  
  // Operations
  { pattern: /\/operations$/, itemId: "operations" },
  
  // Overview (default fallback)
  { pattern: /\/governance\/?$/, itemId: "role-permissions" },
];

/**
 * Legacy query param tab names for backward compatibility redirects.
 * SOLO se usan para detección de redirect, NO para resolución de item activo.
 */
const LEGACY_TAB_REDIRECTS: Record<string, GovernanceWorkspaceItemId> = {
  "overview": "organization-overview",
  "roles-permissions": "role-permissions",
  "taxonomy": "structure-classification",
  "structure": "structure-classification",
  "groups": "groups-courses",
  "data-scopes": "scope-assignments",
  "aliases-navigation": "role-names",
  "access-preview": "access-explorer",
  "audit-diagnostics": "audit-log",
  "members": "role-names",
};

const workspaceItems = flattenGovernanceWorkspaceItems();
const workspaceItemById = Object.fromEntries(workspaceItems.map((item) => [item.id, item])) as Record<GovernanceWorkspaceItemId, (typeof workspaceItems)[number]>;

/**
 * Unified function to resolve active workspace item from URL path.
 * Single source of truth - sin dependencia de surface ni query params.
 */
const resolveActiveItemFromLocation = (pathname: string): GovernanceWorkspaceItemId => {
  const pathParts = pathname.split("/").filter(Boolean);
  const fullPath = "/" + pathParts.join("/");
  
  // Try to match against route patterns (most specific first)
  for (const { pattern, itemId } of ROUTE_PATTERN_TO_ITEM) {
    if (pattern.test(fullPath)) {
      return itemId;
    }
  }
  
  // Fallback: check last path segment directly
  const lastSegment = pathParts[pathParts.length - 1] || "";
  if (lastSegment && workspaceItemById[lastSegment as GovernanceWorkspaceItemId]) {
    return lastSegment as GovernanceWorkspaceItemId;
  }
  
  // Default fallback
  return "role-permissions";
};

/**
 * Detects if current URL has legacy query params that should be redirected.
 * Returns the target workspace item ID if redirect is needed, null otherwise.
 */
const detectLegacyTabRedirect = (search: string): GovernanceWorkspaceItemId | null => {
  const params = new URLSearchParams(search);
  const tabParam = params.get("section") || params.get("tab");
  
  if (!tabParam) return null;
  
  // Check if it's a legacy tab name that needs redirect
  const targetItemId = LEGACY_TAB_REDIRECTS[tabParam];
  if (targetItemId && workspaceItemById[targetItemId]) {
    return targetItemId;
  }
  
  return null;
};

/**
 * Builds the correct URL for a workspace item based on surface and organization.
 */
const buildWorkspaceItemPath = (
  organizationId: string,
  itemId: GovernanceWorkspaceItemId
): string => {
  if (!organizationId) return appRoutes.ownerOrganizations.path;
  
  const item = workspaceItemById[itemId];
  if (!item) return appRoutes.ownerOrganizations.path;
  
  // Use the routeKey from the workspace item contract
  const route = appRoutes[item.routeKey];
  if (route?.build) {
    try {
      return route.build({ organizationId });
    } catch {
      // Fallback if build fails
    }
  }
  
  // Fallback paths
  return appRoutes.ownerOrganizationGovernance.build?.({ organizationId }) ?? appRoutes.ownerOrganizations.path;
};

/**
 * Builds organization surface path (for back navigation)
 */
const buildOrganizationSurfacePath = (organizationId: string) => {
  if (!organizationId) return appRoutes.ownerOrganizations.path;
  return appRoutes.ownerOrganizationState.build?.({ organizationId }) ?? `/o/${encodeURIComponent(organizationId)}`;
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
  if (activeModule === "unavailable" && activeItemId === "people-segmentation") return <PeopleSegmentationPlaceholder />;
  return <UnavailableWorkspacePanel title={item.label} description="Esta funcionalidad estará disponible próximamente." />;
};

export const GovernanceStudioPage = ({ surface }: { surface: GovernanceSurface }) => {
  const params = useParams();
  const location = useLocation();
  const organizationId = params.organizationId ?? params.orgId ?? "";
  const governanceApi = useGovernanceApi();
  const ownerApi = useOwnerApi();
  
  // Resolve active item using unified function (no surface dependency, no query params)
  const activeItemId = resolveActiveItemFromLocation(location.pathname);
  
  // Check for legacy tab redirect - redirección simple sin reescritura compleja
  const legacyRedirectTarget = detectLegacyTabRedirect(location.search);
  if (legacyRedirectTarget) {
    const canonicalPath = buildWorkspaceItemPath(organizationId, legacyRedirectTarget);
    return <Navigate to={canonicalPath} replace />;
  }
  
  // Usar hook centralizado para estado asíncrono de governance read model
  const { 
    data: model, 
    loading, 
    error, 
    execute: fetchGovernanceModel,
    setData: setModel 
  } = useAsyncOperation<GovernanceReadModel>(emptyGovernanceModel(organizationId, surface));
  
  // Estado separado para operational model (solo owner surface)
  const [operationalModel, setOperationalModel] = useState<ConsolidatedOperationalResponse | null>(null);

  // Fetch inicial del governance read model
  useEffect(() => {
    let active = true;
    
    if (!organizationId || !isGovernanceOperationActive(surface, "governance.readModel")) {
      setModel(emptyGovernanceModel(organizationId, surface));
      return () => { active = false; };
    }
    
    const load = surface === "owner" ? governanceApi.getOwnerGovernance : governanceApi.getTenantGovernance;
    void load(organizationId)
      .then((response) => { if (active) setModel(response); })
      .catch(() => { /* error manejado por useAsyncOperation */ });
    
    return () => { active = false; };
  }, [governanceApi, organizationId, surface, setModel]);

  // Fetch del operational model (solo owner)
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
  const organizationSurfacePath = buildOrganizationSurfacePath(organizationId);
  const selectOrganizationPath = surface === "owner" ? appRoutes.ownerOrganizations.path : organizationSurfacePath;

  // Find the group that contains this item for breadcrumb
  const activeGroup = GOVERNANCE_WORKSPACE_GROUPS.find(group => 
    group.items.some(item => item.id === activeItemId)
  );

  return (
    <Layout organizationId={organizationId} isAdmin={surface === "tenant"}>
      <OrganizationContextHeader 
        eyebrow="Organizations / Governance" 
        organizationName={displayName} 
        breadcrumb={
          <>
            <Link to={selectOrganizationPath} className="text-primary-strong">Organizations</Link> /{" "}
            <span>{displayName}</span> /{" "}
            <span>Governance</span> /{" "}
            {activeGroup && <><span>{activeGroup.label}</span> /{" "}</>}
            <span>{activeItem.label}</span>
          </>
        } 
        status={<StatusPill status={model.versions.runtimeStatus === "current" ? "success" : "warning"}>{model.versions.runtimeStatus ?? "pending"}</StatusPill>} 
        actions={<Link className="civitas-secondary-button" to={selectOrganizationPath}>{surface === "owner" ? "Back to Directory" : "Open organization"}</Link>} 
        description={`Administra ${displayName} desde un solo lugar.`} 
      />
      {error && (
        <SectionCard title="Error al cargar" description={error}>
          <Link className="civitas-secondary-button" to={selectOrganizationPath}>Abrir superficie de organización</Link>
        </SectionCard>
      )}
      <section className="min-w-0" aria-labelledby="workspace-section-title">
        <h2 id="workspace-section-title" className="sr-only">{activeItem.label}</h2>
        <GovernanceModules 
          activeItemId={activeItemId} 
          model={model} 
          operationalModel={operationalModel} 
          previewOwnerAccess={governanceApi.previewOwnerAccessReadOnly} 
          previewTenantAccess={governanceApi.previewTenantAccessReadOnly} 
          updateOwnerCeilings={governanceApi.updateOwnerCeilings} 
          updateTenantActivations={governanceApi.updateTenantActivations} 
          refetchReadModel={() => fetchGovernanceModel(() => surface === "owner" ? governanceApi.getOwnerGovernance(organizationId) : governanceApi.getTenantGovernance(organizationId)).then(r => r ?? null)} 
        />
      </section>
    </Layout>
  );
};
