import { createContext, createElement, useContext, useMemo, type ReactNode } from "react";
import { ApiRequestError, useApi } from "../../api/base";
import { ORGANIZATION_MAPPING_ACTIONS, type OrganizationMappingActionId } from "../../generated/organization-mapping-contracts";

export type AuthorizationUiDecision = {
  decisionId: string; status: "ready" | "loading" | "stale" | "unavailable";
  finalDecision: "allow" | "deny" | "unresolved"; terminalStage: "identity" | "rbac" | "pbac" | "abac" | "runtime";
  terminalReasonCode: string; evaluatedStages: Array<{ stage: AuthorizationUiDecision["terminalStage"]; result: "passed" | "denied" | "unresolved" | "not_evaluated"; reasonCode?: string; policyVersion?: string; snapshotVersion?: string }>;
  treatment: "hide" | "disable" | "filter" | "block" | "explain"; dataAccessMode: "none" | "scoped" | "full"; scopeAppliedByBackend: boolean;
  subjectId: string; organizationId: string; actionId: OrganizationMappingActionId; authorizationSnapshotVersion: string; policyVersion?: string; scopeVersion?: string;
  remediation?: { code: string; safeMessage?: string; retryable: boolean };
};

export class AuthorizationDeniedError extends ApiRequestError { decision: AuthorizationUiDecision; constructor(decision: AuthorizationUiDecision) { super(decision.terminalReasonCode, 403, decision.terminalReasonCode, decision); this.decision = decision; } }
export class AuthorizationEnvelopeError extends ApiRequestError { constructor(code: string) { super("Authorization response could not be trusted.", 503, code); } }

const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
export function validateDecision(value: unknown, expected: { organizationId: string; subjectId: string; actionId: OrganizationMappingActionId; snapshotVersion?: string }): AuthorizationUiDecision {
  if (!object(value) || !value.decisionId || !["ready", "loading", "stale", "unavailable"].includes(String(value.status)) || !["allow", "deny", "unresolved"].includes(String(value.finalDecision)) || !Array.isArray(value.evaluatedStages)) throw new AuthorizationEnvelopeError("authorization_decision_malformed");
  if (value.organizationId !== expected.organizationId || value.subjectId !== expected.subjectId || value.actionId !== expected.actionId || (expected.snapshotVersion && value.authorizationSnapshotVersion !== expected.snapshotVersion)) throw new AuthorizationEnvelopeError("authorization_decision_context_mismatch");
  return value as AuthorizationUiDecision;
}

