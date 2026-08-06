import { LogtoProvider, useLogto } from "@logto/react";
import { Routes, Route, Navigate, useLocation, useParams } from "react-router";
import Landing from "./Landing";
import Callback from "../Callback";
import OrganizationPage from "../OrganizationPage";
import OwnerOrganizationsPage from "../OwnerOrganizationsPage";
import OwnerOrganizationsIndexPage from "../OwnerOrganizationsIndexPage";
import OwnerOperationalHomePage from "../OwnerOperationalHomePage";
import OwnerWorkerQueuesPage from "../OwnerWorkerQueuesPage";
import OwnerOrganizationOperationalPage from "../OwnerOrganizationOperationalPage";
import OwnerOrganizationMembersPage from "../OwnerOrganizationMembersPage";
import { GovernanceStudioPage } from "../../features/governance/GovernanceStudioPage";
import { appRoutes } from "../../navigation/routes";
import { isConcreteRouteParam } from "../../navigation/route-builders";
import { OwnerRouteGuard } from "../../authz/OwnerRouteGuard";
import { ScreenGate } from "../../authorization/components/ScreenGate";
import { TenantAuthorizationProvider } from "../../authorization/AuthorizationProvider";
import { civitasLogtoConfig } from "../../auth/logtoConfig";
import { OwnerOrganizationRouteBoundary } from "./OwnerOrganizationRouteBoundary";
import { OwnerOrganizationLayout } from "../../layouts/OwnerLayout";
import { DataScopesPage } from "../../features/organization-model/DataScopesPage";
import { StructurePage } from "../../features/organization-model/StructurePage";
import { AccessExplorerPage } from "../../features/organization-model/AccessExplorerPage";

const legacyOwnerGovernanceGroupsPath = `${appRoutes.ownerOrganizationState.path}/governance/groups`;
const legacyOwnerGovernanceAuditPath = `${appRoutes.ownerOrganizationState.path}/governance/audit`;
const legacyOwnerGovernancePeopleSegmentationPath = `${appRoutes.ownerOrganizationState.path}/governance/people-segmentation`;

function App() {
  return (
    <LogtoProvider config={civitasLogtoConfig}>
      <div className="min-h-screen bg-bg text-text">
        <Routes>
          <Route path="/callback" element={<Callback />} />
          <Route path="/*" element={<AppContent />} />
        </Routes>
      </div>
    </LogtoProvider>
  );
}

function OwnerOrganizationShellRoute() {
  const { organizationId = "" } = useParams();
  return <OwnerOrganizationRouteBoundary organizationId={organizationId}><OwnerOrganizationLayout /></OwnerOrganizationRouteBoundary>;
}

function GovernanceIndexRoute() {
  const { organizationId = "" } = useParams();
  if (!isConcreteRouteParam(organizationId)) return <Navigate to={appRoutes.ownerOrganizations.path} replace />;
  return <Navigate to={appRoutes.ownerOrganizationGovernanceRoles.build!({ organizationId })} replace />;
}

function OrganizationRedirect({ to }: { to: (organizationId: string) => string }) {
  const { organizationId = "" } = useParams();
  const { search } = useLocation();
  if (!isConcreteRouteParam(organizationId)) return <Navigate to={appRoutes.ownerOrganizations.path} replace />;
  return <Navigate to={`${to(organizationId)}${search}`} replace />;
}

function TenantGovernanceRoute() {
  const { organizationId = "" } = useParams();
  return (
    <TenantAuthorizationProvider organizationId={organizationId}>
      <ScreenGate screenId="tenant-governance"><GovernanceStudioPage surface="tenant" /></ScreenGate>
    </TenantAuthorizationProvider>
  );
}

function OrganizationModelRoute({ page }: { page: "data-scopes" | "structure" | "access-explorer" }) {
  const { organizationId = "" } = useParams();
  return page === "data-scopes" ? <DataScopesPage organizationId={organizationId} /> : page === "structure" ? <StructurePage organizationId={organizationId} /> : <AccessExplorerPage organizationId={organizationId} />;
}

function OrganizationModelTenantRoute({ page }: { page: "data-scopes" | "structure" | "access-explorer" }) {
  const { organizationId = "" } = useParams();
  return <TenantAuthorizationProvider organizationId={organizationId}><OrganizationModelRoute page={page} /></TenantAuthorizationProvider>;
}

