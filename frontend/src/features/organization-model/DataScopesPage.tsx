import { useCallback, useState } from "react";
import { SectionCard } from "../../shared/ui";
import { AuthorizationAction, AuthorizationBoundary, OrganizationModelAuthorizationProvider, ScopedDataNotice, useAuthorizationDecision, useAuthorizedMutation, useAuthorizedQuery } from "./authorization";
import { OrganizationModelSurfaceProvider, useOrganizationModelApi, type OrganizationModelSurface } from "./api";
import { DataScopesWorkspace, type Workspace } from "./DataScopesWorkspace";

function DraftInitialization({ organizationId, publication, onCreated }: { organizationId: string; publication?: Record<string, unknown> | null; onCreated: () => void }) {
  const api = useOrganizationModelApi();
  const [error, setError] = useState("");
  const create = useAuthorizedMutation((_: void, signal) => api.initializeOrganizationModel.mutate(organizationId, crypto.randomUUID(), signal));
  return <SectionCard title={publication ? "Continue from the published model" : "Create the organization model"} description="The backend creates and validates the draft. No model data is constructed in this browser.">
    {error ? <p role="alert" className="mb-3 text-danger">{error}</p> : null}
    <AuthorizationAction type="button" className="rounded-md bg-primary px-4 py-2 text-on-primary disabled:opacity-50" onClick={() => void create().then(onCreated).catch(caught => setError(caught instanceof Error ? caught.message : "The draft could not be created."))}>{publication ? "Create draft from published version" : "Create organization model"}</AuthorizationAction>
  </SectionCard>;
}

function WorkspaceLoader({ organizationId, surface }: { organizationId: string; surface: OrganizationModelSurface }) {
  const api = useOrganizationModelApi();
  const { decision } = useAuthorizationDecision();
  const [revision, setRevision] = useState(0);
  const load = useCallback((signal: AbortSignal) => api.readDataScopesWorkspace.load(organizationId, signal), [api, organizationId]);
  const result = useAuthorizedQuery([organizationId, decision?.subjectId, api.readDataScopesWorkspace.actionId, decision?.authorizationSnapshotVersion, revision], load);
  if (result.loading) return <SectionCard title="Loading Data Scopes"><p role="status" aria-live="polite">Loading current mapping policies and organization-model state…</p></SectionCard>;
  if (result.error) return <SectionCard title="Data Scopes unavailable"><p role="alert">{result.error}</p><button className="mt-3 rounded-md border border-border px-3 py-2" onClick={() => setRevision(value => value + 1)}>Try again</button></SectionCard>;
  const workspace = result.data as Workspace | undefined;
  if (!workspace) return <SectionCard title="Data Scopes unavailable"><p>The backend returned no protected workspace payload.</p></SectionCard>;
  const reload = () => setRevision(value => value + 1);
  if (!workspace.draft) return <OrganizationModelAuthorizationProvider organizationId={organizationId} surface={surface} actionId="organizationModel.editDraft"><AuthorizationBoundary><DraftInitialization organizationId={organizationId} publication={workspace.publication} onCreated={reload} /></AuthorizationBoundary></OrganizationModelAuthorizationProvider>;
  if (workspace.capabilityState.status !== "ready") return <SectionCard title="Data Scopes unavailable"><p role="status">{workspace.capabilityState.reasonCode || "organization_mapping_workspace_unavailable"}</p></SectionCard>;
  return <><DataScopesWorkspace key={`${organizationId}:${workspace.draft.id}`} organizationId={organizationId} workspace={workspace} reload={reload} /><ScopedDataNotice /></>;
}

export const DataScopesPage = ({ organizationId, surface }: { organizationId: string; surface: OrganizationModelSurface }) => <OrganizationModelSurfaceProvider surface={surface}><main className="min-w-0 space-y-6" aria-labelledby="data-scopes-title"><header><p className="text-sm text-muted">Governance / Organization model</p><h1 id="data-scopes-title" className="text-2xl font-semibold">Data Scopes</h1><p className="mt-2 max-w-3xl text-muted">Define how governed source facts map to canonical organization dimensions. Granular user authorization remains in Access policy / Scope Assignments.</p></header><OrganizationModelAuthorizationProvider organizationId={organizationId} surface={surface} actionId="organizationModel.readDraft"><AuthorizationBoundary><WorkspaceLoader organizationId={organizationId} surface={surface} /></AuthorizationBoundary></OrganizationModelAuthorizationProvider></main></OrganizationModelSurfaceProvider>;
