import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { AlertStrip, EmptyState, StateRegion } from "../shared/ui";
import { OperationalOverview, OperationalModules } from "../features/owner/organization/operationalCards";
import { ApiRequestError } from "../api/base";
import { useOwnerApi } from "../api/owner";
import { appRoutes } from "../navigation/routes";
import { toAppErrorPresentation, type AppErrorPresentation } from "../errors/appErrorPresentation";
import { validateOperationalResponse, type ConsolidatedOperationalResponse } from "../contracts/operational";

type OrganizationDetailState =
  | { status: "loading" }
  | { status: "loaded"; organization: ConsolidatedOperationalResponse }
  | { status: "not-found"; organizationId: string }
  | { status: "denied"; message: string }
  | { status: "error"; error: AppErrorPresentation };


const isInvalidOrganizationId = (value: string | undefined) => {
  const id = value ? value.trim() : "";
  if (!id) return true;
  const decoded = (() => { try { return decodeURIComponent(id); } catch { return id; } })();
  return decoded === `:${"organizationId"}`;
};

function contractErrorMessage(result: Exclude<ReturnType<typeof validateOperationalResponse>, { ok: true }>) {
  return `Owner organization operational response failed contract ${result.version || "unknown"} at ${result.path}: ${result.reason}`;
}


function normalizeLoadFailure(caught: unknown, organizationId: string): OrganizationDetailState {
  if (caught instanceof ApiRequestError && caught.status === 404) return { status: "not-found", organizationId };
  const error = toAppErrorPresentation(caught);
  if (error.status === 401 || error.status === 403) return { status: "denied", message: error.humanMessage };
  return { status: "error", error };
}

const OwnerOrganizationOperationalPage = ({ initialSection = "overview" }: { initialSection?: "overview" | "operations" }) => {
  const { organizationId = "" } = useParams();
  const ownerApi = useOwnerApi();
  const [viewState, setState] = useState<OrganizationDetailState>({ status: "loading" });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestLoadedStateRef = useRef<ConsolidatedOperationalResponse | null>(null);

  const load = useCallback(async () => {
    if (isInvalidOrganizationId(organizationId)) {
      setState({ status: "not-found", organizationId });
      return;
    }
    setState((current) => current.status === "loaded" ? current : { status: "loading" });
    try {
      const response = await ownerApi.getOrganizationOperationalState(organizationId);
      const contract = validateOperationalResponse(response);
      if (!contract.ok) throw new ApiRequestError(contractErrorMessage(contract), 500, "OWNER_ORGANIZATION_CONTRACT_ERROR");
      latestLoadedStateRef.current = contract.value;
      setState({ status: "loaded", organization: contract.value });
      const interval = contract.value.polling.shouldPoll ? Math.max(Number(contract.value.polling.intervalSeconds || 3), 1) * 1000 : 0;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = interval ? setTimeout(() => void load(), interval) : null;
    } catch (caught) {
      setState(normalizeLoadFailure(caught, organizationId));
      latestLoadedStateRef.current = null;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [organizationId, ownerApi]);

  useEffect(() => {
    void load();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [load]);

  const retry = viewState.status === "error" && viewState.error.retryable ? () => void load() : undefined;



  return (
    <>
      {viewState.status === "loading" ? <StateRegion><p className="text-sm text-muted-strong">Loading organization detail...</p></StateRegion> : null}
      {viewState.status === "not-found" ? <EmptyState message="Organization not found. The selected organization does not exist or is no longer available."><Link className="civitas-secondary-button" to={appRoutes.ownerOrganizations.path}>Return to Directory</Link></EmptyState> : null}
      {viewState.status === "denied" ? <StateRegion><AlertStrip variant="warning" title="Access denied">{viewState.message}</AlertStrip></StateRegion> : null}
      {viewState.status === "error" ? <StateRegion><AlertStrip variant="danger" title={`Organization detail error · ${viewState.error.code}`}>{viewState.error.humanMessage}{retry ? <button type="button" className="civitas-secondary-button" onClick={retry}>Try again</button> : null}<Link className="civitas-secondary-button" to={appRoutes.ownerOrganizations.path}>Return to Directory</Link></AlertStrip></StateRegion> : null}
      {viewState.status === "loaded" ? (initialSection === "overview" ? <OperationalOverview organization={viewState.organization} /> : <OperationalModules organization={viewState.organization} />) : null}
    </>
  );
};

export default OwnerOrganizationOperationalPage;
