import { useEffect, useRef } from "react";
import { Link, useParams } from "react-router";
import { OrganizationLayout } from "../../layouts/OrganizationLayout";
import { buildModuleUiBreadcrumbs } from "../../module-ui/registry/navigationTopology";
import { ModuleUiErrorBoundary } from "../../module-ui/loader/ModuleUiErrorBoundary";
import { PlanningRemoteScreen } from "./PlanningRemote";
import { planningVisualRegistryContribution } from "./planningRegistry";
import { organizationScopedRouteTemplate } from "../../navigation/route-builders";
import { useVisualAuthorization } from "../../authorization/components/VisualAuthorizationProvider";
import { planningValidatedContribution } from "./planningRegistry";
import { decidePlanningPresentation } from "./planningAccessDecision";
import { PlanningAccessFallback } from "./PlanningAccessFallback";
import { evaluateActionEligibility } from "../../authorization/evaluation/evaluate-action";

export const planningRoutePattern = `${organizationScopedRouteTemplate("/planning/plans")}/*`;

const screens = { "": ["home", "planning.home"], list: ["list", "planning.plans.list"], create: ["create", "planning.plans.create"], profile: ["profile", "planning.profile"] } as const;
function resolveScreen(splat = "") { const exact = screens[splat as keyof typeof screens]; if (exact) return { screen: exact[0], routeId: exact[1] }; const edit = splat.match(/^([^/]+)\/edit$/); if (edit) return { screen: "edit" as const, routeId: "planning.plans.edit", planId: edit[1] }; const detail = splat.match(/^([^/]+)$/); return detail ? { screen: "detail" as const, routeId: "planning.plans.detail", planId: detail[1] } : null; }

export function PlanningRoute() {
  const { organizationId = "", "*": splat = "" } = useParams();
  const resolved = resolveScreen(splat);
  const authorizationContext = useVisualAuthorization();
  const heading = useRef<HTMLHeadingElement>(null);
  const screen = resolved ? planningVisualRegistryContribution.screens.find(candidate => candidate.screenId === resolved.routeId) : undefined;
  const canUseAction = (actionId: string) => {
    const action = planningVisualRegistryContribution.actions.find(candidate => candidate.actionId === actionId);
    return action ? evaluateActionEligibility(action, authorizationContext).allowed : false;
  };
  const state = !resolved || !screen ? "not-found" : decidePlanningPresentation(organizationId, screen, authorizationContext, planningValidatedContribution.compatibilityStatus === "compatible" || planningValidatedContribution.compatibilityStatus === "deprecated_compatible");
  useEffect(() => { if (state !== "loading") heading.current?.focus(); }, [organizationId, state]);
  const crumbs = resolved ? buildModuleUiBreadcrumbs(planningVisualRegistryContribution, resolved.routeId, organizationId) : [];
  return <OrganizationLayout organizationId={organizationId}><nav aria-label="Breadcrumb"><ol className="civitas-cluster">{crumbs.map((crumb, i) => <li key={`${crumb.labelKey}-${i}`}>{crumb.href ? <Link to={crumb.href}>{crumb.labelKey}</Link> : <span aria-current="page">{crumb.labelKey}</span>}</li>)}</ol></nav>{state !== "ready" ? <PlanningAccessFallback state={state} headingRef={heading} /> : <ModuleUiErrorBoundary moduleId="planning" screenId={resolved!.routeId}><PlanningRemoteScreen organizationId={organizationId} screen={resolved!.screen} planId={resolved!.planId} availability="available" readOnly={false} access="allowed" canCreate={canUseAction("planning.plans.create")} canUpdate={canUseAction("planning.plans.update")} canReplaceProfile={canUseAction("planning.profile.replace")} /></ModuleUiErrorBoundary>}</OrganizationLayout>;
}
