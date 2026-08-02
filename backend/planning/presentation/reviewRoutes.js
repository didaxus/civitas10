'use strict';
const express=require('express');
function asyncHandler(handler){return(req,res,next)=>Promise.resolve(handler(req,res,next)).catch(next);}
function createPlanningReviewRouter({workflowService,collaborationService,authorizeRequest}){
  if(!workflowService||!collaborationService||typeof authorizeRequest!=='function')throw new TypeError('Planning review router dependencies are required');
  const router=express.Router();router.use(express.json({limit:'32kb'}));
  const context=(req)=>({principal:req.principal,correlationId:req.headers['x-correlation-id'],idempotencyKey:req.headers['idempotency-key']});
  const command=(req)=>({...req.body,organizationId:req.params.organizationId,planId:req.params.planId,actorId:req.principal.subjectId,idempotencyKey:req.headers['idempotency-key'],ifMatch:req.headers['if-match']});
  const guard=(action)=>asyncHandler(async(req,_res,next)=>{await authorizeRequest(action,req);next();});
  router.post('/o/:organizationId/planning/plans/:planId/collaborators',guard('planning.review.collaborators.manage'),asyncHandler(async(req,res)=>res.status(201).json(await collaborationService.addCollaborator(command(req),context(req)))));
  router.post('/o/:organizationId/planning/plans/:planId/reviewer-assignments',guard('planning.review.assign'),asyncHandler(async(req,res)=>res.status(201).json(await workflowService.assignReviewer(command(req),context(req)))));
  router.post('/o/:organizationId/planning/plans/:planId/approver-assignments',guard('planning.review.assign_approver'),asyncHandler(async(req,res)=>res.status(201).json(await workflowService.assignApprover(command(req),context(req)))));
  router.post('/o/:organizationId/planning/plans/:planId/review-requests',guard('planning.review.submit'),asyncHandler(async(req,res)=>res.status(201).json(await workflowService.submitReview(command(req),context(req)))));
  router.post('/o/:organizationId/planning/plans/:planId/review-decisions',guard('planning.review.decide'),asyncHandler(async(req,res)=>{const method=req.body.decision==='approve'?'approve':req.body.decision==='request_changes'?'reject':null;if(!method)return res.status(422).json({code:'review_decision_invalid'});return res.json(await workflowService[method](command(req),context(req)));}));
  router.post('/o/:organizationId/planning/plans/:planId/drafts',guard('planning.review.draft_from_approved'),asyncHandler(async(req,res)=>res.status(201).json(await workflowService.draftFromApproved(command(req),context(req)))));
  router.get('/o/:organizationId/planning/plans/:planId/review',guard('planning.review.read'),asyncHandler(async(req,res)=>res.json(await collaborationService.readReview({organizationId:req.params.organizationId,planId:req.params.planId},context(req)))));
  router.put('/o/:organizationId/planning/review-policy',guard('planning.review.policy.manage'),asyncHandler(async(req,res)=>res.json(await collaborationService.configurePolicy({...req.body,organizationId:req.params.organizationId},context(req)))));
  router.use((error,req,res,_next)=>res.status(error.code==='authorization_denied'?403:error.code==='etag_mismatch'?412:409).type('application/problem+json').json({type:`https://civitas.local/problems/${error.code||'review_failed'}`,title:'Planning review request failed',status:res.statusCode,code:error.code||'review_failed',correlationId:req.headers['x-correlation-id']}));
  return router;
}
module.exports={createPlanningReviewRouter};
