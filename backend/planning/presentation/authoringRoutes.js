'use strict';
const express=require('express');
const { PlanningAuthoringError }=require('../application/authoringService');
function context(req){return {organizationId:req.params.organizationId,actorId:req.auth?.subject||req.user?.sub,permissions:req.auth?.permissions||req.user?.permissions||[]};}
function problem(res,error){const known=error instanceof PlanningAuthoringError;const status=known?error.status:500;return res.status(status).type('application/problem+json').json({type:`https://civitas.local/problems/planning/${known?error.code:'internal'}`,title:known?error.code:'internal',status,detail:known?error.message:'Planning operation failed.',code:known?error.code:'internal'});}
function createPlanningAuthoringRouter(service){const router=express.Router({mergeParams:true});router.use(express.json({limit:'256kb'}));
  router.put('/roadmaps/:roadmapId/units/order',async(req,res)=>{try{const value=await service.reorderUnits({roadmapId:req.params.roadmapId,orderedIds:req.body?.orderedIds,ifMatch:req.get('If-Match'),idempotencyKey:req.get('Idempotency-Key')},context(req));return res.set('ETag',value.etag).json(value);}catch(e){return problem(res,e);}});
  router.post('/assessment-blueprints/:blueprintId/validation-runs',async(req,res)=>{try{const value=await service.runValidation({blueprintId:req.params.blueprintId,idempotencyKey:req.get('Idempotency-Key')},context(req));return res.status(201).json(value);}catch(e){return problem(res,e);}});return router;}
module.exports={createPlanningAuthoringRouter};

