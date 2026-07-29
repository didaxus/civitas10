const REVIEW_ACTIONS = Object.freeze({
  COLLABORATE: 'planning.review.collaborate', ASSIGN: 'planning.review.assign',
  REQUEST: 'planning.review.request', SUBMIT: 'planning.review.submit',
  APPROVE: 'planning.review.approve', REQUEST_CHANGES: 'planning.review.changes_requested',
  START_DRAFT: 'planning.review.draft_from_approved',
});
const REVIEW_EVENTS = Object.freeze({
  COLLABORATOR_ADDED: 'planning.collaborator_added.v1',
  ASSIGNED: 'planning.review_assignment_created.v1', REQUESTED: 'planning.review_requested.v1',
  SUBMITTED: 'planning.review_submitted.v1', APPROVED: 'planning.review_approved.v1',
  CHANGES_REQUESTED: 'planning.review_changes_requested.v1',
  POLICY_VERSIONED: 'planning.maker_checker_policy_versioned.v1',
  DRAFT_STARTED: 'planning.draft_started_from_approved.v1',
});
const REVIEW_STATUS = Object.freeze({ DRAFT: 'draft', IN_REVIEW: 'in_review', APPROVED: 'approved', CHANGES_REQUESTED: 'changes_requested' });
const ASSIGNMENT_ROLES = Object.freeze({ REVIEWER: 'reviewer', APPROVER: 'approver' });

function command(type, value) {
  if (!value?.organizationId || !value?.planId || !value?.actorId) throw new TypeError(`${type} requires organizationId, planId and actorId`);
  return Object.freeze({ type, ...value });
}
const reviewCommands = Object.freeze({
  addCollaborator: (v) => command('planning.add_collaborator.command.v1', v),
  assign: (v) => command('planning.assign_review_role.command.v1', v),
  assignReviewer: (v) => command('planning.assign_review_role.command.v1', { role: ASSIGNMENT_ROLES.REVIEWER, ...v }),
  assignApprover: (v) => command('planning.assign_review_role.command.v1', { role: ASSIGNMENT_ROLES.APPROVER, ...v }),
  requestReview: (v) => command('planning.request_review.command.v1', v),
  submitReview: (v) => command('planning.submit_review.command.v1', v),
  approve: (v) => command('planning.approve_review.command.v1', v),
  requestChanges: (v) => command('planning.request_changes.command.v1', v),
  draftFromApproved: (v) => command('planning.draft_from_approved.command.v1', v),
});
module.exports = { REVIEW_ACTIONS, REVIEW_EVENTS, REVIEW_STATUS, ASSIGNMENT_ROLES, reviewCommands };
