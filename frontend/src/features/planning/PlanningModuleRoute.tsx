import { ModuleUnavailable } from "../../module-ui/loader/ModuleUiRouteBoundary";
import { PlanningRoute } from "./PlanningRoute";
import { resolvePlanningVisualRegistryContribution } from "./planningRegistry";

export default function PlanningModuleRoute() {
  const decision = resolvePlanningVisualRegistryContribution();
  if (!decision.mountable) return <ModuleUnavailable moduleId="planning" />;
  return <PlanningRoute contribution={decision.contribution} deprecated={decision.status === "deprecated"} />;
}
