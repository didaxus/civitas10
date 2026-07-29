import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { OrganizationLayout } from "../../layouts/OrganizationLayout";
import { buildModuleUiBreadcrumbs } from "../../module-ui/registry/navigationTopology";
import { ModuleUiErrorBoundary } from "../../module-ui/loader/ModuleUiErrorBoundary";
import { StateRegion } from "../../shared/ui";
import { PlanningRemoteScreen } from "./PlanningRemote";
import { planningVisualRegistryContribution } from "./planningRegistry";
import { PlanningApiError, usePlanningApi, type PlanningUiAccess } from "./planningApi";
import { organizationScopedRouteTemplate } from "../../navigation/route-builders";

export const planningRoutePattern = `${organizationScopedRouteTemplate("/planning/plans")}/*`;

const screens = { "": ["home", "planning.home"], list: ["list", "planning.plans.list"], create: ["create", "planning.plans.create"], profile: ["profile", "planning.profile"] } as const;
function resolveScreen(splat = "") { const exact = screens[splat as keyof typeof screens]; if (exact) return { screen: exact[0], routeId: exact[1] }; const edit = splat.match(/^([^/]+)\/edit$/); if (edit) return { screen: "edit" as const, routeId: "planning.plans.edit", planId: edit[1] }; const detail = splat.match(/^([^/]+)$/); return detail ? { screen: "detail" as const, routeId: "planning.plans.detail", planId: detail[1] } : null; }

export function PlanningRoute() {
  const { organizationId = "", "*": splat = "" } = useParams();
  const resolved = resolveScreen(splat); const api = usePlanningApi();
  const [access, setAccess] = useState<PlanningUiAccess | null>(null); const [error, setError] = useState<PlanningApiError | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { const controller = new AbortController(); setAccess(null); setError(null); if (!resolved) return () => controller.abort(); const capability = resolved.screen === "profile" ? "planning.profile" : "planning.plans"; void api.getUiAccess(organizationId, capability, controller.signal).then(value => setAccess(value ?? null)).catch(e => { if (!controller.signal.aborted) setError(e instanceof PlanningApiError ? e : new PlanningApiError(String(e))); }); return () => controller.abort(); }, [api, organizationId, resolved?.routeId]);
  useEffect(() => { if (access || error || !resolved) heading.current?.focus(); }, [access, error, resolved]);
  const state = !resolved ? "not-found" : error?.status === 403 ? "forbidden" : error?.status === 409 || error?.status === 412 ? "conflict" : error?.status === 503 ? "unavailable" : error ? "error" : !access ? "loading" : !access.authorization.allowed ? "forbidden" : !access.availability.executable ? "unavailable" : "ready";
  const messages = { loading: "Checking Planning availability and authorization…", forbidden: "You do not have access to Planning in this organization.", unavailable: "Planning is temporarily unavailable.", conflict: "Planning access changed while this page was loading. Reload and try again.", error: "Planning could not be loaded. Try again later.", "not-found": "Planning page not found." } as const;
  const crumbs = resolved ? buildModuleUiBreadcrumbs(planningVisualRegistryContribution, resolved.routeId, organizationId) : [];
  return <OrganizationLayout organizationId={organizationId}><nav aria-label="Breadcrumb"><ol className="civitas-cluster">{crumbs.map((crumb, i) => <li key={`${crumb.labelKey}-${i}`}>{crumb.href ? <Link to={crumb.href}>{crumb.labelKey}</Link> : <span aria-current="page">{crumb.labelKey}</span>}</li>)}</ol></nav>{state !== "ready" ? <StateRegion><h1 ref={heading} tabIndex={-1}>Planning</h1><p role={state === "loading" ? "status" : "alert"}>{messages[state]}</p></StateRegion> : <ModuleUiErrorBoundary moduleId="planning" screenId={resolved!.routeId}><PlanningRemoteScreen organizationId={organizationId} screen={resolved!.screen} planId={resolved!.planId} availability={access!.availability.state} readOnly={access!.availability.readOnly} access="allowed" /></ModuleUiErrorBoundary>}</OrganizationLayout>;
}
