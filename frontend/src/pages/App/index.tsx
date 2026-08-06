import { LogtoProvider, useLogto } from "@logto/react";
import { useEffect, useState } from "react";
import { Routes, Route, Navigate, Link, useLocation, useParams } from "react-router";
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
import { civitasLogtoConfig, getCivitasSignInOptions } from "../../auth/logtoConfig";
import { APP_ENV } from "../../env";
import { OwnerOrganizationRouteBoundary } from "./OwnerOrganizationRouteBoundary";
import { OwnerOrganizationLayout } from "../../layouts/OwnerLayout";
import { DataScopesPage } from "../../features/organization-model/DataScopesPage";
import { StructurePage } from "../../features/organization-model/StructurePage";
import { AccessExplorerPage } from "../../features/organization-model/AccessExplorerPage";

const SESSION_ROUTING_SCOPES = ["roles", "urn:logto:scope:organizations", "urn:logto:scope:organization_roles"] as const;
const runtimeLogtoConfig = {
  ...civitasLogtoConfig,
  scopes: [...new Set([...(civitasLogtoConfig.scopes ?? []), ...SESSION_ROUTING_SCOPES])],
};

const legacyOwnerGovernanceGroupsPath = `${appRoutes.ownerOrganizationState.path}/governance/groups`;
const legacyOwnerGovernanceAuditPath = `${appRoutes.ownerOrganizationState.path}/governance/audit`;
const legacyOwnerGovernancePeopleSegmentationPath = `${appRoutes.ownerOrganizationState.path}/governance/people-segmentation`;

const claimList = (value: unknown) => Array.isArray(value) ? [...new Set(value.map(String).filter(Boolean))] : [];

type EntryState =
  | { status: "loading" }
  | { status: "owner" }
  | { status: "organizations"; organizationIds: string[] }
  | { status: "unavailable"; message: string };

function AuthenticatedEntryRoute({ selectionOnly = false }: { selectionOnly?: boolean }) {
  const { getAccessToken, getIdTokenClaims, signIn } = useLogto();
  const [state, setState] = useState<EntryState>({ status: "loading" });

  useEffect(() => {
    let active = true;

    const resolveEntry = async () => {
      setState({ status: "loading" });
      try {
        const claims = await getIdTokenClaims() as ({ organizations?: unknown } | undefined);
        const organizationIds = claimList(claims?.organizations);

        if (!selectionOnly) {
          try {
            const ownerToken = await getAccessToken(APP_ENV.api.resource);
            if (ownerToken) {
              if (active) setState({ status: "owner" });
              return;
            }
          } catch {
            // A missing global token is not a tenant access denial. Continue with
            // organization-scoped routing instead of forcing the Owner shell.
          }
        }

        if (active && organizationIds.length > 0) {
          setState({ status: "organizations", organizationIds });
          return;
        }

        if (active) {
          setState({
            status: "unavailable",
            message: "This session has neither a Civitas Owner API token nor an organization membership claim. Refresh the session after access is assigned.",
          });
        }
      } catch (error) {
        if (active) {
          setState({ status: "unavailable", message: error instanceof Error ? error.message : "Session routing is unavailable." });
        }
      }
    };

    void resolveEntry();
    return () => { active = false; };
  }, [getAccessToken, getIdTokenClaims, selectionOnly]);

  if (state.status === "loading") {
    return <div className="p-6 text-sm text-muted-strong" role="status">Resolving your Civitas workspace…</div>;
  }

  if (state.status === "owner") {
    return <Navigate to={appRoutes.owner.path} replace />;
  }

  if (state.status === "organizations") {
    if (!selectionOnly && state.organizationIds.length === 1) {
      return <Navigate to={appRoutes.tenantGovernanceDataScopes.build!({ organizationId: state.organizationIds[0] })} replace />;
    }

    return (
      <main className="mx-auto max-w-3xl space-y-4 p-6" aria-labelledby="organization-selection-title">
        <h1 id="organization-selection-title" className="text-2xl font-semibold">Select an organization</h1>
        <p className="text-sm text-muted-strong">Open an organization-scoped Governance workspace using its Logto organization token.</p>
        <ul className="space-y-2">
          {state.organizationIds.map((organizationId) => (
            <li key={organizationId}>
              <Link
                className="block rounded-md border border-border bg-surface px-4 py-3 hover:bg-surface-subtle"
                to={appRoutes.tenantGovernanceDataScopes.build!({ organizationId })}
              >
                {organizationId}
              </Link>
            </li>
          ))}
        </ul>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6" aria-labelledby="session-access-title">
      <h1 id="session-access-title" className="text-2xl font-semibold">Workspace access unavailable</h1>
      <p className="text-sm text-muted-strong">{state.message}</p>
      <button
        type="button"
        className="rounded-md bg-primary px-4 py-2 text-on-primary"
        onClick={() => void signIn(getCivitasSignInOptions())}
      >
        Refresh sign-in session
      </button>
    </main>
  );
}

function App() {
  return (
    <LogtoProvider config={runtimeLogtoConfig}>
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

function OrganizationModelRoute({ page, surface = "owner" }: { page: "data-scopes" | "structure" | "access-explorer"; surface?: "owner" | "tenant" }) {
  const { organizationId = "" } = useParams();
  return page === "data-scopes" ? <DataScopesPage organizationId={organizationId} surface={surface} /> : page === "structure" ? <StructurePage organizationId={organizationId} surface={surface} /> : <AccessExplorerPage organizationId={organizationId} surface={surface} />;
}

function OrganizationModelTenantRoute({ page }: { page: "data-scopes" | "structure" | "access-explorer" }) {
  const { organizationId = "" } = useParams();
  return <TenantAuthorizationProvider organizationId={organizationId}><OrganizationModelRoute page={page} surface="tenant" /></TenantAuthorizationProvider>;
}

function AppContent() {
  const { isAuthenticated } = useLogto();
  if (!isAuthenticated) return <Landing />;
  return (
    <Routes>
      <Route path="/" element={<AuthenticatedEntryRoute />} />
      <Route path={appRoutes.selectOrganization.path} element={<AuthenticatedEntryRoute selectionOnly />} />
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
