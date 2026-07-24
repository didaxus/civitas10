import type { GovernanceModuleKey, GovernanceSurface } from "./contracts";
import registryArtifact from "./operation-registry.generated.json";

export type GovernanceOperationKey = "governance.readModel" | "governance.accessPreview" | "governance.entitlementCeilings" | "governance.roleActivations" | "governance.memberRoleAssignments" | "governance.taxonomyValues" | "governance.taxonomyPublish" | "governance.units" | "governance.dataScopes" | "governance.navigationPreferences" | "governance.audit" | "governance.identityProvisioning";
export type GovernanceEffectiveStatus = "active" | "planned" | "disabled" | "unavailable";

export type GovernanceOperationContract = {
  operationId: GovernanceOperationKey;
  operation: GovernanceOperationKey;
  method: "GET" | "POST" | "PUT";
  pattern: string;
  surface: GovernanceSurface;
  permission: string;
  policies: string[];
  status: GovernanceEffectiveStatus;
  contractVersion: string;
  responseSchema: string;
  reason?: string;
};

type RegistryOperationArtifact = Omit<GovernanceOperationContract, "operation">;
type ModuleArtifact = { module: GovernanceModuleKey; status: "active" | "planned" | "unavailable" | "denied" | "stale" | "error"; reason: string };

export const governanceOperationRegistryVersion = registryArtifact.registryVersion;
export const governanceOperationRegistry: readonly GovernanceOperationContract[] = Object.freeze((registryArtifact.operations as RegistryOperationArtifact[]).map((entry) => ({ ...entry, operation: entry.operationId })));
const governanceModuleInventory = registryArtifact.modules as ModuleArtifact[];

export const governanceModuleStatus = (surface: GovernanceSurface): Record<GovernanceModuleKey, { status: "active" | "planned" | "unavailable" | "denied" | "stale" | "error"; reason: string }> => {
  const readModel = governanceOperationRegistry.find((entry) => entry.operation === "governance.readModel" && entry.surface === surface);
  const ownerModules: GovernanceModuleKey[] = ["overview", "identity-provisioning", "permissions", "taxonomy", "units", "data-scope", "aliases-navigation", "access-preview", "audit"];
  const tenantModules: GovernanceModuleKey[] = ["identity-provisioning", "permissions", "members", "data-scope", "taxonomy", "units", "aliases-navigation", "access-preview"];
  return Object.fromEntries((surface === "owner" ? ownerModules : tenantModules).map((key) => {
    const inventory = governanceModuleInventory.find((entry) => entry.module === key);
    const activeReadModel = readModel?.status === "active";
    const status = activeReadModel ? inventory?.status ?? "error" : "unavailable";
    return [key, { status, reason: inventory?.reason ?? "module_inventory_missing" }];
  })) as Record<GovernanceModuleKey, { status: "active" | "planned" | "unavailable" | "denied" | "stale" | "error"; reason: string }>;
};

export const isGovernanceOperationActive = (surface: GovernanceSurface, operation: GovernanceOperationKey) => governanceOperationRegistry.some((entry) => entry.surface === surface && entry.operation === operation && entry.status === "active");
