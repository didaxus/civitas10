import type { ModuleUiContribution, ModuleUiValidatedContribution } from "../loader/contracts";
import { adaptValidatedModuleUiContribution, type VisualRegistryContribution } from "./contributionAdapter";

export type ModuleMountDecision =
  | { mountable: true; status: "active" | "deprecated"; reason: null; contribution: VisualRegistryContribution }
  | { mountable: false; status: "planned" | "incompatible" | "integrity_failure" | "invalid" | "removed"; reason: string; contribution: null };

type ModuleMountCandidate = ModuleUiContribution & Partial<Pick<ModuleUiValidatedContribution, "validated" | "integrityVerified" | "compatibilityStatus" | "resolvedArtifact">>;

const notMountable = (status: Exclude<ModuleMountDecision, { mountable: true }>["status"], reason: string): ModuleMountDecision => ({ mountable: false, status, reason, contribution: null });

/** Decides lifecycle mountability before invoking the deliberately throwing adapter. */
export function resolveModuleMountDecision(candidate: ModuleMountCandidate): ModuleMountDecision {
  const lifecycle = candidate?.contract?.status as string | undefined;
  if (lifecycle === "planned") return notMountable("planned", "planned_contribution_not_mountable");
  if (lifecycle === "removed") return notMountable("removed", "removed_contribution_not_mountable");
  if (lifecycle !== "active" && lifecycle !== "deprecated") return notMountable("invalid", "module_ui_contribution_status_invalid");
  if (candidate.validated !== true) return notMountable("invalid", "module_ui_contribution_not_validated");
  if (candidate.integrityVerified !== true) return notMountable("integrity_failure", "module_ui_contribution_integrity_failure");
  if (candidate.compatibilityStatus !== "compatible" && candidate.compatibilityStatus !== "deprecated_compatible") return notMountable("incompatible", "module_ui_contribution_incompatible");

  try {
    return { mountable: true, status: lifecycle, reason: null, contribution: adaptValidatedModuleUiContribution(candidate as ModuleUiValidatedContribution) };
  } catch (error) {
    return notMountable("invalid", error instanceof Error ? error.message : "module_ui_contribution_invalid");
  }
}
