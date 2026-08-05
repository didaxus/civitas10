import { useMemo } from "react";
import { useApi } from "../../api/base";
import { validateGovernanceReadModel, type GovernanceAccessPreview, type GovernanceAccessPreviewRequest, type GovernanceReadModel } from "./contracts";


const assertAccessPreview = (response: unknown): GovernanceAccessPreview => {
  if (!response || typeof response !== "object") throw new Error("Governance access preview contract failed at $: response must be an object");
  const value = response as GovernanceAccessPreview;
  if (!value.subjectId || !value.decision || typeof value.decision.allowed !== "boolean") throw new Error("Governance access preview contract failed at $.decision: decision must include allowed boolean");
  if (value.mutated !== false) throw new Error("Governance access preview contract failed at $.mutated: preview must be read-only");
  return value;
};

export type GovernanceRoleLabelMutationRequest = { canonicalRoleKey: string; displayName: string | null; expectedVersion: string; reason: string };
export type GovernancePolicyMutationRequest = { roleId: string; expectedPolicyVersion?: string; changes: Array<{ permission: string; enabled: boolean }>; reason: string };

const assertGovernanceReadModel = (response: unknown): GovernanceReadModel => {
  const contract = validateGovernanceReadModel(response);
  if (!contract.ok) throw new Error(`Governance read model contract ${contract.version || "unknown"} failed at ${contract.path}: ${contract.reason}`);
  return contract.value;
};

export const useGovernanceApi = () => {
  const { ownerApiFetch, organizationApiFetch } = useApi();

  return useMemo(() => ({
    getOwnerGovernance: async (organizationId: string): Promise<GovernanceReadModel> => assertGovernanceReadModel(await ownerApiFetch(`/owner/organizations/${encodeURIComponent(organizationId)}/governance`)),
    getTenantGovernance: async (organizationId: string): Promise<GovernanceReadModel> => assertGovernanceReadModel(await organizationApiFetch(organizationId, `/o/${encodeURIComponent(organizationId)}/governance`)),
    previewOwnerAccessReadOnly: async (request: GovernanceAccessPreviewRequest): Promise<GovernanceAccessPreview> => assertAccessPreview(await ownerApiFetch(`/owner/organizations/${encodeURIComponent(request.organizationId)}/access-preview`, { method: "POST", headers: { "X-Civitas-Preview-Only": "true" }, body: JSON.stringify({ ...request, previewOnly: true }) })),
    previewTenantAccessReadOnly: async (request: GovernanceAccessPreviewRequest): Promise<GovernanceAccessPreview> => assertAccessPreview(await organizationApiFetch(request.organizationId, `/o/${encodeURIComponent(request.organizationId)}/access-preview`, { method: "POST", headers: { "X-Civitas-Preview-Only": "true" }, body: JSON.stringify({ ...request, previewOnly: true }) })),
    updateOwnerRoleLabel: async (request: GovernanceRoleLabelMutationRequest): Promise<unknown> => ownerApiFetch(`/owner/governance/role-labels/${encodeURIComponent(request.canonicalRoleKey)}`, { method: "PUT", body: JSON.stringify({ displayName: request.displayName, expectedVersion: request.expectedVersion, reason: request.reason }) }),
    updateOrganizationRoleAlias: async (organizationId: string, request: GovernanceRoleLabelMutationRequest): Promise<unknown> => organizationApiFetch(organizationId, `/o/${encodeURIComponent(organizationId)}/governance/role-aliases/${encodeURIComponent(request.canonicalRoleKey)}`, { method: "PUT", body: JSON.stringify({ displayName: request.displayName, expectedVersion: request.expectedVersion, reason: request.reason }) }),
    updateOwnerCeilings: async (organizationId: string, request: GovernancePolicyMutationRequest): Promise<unknown> => ownerApiFetch(`/owner/organizations/${encodeURIComponent(organizationId)}/governance/entitlement-ceilings`, { method: "PUT", body: JSON.stringify({ expectedPolicyVersion: request.expectedPolicyVersion, reason: request.reason, changes: request.changes.map((change) => ({ logtoRoleId: request.roleId, permission: change.permission, allowed: change.enabled })) }) }),
    updateTenantActivations: async (organizationId: string, request: GovernancePolicyMutationRequest): Promise<unknown> => organizationApiFetch(organizationId, `/o/${encodeURIComponent(organizationId)}/governance/role-activations`, { method: "PUT", body: JSON.stringify({ expectedPolicyVersion: request.expectedPolicyVersion, reason: request.reason, changes: request.changes.map((change) => ({ logtoRoleId: request.roleId, permission: change.permission, enabled: change.enabled })) }) }),
  }), [organizationApiFetch, ownerApiFetch]);
};
