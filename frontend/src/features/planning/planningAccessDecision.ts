import type { VisualAuthorizationContext } from "../../authorization/contracts/authorization-context";
import { evaluateScreenEligibility } from "../../authorization/evaluation/evaluate-screen";
import type { ScreenDefinition } from "../../authorization/contracts/screen-definition";

export type PlanningPresentationState = "loading" | "ready" | "denied" | "unavailable" | "incompatible";

/**
 * This is a display-only projection. Planning operations are always reauthorized by
 * the backend; the browser must never turn this result into an execution grant.
 */
export function decidePlanningPresentation(
  organizationId: string,
  screen: ScreenDefinition,
  context: VisualAuthorizationContext,
  contributionCompatible: boolean,
): PlanningPresentationState {
  if (!contributionCompatible) return "incompatible";
  if (context.status !== "ready" || context.organizationId !== organizationId) return "loading";
  const decision = evaluateScreenEligibility(screen, context);
  if (decision.allowed) return "ready";
  return decision.reason === "data_scope_unavailable" || decision.reason === "feature_disabled"
    ? "unavailable"
    : "denied";
}
