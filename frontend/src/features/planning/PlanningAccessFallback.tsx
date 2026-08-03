import type { RefObject } from "react";
import { StateRegion } from "../../shared/ui";
import type { PlanningPresentationState } from "./planningAccessDecision";

const stateMessages: Record<Exclude<PlanningPresentationState, "ready"> | "not-found", string> = {
  loading: "Checking Planning authorization…",
  denied: "You do not have access to Planning in this organization.",
  unavailable: "Planning is unavailable for this organization.",
  incompatible: "Planning is incompatible with this version of Civitas.",
  "not-found": "Planning page not found.",
};

export function PlanningAccessFallback({ state, headingRef }: { state: Exclude<PlanningPresentationState, "ready"> | "not-found"; headingRef?: RefObject<HTMLHeadingElement | null> }) {
  return <StateRegion><h1 ref={headingRef} tabIndex={-1}>Planning</h1><p role={state === "loading" ? "status" : "alert"}>{stateMessages[state]}</p></StateRegion>;
}