export type OrganizationModelSurface = "owner" | "tenant";
const SurfaceContext = createContext<OrganizationModelSurface | null>(null);
export const OrganizationModelSurfaceProvider = ({surface, children}:{surface:OrganizationModelSurface;children:ReactNode}) => createElement(SurfaceContext.Provider,{value:surface},children);
export const useOrganizationModelSurface = () => { const surface=useContext(SurfaceContext); if(!surface) throw new Error("organization_model_surface_required"); return surface; };
const endpoint = (surface:OrganizationModelSurface, organizationId: string, suffix: string) => surface === "owner" ? `/api/v1/owner/organizations/${encodeURIComponent(organizationId)}/organization-model/${suffix}` : `/api/v1/o/${encodeURIComponent(organizationId)}/organization-model/${suffix}`;
export const useOrganizationModelApi = (explicitSurface?:OrganizationModelSurface) => {
  const inheritedSurface=useContext(SurfaceContext),surface=explicitSurface||inheritedSurface;
  if(!surface) throw new Error("organization_model_surface_required");
  const { organizationApiFetch, ownerApiFetch } = useApi();
  return useMemo(() => {
    const request=(organizationId:string,suffix:string,options:RequestInit={})=>surface==="owner"?ownerApiFetch(endpoint(surface,organizationId,suffix),options):organizationApiFetch(organizationId,endpoint(surface,organizationId,suffix),options);
    const get = <T,>(organizationId: string, suffix: string, signal?: AbortSignal) => request(organizationId,suffix,{ signal }) as Promise<T>;
    const send = <T,>(organizationId: string, suffix: string, method: "POST" | "PUT" | "DELETE", body: unknown, signal?: AbortSignal, headers: Record<string,string> = {}) => request(organizationId,suffix,{ method, signal, headers, body: JSON.stringify(body) }) as Promise<T>;
    const operation = <T,>(actionId: OrganizationMappingActionId, load: (organizationId: string, signal?: AbortSignal) => Promise<T>) => ({ actionId, load });
    return {
      resolveAuthorizationDecision: async (organizationId: string, subjectId: string, actionId: OrganizationMappingActionId, signal?: AbortSignal) => {
        try { return validateDecision(await get(organizationId, `authorization-decisions/${encodeURIComponent(actionId)}`, signal), { organizationId, subjectId, actionId }); }
        catch (error) { if (error instanceof ApiRequestError && error.status === 403 && object(error.details)) return validateDecision(error.details, { organizationId, subjectId, actionId }); throw error; }
      },
      readAuthorizationExplanation: async (organizationId:string,subjectId:string,actionId:OrganizationMappingActionId,reference:{decisionId?:string;modelVersion?:string;policyVersion?:string;resource?:string},signal?:AbortSignal) => { const query=new URLSearchParams(Object.entries(reference).filter((entry):entry is [string,string]=>Boolean(entry[1]))); try{return validateDecision(await get(organizationId,`authorization-explanations/${encodeURIComponent(actionId)}?${query}`,signal),{organizationId,subjectId,actionId});}catch(error){if(error instanceof ApiRequestError&&error.status===403&&object(error.details))return validateDecision(error.details,{organizationId,subjectId,actionId});throw error;} },
      readRecentAuthorizationDecisions: operation("organizationModel.inspectAuditHistory",(organizationId,signal)=>get<{decisions:Array<Record<string,unknown>>}>(organizationId,"authorization-explanations/recent",signal)),
      readFrontendSafeContracts: operation("organizationModel.readPublished", (organizationId, signal) => get<Record<string, unknown>>(organizationId, "contracts", signal)),
      readPublishedOrganizationModel: operation("organizationModel.readPublished", (organizationId, signal) => get<Record<string, unknown>>(organizationId, "published", signal)),
      readActiveOrganizationModelDraft: operation("organizationModel.readDraft", (organizationId, signal) => get<Record<string, unknown>>(organizationId, "drafts/active", signal)),
      readOrganizationModelWorkspaceSummary: operation("organizationModel.readDraft", (organizationId, signal) => get<Record<string, unknown>>(organizationId, "workspace-summary", signal)),
      readDataScopesWorkspace: operation("organizationModel.readDraft", (organizationId, signal) => get<Record<string, unknown>>(organizationId, "data-scopes-workspace", signal)),
      readStructureWorkspace: operation("organizationModel.readDraft", (organizationId, signal) => get<Record<string, unknown>>(organizationId, "structure-workspace", signal)),
      readOrganizationMappingPolicies: (draftId: string) => operation("organizationModel.readDraft", (organizationId, signal) => get<Record<string, unknown>>(organizationId, `drafts/${encodeURIComponent(draftId)}/policies`, signal)),
      readSelectorRegistry: operation("organizationModel.readPublished", (organizationId, signal) => get<Record<string, unknown>>(organizationId, "contracts", signal)),
      readOperatorRegistry: operation("organizationModel.readPublished", (organizationId, signal) => get<Record<string, unknown>>(organizationId, "contracts", signal)),
      readOrganizationGraph: (publicationId: string) => operation("organizationModel.readPublished", (organizationId, signal) => get<Record<string, unknown>>(organizationId, `publications/${encodeURIComponent(publicationId)}/graph`, signal)),
      readPrimaryScopeTree: (publicationId: string) => operation("organizationModel.readPublished", (organizationId, signal) => get<Record<string, unknown>>(organizationId, `publications/${encodeURIComponent(publicationId)}/scope-tree`, signal)),
      readPublicationHistory: operation("organizationModel.readPublished", (organizationId, signal) => get<Record<string, unknown>>(organizationId, "publications", signal)),
      readReconciliationSummary: operation("organizationModel.reconcileUpstream", (organizationId, signal) => get<Record<string, unknown>>(organizationId, "reconciliation", signal)),
      initializeOrganizationModel: { actionId:"organizationModel.editDraft" as const, mutate:(organizationId:string,idempotencyKey:string,signal?:AbortSignal)=>send<Record<string,unknown>>(organizationId,"drafts","POST",{reason:"Initialize organization model"},signal,{"Idempotency-Key":idempotencyKey}) },
      createPolicyVersion: { actionId:"organizationModel.editDraft" as const, mutate:(organizationId:string,draftId:string,policy:unknown,signal?:AbortSignal)=>send<Record<string,unknown>>(organizationId,`drafts/${encodeURIComponent(draftId)}/policies`,"POST",{policy},signal) },
      archivePolicy: { actionId:"organizationModel.editDraft" as const, mutate:(organizationId:string,draftId:string,policyId:string,reason:string,signal?:AbortSignal)=>send<Record<string,unknown>>(organizationId,`drafts/${encodeURIComponent(draftId)}/policies/${encodeURIComponent(policyId)}`,"DELETE",{reason},signal) },
      createSelectorSetVersion: { actionId:"organizationModel.editDraft" as const, mutate:(organizationId:string,selectorSet:unknown,idempotencyKey:string,signal?:AbortSignal)=>send<Record<string,unknown>>(organizationId,"selector-sets","POST",{selectorSet},signal,{"Idempotency-Key":idempotencyKey}) },
      archiveSelectorSet: { actionId:"organizationModel.editDraft" as const, mutate:(organizationId:string,selectorSetId:string,reason:string,signal?:AbortSignal)=>send<Record<string,unknown>>(organizationId,`selector-sets/${encodeURIComponent(selectorSetId)}`,"DELETE",{reason},signal) },
      reviewMapping: { actionId:"organizationModel.approveMapping" as const, mutate:(organizationId:string,evaluationId:string,input:{decision:"approved"|"rejected"|"ignored"|"returned_to_author"|"canonical_target_selected"|"organization_value_created";reason:string;expectedReviewVersion:number;expectedEvaluationHash?:string;expectedSourceSnapshotId?:string;expectedSourceSnapshotVersion?:number;canonicalTarget?:string},idempotencyKey:string,signal?:AbortSignal)=>send<Record<string,unknown>>(organizationId,`evaluations/${encodeURIComponent(evaluationId)}/reviews`,"POST",input,signal,{"Idempotency-Key":idempotencyKey}) },
      saveDimensionConfiguration: { actionId:"organizationModel.editDraft" as const, mutate:(organizationId:string,dimensionId:string,input:{config:Record<string,unknown>;reason:string},idempotencyKey:string,signal?:AbortSignal)=>send<Record<string,unknown>>(organizationId,`dimensions/${encodeURIComponent(dimensionId)}`,"PUT",input,signal,{"Idempotency-Key":idempotencyKey}) },
      evaluatePolicySnapshot: { actionId:"organizationModel.evaluateMappingPolicies" as const, mutate:(organizationId:string,input:{draftId:string;policyVersionId:string;sourceSnapshotId:string},idempotencyKey:string,signal?:AbortSignal)=>send<Record<string,unknown>>(organizationId,"evaluations/from-snapshot","POST",input,signal,{"Idempotency-Key":idempotencyKey}) },
      updateOrganizationModelDraft: { actionId:"organizationModel.editDraft" as const, mutate:(organizationId:string,draftId:string,model:unknown,expectedVersion:number,reason:string,idempotencyKey:string,signal?:AbortSignal)=>send<Record<string,unknown>>(organizationId,`drafts/${encodeURIComponent(draftId)}/structure`,"PUT",{model,expectedVersion,reason},signal,{"If-Match":String(expectedVersion),"Idempotency-Key":idempotencyKey}) },
      createImpactPreview: { actionId:"organizationModel.evaluateMappingPolicies" as const, mutate:(organizationId:string,draftId:string,idempotencyKey:string,signal?:AbortSignal)=>send<Record<string,unknown>>(organizationId,`drafts/${encodeURIComponent(draftId)}/preview`,"POST",{},signal,{"Idempotency-Key":idempotencyKey}) },
      publishExactVersion: { actionId:"organizationModel.publishVersion" as const, mutate:(organizationId:string,draftId:string,input:{expectedDraftVersion:number;expectedPublishedVersion:number;previewId:string;expectedImpactDigest:string;reason:string},idempotencyKey:string,signal?:AbortSignal)=>send<Record<string,unknown>>(organizationId,`drafts/${encodeURIComponent(draftId)}/publish`,"POST",input,signal,{"Idempotency-Key":idempotencyKey}) },
      createRollbackDraft: { actionId:"organizationModel.createRollbackDraft" as const, mutate:(organizationId:string,publicationId:string,reason:string,idempotencyKey:string,signal?:AbortSignal)=>send<Record<string,unknown>>(organizationId,`publications/${encodeURIComponent(publicationId)}/rollback-draft`,"POST",{reason},signal,{"Idempotency-Key":idempotencyKey}) },
      readEvaluationTrace: (evaluationId:string)=>operation("organizationModel.evaluateMappingPolicies",(organizationId,signal)=>get<Record<string,unknown>>(organizationId,`evaluations/${encodeURIComponent(evaluationId)}/trace`,signal)),
      readSensitiveEvidence: (evaluationId:string,reason:string)=>operation("organizationModel.readSensitiveMappingEvidence",(organizationId,signal)=>request(organizationId,`evaluations/${encodeURIComponent(evaluationId)}/evidence`,{signal,headers:{"X-Access-Reason":reason}}) as Promise<Record<string,unknown>>),
      actions: ORGANIZATION_MAPPING_ACTIONS,
    };
  }, [organizationApiFetch,ownerApiFetch,surface]);
};
