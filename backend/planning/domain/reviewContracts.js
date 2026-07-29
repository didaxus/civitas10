const REVIEW_ACTIONS = Object.freeze({
  ASSIGN: 'planning.review.assign', SUBMIT: 'planning.review.submit',
  APPROVE: 'planning.review.approve', REJECT: 'planning.review.reject',
  START_DRAFT: 'planning.review.draft_from_approved',
});
const REVIEW_EVENTS = Object.freeze({
  ASSIGNED: 'planning.reviewer_assigned.v1', SUBMITTED: 'planning.review_submitted.v1',
  APPROVED: 'planning.review_approved.v1', REJECTED: 'planning.review_rejected.v1',
  DRAFT_STARTED: 'planning.draft_started_from_approved.v1',
});
const REVIEW_STATUS = Object.freeze({ DRAFT: 'draft', IN_REVIEW: 'in_review', APPROVED: 'approved', REJECTED: 'rejected' });

function command(type, value) {
  if (!value?.organizationId || !value?.planId || !value?.actorId) throw new TypeError(`${type} requires organizationId, planId and actorId`);
  return Object.freeze({ type, ...value });
}
const reviewCommands = Object.freeze({
  assignReviewer: (v) => command('planning.assign_reviewer.command.v1', v),
  submitReview: (v) => command('planning.submit_review.command.v1', v),
  approve: (v) => command('planning.approve_review.command.v1', v),
  reject: (v) => command('planning.reject_review.command.v1', v),
  draftFromApproved: (v) => command('planning.draft_from_approved.command.v1', v),
});
module.exports = { REVIEW_ACTIONS, REVIEW_EVENTS, REVIEW_STATUS, reviewCommands };
