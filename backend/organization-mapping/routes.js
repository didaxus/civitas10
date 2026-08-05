"use strict";
const express = require("express");
const { organizationMappingLifecycleActions } = require("../../core/organization-mapping/index.cjs");
const { actor } = require("./service");
const permissionFor = Object.freeze(Object.fromEntries(organizationMappingLifecycleActions.map((a) => [a.actionId, a.requiredPermission])));
function requireDeclaredAction(actionId) {
  const requiredPermission = permissionFor[actionId];
  return (req, res, next) => {
    if (!requiredPermission) return res.status(500).json({ error: "action_unregistered", code: "action_unregistered" });
    req.organizationMappingAction = { actionId, requiredPermission };
    return next();
  };
}
function sendError(res, error) { return res.status(error.status || 500).json({ error: error.code || "organization_mapping_error", code: error.code || "organization_mapping_error" }); }
function createOrganizationMappingRouter({ service, authorizeAction }) {
  if(typeof authorizeAction!=="function") throw new Error("organization_mapping_authorization_pipeline_required");
  const router = express.Router({ mergeParams: true }); router.use(express.json({ limit: "128kb" }));
  const guard=(actionId)=>[requireDeclaredAction(actionId),...authorizeAction(actionId,permissionFor[actionId])];
  router.post("/o/:organizationId/organization-model/drafts", ...guard("organizationModel.editDraft"), async (req,res)=>{ try { res.status(201).json(await service.createDraft({ organizationId:req.params.organizationId, model:req.body?.model || {}, actorLogtoUserId:actor(req), idempotencyKey:req.get("Idempotency-Key") })); } catch(e) { sendError(res,e); } });
  router.put("/o/:organizationId/organization-model/drafts/:draftId", ...guard("organizationModel.editDraft"), async (req,res)=>{ try { res.json(await service.updateDraft({ organizationId:req.params.organizationId, draftId:req.params.draftId, model:req.body?.model || {}, expectedVersion:req.get("If-Match") || req.body?.expectedVersion, actorLogtoUserId:actor(req), idempotencyKey:req.get("Idempotency-Key") })); } catch(e) { sendError(res,e); } });
  router.post("/o/:organizationId/organization-model/evaluations", ...guard("organizationModel.evaluateMappingPolicies"), async (req,res)=>{ try { res.status(201).json(await service.evaluate({ organizationId:req.params.organizationId, draftId:req.body?.draftId, policy:req.body?.policy || { rules: [] }, sourceFacts:req.body?.sourceFacts || {}, sourceConnectionId:req.body?.sourceConnectionId, actorLogtoUserId:actor(req), idempotencyKey:req.get("Idempotency-Key") })); } catch(e) { sendError(res,e); } });
  router.post("/o/:organizationId/organization-model/drafts/:draftId/preview", ...guard("organizationModel.evaluateMappingPolicies"), async (req,res)=>{ try { res.status(201).json(await service.preview({ organizationId:req.params.organizationId, draftId:req.params.draftId, actorLogtoUserId:actor(req), idempotencyKey:req.get("Idempotency-Key") })); } catch(e) { sendError(res,e); } });
  router.post("/o/:organizationId/organization-model/drafts/:draftId/publish", ...guard("organizationModel.publishVersion"), async (req,res)=>{ try { res.status(201).json(await service.publish({ organizationId:req.params.organizationId, draftId:req.params.draftId, expectedDraftVersion:req.body?.expectedDraftVersion, expectedPublishedVersion:req.body?.expectedPublishedVersion, previewId:req.body?.previewId, expectedImpactDigest:req.body?.expectedImpactDigest, reason:req.body?.reason, actorLogtoUserId:actor(req), idempotencyKey:req.get("Idempotency-Key") })); } catch(e) { sendError(res,e); } });
  router.post("/o/:organizationId/organization-model/publications/:publicationId/rollback-draft", ...guard("organizationModel.createRollbackDraft"), async (req,res)=>{ try { res.status(201).json(await service.createRollbackDraft({ organizationId:req.params.organizationId, publicationId:req.params.publicationId, reason:req.body?.reason, actorLogtoUserId:actor(req), idempotencyKey:req.get("Idempotency-Key") })); } catch(e) { sendError(res,e); } });
  router.post("/o/:organizationId/organization-model/evaluations/:evaluationId/reviews", ...guard("organizationModel.approveMapping"), async (req,res)=>{ try { res.status(201).json(await service.review({ organizationId:req.params.organizationId, evaluationId:req.params.evaluationId, decision:req.body?.decision, reason:req.body?.reason, actorLogtoUserId:actor(req), idempotencyKey:req.get("Idempotency-Key") })); } catch(e) { sendError(res,e); } });
  router.get("/o/:organizationId/organization-model/audit", ...guard("organizationModel.inspectAuditHistory"), async (req,res)=>{ try { res.json(await service.listAudit({ organizationId:req.params.organizationId, limit:req.query.limit })); } catch(e) { sendError(res,e); } });
  return router;
}
module.exports = { createOrganizationMappingRouter, requireDeclaredAction };