function AppContent() {
  const { isAuthenticated } = useLogto();
  if (!isAuthenticated) return <Landing />;
  return (
    <Routes>
      <Route path="/" element={<Navigate to={appRoutes.owner.path} replace />} />
      <Route path={appRoutes.owner.path} element={<OwnerRouteGuard><ScreenGate screenId="owner-overview"><OwnerOperationalHomePage /></ScreenGate></OwnerRouteGuard>} />
      <Route path={appRoutes.ownerOrganizations.path} element={<OwnerRouteGuard><ScreenGate screenId="owner-organizations"><OwnerOrganizationsIndexPage /></ScreenGate></OwnerRouteGuard>} />
      <Route path={appRoutes.ownerCreateOrganization.path} element={<OwnerRouteGuard><ScreenGate screenId="owner-organizations-create"><OwnerOrganizationsPage /></ScreenGate></OwnerRouteGuard>} />
      <Route path={appRoutes.ownerOrganizationState.path} element={<OwnerRouteGuard><OwnerOrganizationShellRoute /></OwnerRouteGuard>}>
        <Route index element={<ScreenGate screenId="owner-organization-state"><OwnerOrganizationOperationalPage initialSection="overview" /></ScreenGate>} />
        <Route path={appRoutes.ownerOrganizationOperations.path} element={<ScreenGate screenId="owner-organization-state"><OwnerOrganizationOperationalPage initialSection="operations" /></ScreenGate>} />
        <Route path={appRoutes.ownerOrganizationMembers.path} element={<ScreenGate screenId="owner-governance"><OwnerOrganizationMembersPage /></ScreenGate>} />
        <Route path={appRoutes.ownerOrganizationGovernance.path} element={<GovernanceIndexRoute />} />
        <Route path={appRoutes.ownerOrganizationGovernanceRoles.path} element={<ScreenGate screenId="owner-governance"><GovernanceStudioPage surface="owner" /></ScreenGate>} />
        <Route path={appRoutes.ownerOrganizationGovernanceStructure.path} element={<OrganizationModelRoute page="structure" />} />
        <Route path={appRoutes.ownerOrganizationGovernanceDataScopes.path} element={<OrganizationModelRoute page="data-scopes" />} />
        <Route path={appRoutes.ownerOrganizationGovernanceScopeAssignments.path} element={<ScreenGate screenId="owner-governance"><GovernanceStudioPage surface="owner" /></ScreenGate>} />
        <Route path={appRoutes.ownerOrganizationGovernanceRoleNames.path} element={<ScreenGate screenId="owner-governance"><GovernanceStudioPage surface="owner" /></ScreenGate>} />
        <Route path={appRoutes.ownerOrganizationGovernancePreview.path} element={<OrganizationModelRoute page="access-explorer" />} />
        <Route path={appRoutes.ownerOrganizationGovernanceAudit.path} element={<ScreenGate screenId="owner-governance"><GovernanceStudioPage surface="owner" /></ScreenGate>} />
        <Route path={appRoutes.ownerOrganizationGovernancePeopleSegmentation.path} element={<ScreenGate screenId="owner-governance"><GovernanceStudioPage surface="owner" /></ScreenGate>} />
        <Route path={legacyOwnerGovernanceGroupsPath} element={<OrganizationRedirect to={(organizationId) => appRoutes.ownerOrganizationGovernanceStructure.build!({ organizationId })} />} />
        <Route path={legacyOwnerGovernanceAuditPath} element={<OrganizationRedirect to={(organizationId) => appRoutes.ownerOrganizationGovernanceAudit.build!({ organizationId })} />} />
        <Route path={legacyOwnerGovernancePeopleSegmentationPath} element={<OrganizationRedirect to={(organizationId) => appRoutes.ownerOrganizationGovernancePeopleSegmentation.build!({ organizationId })} />} />
      </Route>
      <Route path={appRoutes.ownerGovernance.path} element={<Navigate to={appRoutes.ownerOrganizations.path} replace />} />
      <Route path={appRoutes.ownerSystem.path} element={<OwnerRouteGuard><ScreenGate screenId="owner-worker-queues"><OwnerWorkerQueuesPage /></ScreenGate></OwnerRouteGuard>} />
      <Route path={appRoutes.ownerWorkerQueues.path} element={<OwnerRouteGuard><ScreenGate screenId="owner-worker-queues"><OwnerWorkerQueuesPage /></ScreenGate></OwnerRouteGuard>} />
      <Route path={appRoutes.tenantGovernance.path} element={<TenantGovernanceRoute />} />
      <Route path={appRoutes.tenantGovernanceRoles.path} element={<TenantGovernanceRoute />} />
      <Route path={appRoutes.tenantGovernanceRoleNames.path} element={<TenantGovernanceRoute />} />
      <Route path={appRoutes.tenantGovernanceStructure.path} element={<OrganizationModelTenantRoute page="structure" />} />
      <Route path={appRoutes.tenantGovernanceDataScopes.path} element={<OrganizationModelTenantRoute page="data-scopes" />} />
      <Route path={appRoutes.tenantGovernanceScopeAssignments.path} element={<TenantGovernanceRoute />} />
      <Route path={appRoutes.tenantGovernanceAccessExplorer.path} element={<OrganizationModelTenantRoute page="access-explorer" />} />
      <Route path={appRoutes.tenantGovernancePeopleSegmentation.path} element={<TenantGovernanceRoute />} />
      <Route path={appRoutes.tenantGovernanceProvisioning.path} element={<TenantGovernanceRoute />} />
      <Route path="/:orgId" element={<OrganizationPage />} />
    </Routes>
  );
}

export default App;
