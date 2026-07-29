import { adaptValidatedModuleUiContribution } from "../../module-ui/registry/contributionAdapter";
import type { ModuleUiValidatedContribution } from "../../module-ui/loader/contracts";
import { planningRemoteUiContribution } from "./planningRemoteUiContribution";

// This built-in artifact is verified by the application build. Downloaded contributions must
// still pass secureLoader before reaching this canonical Screen/Action Registry adapter.
export const planningValidatedContribution = Object.freeze({
  ...planningRemoteUiContribution,
  validated: true as const,
  integrityVerified: true as const,
  compatibilityStatus: "compatible" as const,
  resolvedArtifact: { artifactId: planningRemoteUiContribution.artifact.entrypoint.artifactId, origin: "app://civitas", cacheKey: "planning|bundled" },
}) as ModuleUiValidatedContribution;

export const planningVisualRegistryContribution = adaptValidatedModuleUiContribution(planningValidatedContribution);
