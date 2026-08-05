"use strict";
const crypto = require("node:crypto");
const { evaluateMappingPolicy } = require("../../core/organization-mapping/index.cjs");
const { normalizeSourceFacts } = require("./sourceFactAdapter");
const { redactEvidence } = require("./evidenceRedaction");
const { canonicalize, buildOrganizationGraph, buildPrimaryScopeTree, buildReusableFacets, buildReconciliationWorkItems } = require("./projections");
const CONTRACT_VERSION = "2026-08-civitas-organization-mapping-api-v1";
function hash(value) { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function actor(req) { return req?.user?.sub || req?.auth?.subject || "system"; }
function safeResponse(payload) { return Object.freeze({ contractVersion: CONTRACT_VERSION, ...payload }); }
function digest(payload) { return hash(canonicalize(payload)); }
function assertReason(reason) { if (!reason) { const e = new Error("organization_mapping_reason_required"); e.status = 400; e.code = e.message; throw e; } }
function idempotency({organizationId,actorLogtoUserId,actionId,idempotencyKey,request,expectedVersion}) { return {organizationId,subjectId:actorLogtoUserId||"system",actionId,key:idempotencyKey,requestHash:digest(request),expectedVersion}; }
function createOrganizationMappingService({ repository }) {
  async function audited(organizationId, actorLogtoUserId, action, targetType, targetId, result, reason, response, idempotencyKey) {
    await repository.audit({ organizationId, actorLogtoUserId, action, targetType, targetId, result, reason, event: response });
    await repository.enqueueOutbox({ organizationId, eventType: action, targetType, targetId, result, reason, idempotencyKey, payload: response });
    return response;
  }
  return Object.freeze({
    async createDraft({ organizationId, model = {}, actorLogtoUserId, idempotencyKey }) {
      const idem=idempotency({organizationId,actorLogtoUserId,actionId:"organizationModel.editDraft",idempotencyKey,request:{model}}); const replay = await repository.replayIdempotency(idem); if (replay) return replay;
      const draft = await repository.createDraft({ organizationId, model });
      const response = safeResponse({ draft });
      await audited(organizationId, actorLogtoUserId, "organization_mapping.draft.created", "draft", draft.id, "success", "draft_created", response, idempotencyKey);
      return repository.rememberIdempotency(idem, response);
    },
    async updateDraft({ organizationId, draftId, model, expectedVersion, actorLogtoUserId, idempotencyKey }) {
      const idem=idempotency({organizationId,actorLogtoUserId,actionId:"organizationModel.editDraft",idempotencyKey,request:{draftId,model},expectedVersion}); const replay = await repository.replayIdempotency(idem); if (replay) return replay;
      const draft = await repository.updateDraft(organizationId, draftId, { model }, expectedVersion);
      const response = safeResponse({ draft });
      await audited(organizationId, actorLogtoUserId, "organization_mapping.draft.updated", "draft", draft.id, "success", "draft_updated", response, idempotencyKey);
      return repository.rememberIdempotency(idem, response);
    },
    async evaluate({ organizationId, draftId, policy, sourceFacts, sourceConnectionId, actorLogtoUserId, idempotencyKey }) {
      const idem=idempotency({organizationId,actorLogtoUserId,actionId:"organizationModel.evaluateMappingPolicies",idempotencyKey,request:{draftId,policy,sourceFacts,sourceConnectionId}}); const replay = await repository.replayIdempotency(idem); if (replay) return replay;
      const facts = normalizeSourceFacts({ ...sourceFacts, sourceConnectionId });
      if (facts.tenantId && facts.tenantId !== organizationId) { const e = new Error("organization_mapping_cross_tenant_source_fact"); e.status = 400; e.code = e.message; throw e; }
      const policyVersion = await repository.savePolicyVersion({ organizationId, draftId, policy, policyHash: hash(policy) });
      const snapshot = await repository.saveSourceSnapshot({ organizationId, sourceConnectionId, facts, evidence: facts.evidence });
      const trace = evaluateMappingPolicy(policy, { organizationId, facts });
      const evaluation = await repository.saveEvaluation({ organizationId, draftId, policyVersionId: policyVersion.id, sourceSnapshotId: snapshot.id, outcome: trace.outcome, reasonCode: trace.reasonCode, trace });
      const response = safeResponse({ evaluationId: evaluation.id, outcome: trace.outcome, reasonCode: trace.reasonCode, candidates: trace.candidates || [], trace, evidence: redactEvidence(facts.evidence,{ permissions: [] }), mutatedAuthorization: false });
      await audited(organizationId, actorLogtoUserId, "organization_mapping.evaluated", "evaluation", evaluation.id, trace.outcome, trace.reasonCode, response, idempotencyKey);
      return repository.rememberIdempotency(idem, response);
    },
    async review({ organizationId, evaluationId, decision, reason, actorLogtoUserId, idempotencyKey }) {
      if (!["approved", "rejected"].includes(decision)) { const e = new Error("organization_mapping_review_decision_invalid"); e.status = 400; e.code = e.message; throw e; }
      if (!reason) { const e = new Error("organization_mapping_review_reason_required"); e.status = 400; e.code = e.message; throw e; }
      const evaluation = await repository.getEvaluation(organizationId, evaluationId); if (!evaluation) { const e = new Error("organization_mapping_evaluation_not_found"); e.status = 404; e.code = e.message; throw e; }
      const review = await repository.saveReview({ organizationId, evaluationId, decision, reason, actorLogtoUserId });
      const response = safeResponse({ review, mutatedAuthorization: false });
      await audited(organizationId, actorLogtoUserId, "organization_mapping.reviewed", "evaluation", evaluationId, decision, reason, response, idempotencyKey);
      return response;
    },
    
    async preview({ organizationId, draftId, actorLogtoUserId, idempotencyKey }) {
      const idem=idempotency({organizationId,actorLogtoUserId,actionId:"organizationModel.evaluateMappingPolicies",idempotencyKey,request:{draftId}}); const replay = await repository.replayIdempotency(idem); if (replay) return replay;
      const draft = await repository.getDraft(organizationId, draftId); if (!draft) { const e = new Error("organization_mapping_draft_not_found"); e.status = 404; e.code = e.message; throw e; }
      const graph = buildOrganizationGraph(draft.model);
      const scopeTree = buildPrimaryScopeTree(draft.model);
      const facets = buildReusableFacets(draft.model);
      const base=await repository.getLatestPublication(organizationId);
      const registryState=require("../../core/organization-mapping/index.cjs").registryState();
      const impactDigest = digest({ graph, scopeTree, facets, previousModelHash:base?.modelHash||null, authorizationBroadening:"requires_reconciliation", authorizationMutation: false });
      const previewDigest = digest({ serializationVersion:"organization-mapping-preview-v2",organizationId,draftId: draft.id, draftVersion: draft.version,draftHash:digest(draft.model),basePublishedVersion:base?.publishedVersion||0,baseModelHash:base?.modelHash||null,registryState, graph, scopeTree, facets, impactDigest });
      const preview = await repository.savePreview({ organizationId, draftId: draft.id, draftVersion: draft.version, previewDigest, impactDigest, graph, scopeTree, facets });
      const response = safeResponse({ previewId: preview.id, draftId: draft.id, draftVersion: draft.version, previewDigest, impactDigest, graph, scopeTree, facets, mutatedAuthorization: false });
      await audited(organizationId, actorLogtoUserId, "organization_mapping.previewed", "draft", draft.id, "success", "preview_created", response, idempotencyKey);
      return repository.rememberIdempotency(idem, response);
    },
    async publish({ organizationId, draftId, expectedDraftVersion, expectedPublishedVersion, previewId, expectedImpactDigest, reason, actorLogtoUserId, idempotencyKey }) {
      assertReason(reason);
      const idem=idempotency({organizationId,actorLogtoUserId,actionId:"organizationModel.publishVersion",idempotencyKey,request:{draftId,previewId,expectedImpactDigest,reason},expectedVersion:`${expectedDraftVersion}:${expectedPublishedVersion}`}); const replay = await repository.replayIdempotency(idem); if (replay) return replay;
      return repository.transaction(async (tx)=>{
        await tx.acquirePublicationLock(organizationId);
        const draft=await tx.getDraft(organizationId,draftId); const preview=await tx.getPreview(organizationId,previewId); const base=await tx.getLatestPublication(organizationId);
        if(!draft||!preview){const e=new Error(!draft?"organization_mapping_draft_not_found":"organization_mapping_preview_not_found");e.status=404;e.code=e.message;throw e;}
        if(Number(draft.version)!==Number(expectedDraftVersion)||Number(preview.draftVersion)!==Number(draft.version)||Number(base?.publishedVersion||0)!==Number(expectedPublishedVersion||0)||preview.impactDigest!==expectedImpactDigest){const e=new Error("organization_mapping_publish_precondition_failed");e.status=409;e.code=e.message;throw e;}
        const graph=buildOrganizationGraph(draft.model),scopeTree=buildPrimaryScopeTree(draft.model),facets=buildReusableFacets(draft.model);
        const recomputedImpact=digest({graph,scopeTree,facets,previousModelHash:base?.modelHash||null,authorizationBroadening:"requires_reconciliation",authorizationMutation:false});
        if(recomputedImpact!==preview.impactDigest){const e=new Error("organization_mapping_impact_digest_stale");e.status=409;e.code=e.message;throw e;}
        const publication=await tx.savePublication({organizationId,draftId:draft.id,draftVersion:draft.version,previewId,model:draft.model,modelHash:digest(draft.model),impactDigest:recomputedImpact,graph,scopeTree,facets,basePublishedVersion:base?.publishedVersion||0});
        const workItems=await tx.saveReconciliationWorkItems(buildReconciliationWorkItems({organizationId,publicationId:publication.id,previousGraph:base?.graph,newGraph:graph}));
        const response=safeResponse({publicationId:publication.id,publishedVersion:publication.publishedVersion,immutable:true,modelHash:publication.modelHash,impactDigest:publication.impactDigest,graph,scopeTree,facets,reconciliationWorkItems:workItems,mutatedAuthorization:false});
        await tx.audit({organizationId,actorLogtoUserId,action:"organization_mapping.published",targetType:"publication",targetId:publication.id,result:"success",reason,event:response});
        await tx.enqueueOutbox({organizationId,eventType:"organization_mapping.published",targetType:"publication",targetId:publication.id,result:"success",reason,idempotencyKey,payload:response});
        return tx.rememberIdempotency(idem,response);
      });
    },
    async createRollbackDraft({ organizationId, publicationId, reason, actorLogtoUserId, idempotencyKey }) {
      assertReason(reason);
      const idem=idempotency({organizationId,actorLogtoUserId,actionId:"organizationModel.createRollbackDraft",idempotencyKey,request:{publicationId,reason}}); const replay = await repository.replayIdempotency(idem); if (replay) return replay;
      const publication = await repository.getPublication(organizationId, publicationId); if (!publication) { const e = new Error("organization_mapping_publication_not_found"); e.status = 404; e.code = e.message; throw e; }
      const draft = await repository.createDraft({ organizationId, model: { ...publication.model, rollbackSourcePublicationId: publicationId, rollbackSourceVersion:publication.publishedVersion } });
      const response = safeResponse({ draft, sourcePublicationId: publicationId, rollbackMutatesHistory: false });
      await audited(organizationId, actorLogtoUserId, "organization_mapping.rollback_draft.created", "publication", publicationId, "success", reason, response, idempotencyKey);
      return repository.rememberIdempotency(idem, response);
    },
    async listAudit({ organizationId, limit }) { return safeResponse({ events: await repository.listAudit(organizationId, limit) }); },
  });
}
module.exports = { CONTRACT_VERSION, createOrganizationMappingService, actor };
