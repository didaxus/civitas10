'use strict';
const {createPostgresReviewRepository}=require('../infrastructure/postgresReviewRepository');
const {createReviewWorkflowService}=require('../application/reviewWorkflowService');
const {createReviewCollaborationService}=require('../application/reviewCollaborationService');
const {createPlanningReviewRouter}=require('../presentation/reviewRoutes');
function createPlanningReviewRuntime({pool,authorizationPolicy,authorizeRequest}){
  if(!pool?.connect||!authorizationPolicy?.authorize||typeof authorizeRequest!=='function')throw new TypeError('Planning review composition dependencies are required');
  const postgres=createPostgresReviewRepository({pool});
  const workflowService=createReviewWorkflowService({reviewRepository:postgres.reviewRepository,authorizationPolicy,unitOfWork:postgres.unitOfWork,idempotencyLedger:postgres.idempotencyLedger,audit:postgres.audit,outbox:postgres.outbox});
  const collaborationService=createReviewCollaborationService({reviewRepository:postgres.reviewRepository,authorizationPolicy});
  const router=createPlanningReviewRouter({workflowService,collaborationService,authorizeRequest});
  return Object.freeze({postgres,workflowService,collaborationService,router});
}
module.exports={createPlanningReviewRuntime};
