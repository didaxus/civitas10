'use strict';
function createReviewCollaborationService({ reviewRepository, authorizationPolicy }) {
  if(!reviewRepository?.upsertCollaborator||!reviewRepository?.listAssignments||!reviewRepository?.listHistory||!reviewRepository?.configurePolicy) throw new TypeError('Review resource repository is incomplete');
  async function authorized(action,input,context){const decision=await authorizationPolicy.authorize({action,principal:context.principal,resource:{organizationId:input.organizationId,planId:input.planId}});if(!decision?.allowed)throw Object.assign(new Error('authorization_denied'),{code:'authorization_denied'});return decision;}
  return Object.freeze({
    async addCollaborator(input,context){await authorized('planning.review.collaborators.manage',input,context);return reviewRepository.upsertCollaborator({...input,assignedBy:context.principal.subjectId});},
    async configurePolicy(input,context){await authorized('planning.review.policy.manage',input,context);return reviewRepository.configurePolicy({...input,configuredBy:context.principal.subjectId});},
    async readReview(input,context){await authorized('planning.review.read',input,context);return {request:await reviewRepository.getReviewRequest(input),assignments:await reviewRepository.listAssignments(input),history:await reviewRepository.listHistory(input)};},
  });
}
module.exports={createReviewCollaborationService};
