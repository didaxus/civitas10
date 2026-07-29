const { REVIEW_EVENTS, REVIEW_STATUS } = require('./reviewContracts');

class ReviewWorkflowError extends Error { constructor(code, message = code) { super(message); this.name = 'ReviewWorkflowError'; this.code = code; } }
function initialState(organizationId, planId) { return { organizationId, planId, status: REVIEW_STATUS.DRAFT, version: 0, assignments: new Map(), decisions: [], approvedVersion: null, approvedSnapshot: null }; }
function applyReviewEvent(state, event) {
  if (state.organizationId !== event.organizationId || state.planId !== event.planId) throw new ReviewWorkflowError('tenant_or_aggregate_mismatch');
  const next = { ...state, assignments: new Map(state.assignments), decisions: [...state.decisions], version: event.aggregateVersion };
  if (event.type === REVIEW_EVENTS.ASSIGNED || event.type === REVIEW_EVENTS.APPROVER_ASSIGNED) next.assignments.set(event.assignmentId, { assignmentId:event.assignmentId, assigneeId:event.assigneeId||event.reviewerId, assignmentType:event.assignmentType||(event.type===REVIEW_EVENTS.APPROVER_ASSIGNED?'approver':'reviewer'), planVersion:event.planVersion, active:true, expiresAt:event.expiresAt||null });
  if (event.type === REVIEW_EVENTS.SUBMITTED) { next.status = REVIEW_STATUS.IN_REVIEW; next.authorId = event.authorId; }
  if (event.type === REVIEW_EVENTS.APPROVED || event.type === REVIEW_EVENTS.REJECTED) {
    next.status = event.type === REVIEW_EVENTS.APPROVED ? REVIEW_STATUS.APPROVED : REVIEW_STATUS.CHANGES_REQUESTED;
    next.decisions.push({ decisionId:event.decisionId, assignmentId:event.assignmentId, decision:event.decision, actorId:event.actorId, planVersion:event.planVersion });
    const assignment = next.assignments.get(event.assignmentId); if (assignment) next.assignments.set(event.assignmentId, { ...assignment, active:false });
    if (event.type === REVIEW_EVENTS.APPROVED) { next.approvedVersion = event.planVersion; next.approvedSnapshot = event.approvedSnapshot; }
  }
  if (event.type === REVIEW_EVENTS.DRAFT_STARTED) next.status = REVIEW_STATUS.DRAFT;
  return next;
}
function rehydrateReviewWorkflow(events, identity) { return events.reduce(applyReviewEvent, initialState(identity.organizationId, identity.planId)); }
function evolve(state, type, data) { return Object.freeze({ type, organizationId:state.organizationId, planId:state.planId, aggregateVersion:state.version + 1, occurredAt:data.occurredAt, ...data }); }
function assertAssignment(state, assignmentId, actorId, planVersion, assignmentType) {
  const a = state.assignments.get(assignmentId);
  if (!a || !a.active || a.assigneeId !== actorId || a.assignmentType !== assignmentType || (a.expiresAt && new Date(a.expiresAt)<=new Date())) throw new ReviewWorkflowError('assignment_not_active');
  if (String(a.planVersion) !== String(planVersion)) throw new ReviewWorkflowError('stale_assignment');
  if (state.decisions.some((d) => d.assignmentId === assignmentId)) throw new ReviewWorkflowError('duplicate_decision');
  return a;
}
function decide(state, input, decision, type, assignmentType) { assertAssignment(state, input.assignmentId, input.actorId, input.planVersion, assignmentType); return evolve(state, type, { ...input, decision }); }
const workflow = Object.freeze({
  assign(state, input) { if (state.status !== REVIEW_STATUS.DRAFT && state.status !== REVIEW_STATUS.CHANGES_REQUESTED) throw new ReviewWorkflowError('plan_not_assignable'); const assignmentType=input.assignmentType||'reviewer'; return evolve(state, assignmentType==='approver'?REVIEW_EVENTS.APPROVER_ASSIGNED:REVIEW_EVENTS.ASSIGNED, { ...input,assignmentType,assigneeId:input.assigneeId||input.reviewerId }); },
  submit(state, input) { if (state.status !== REVIEW_STATUS.DRAFT && state.status !== REVIEW_STATUS.CHANGES_REQUESTED) throw new ReviewWorkflowError('plan_not_submittable'); if (![...state.assignments.values()].some((a)=>a.active && String(a.planVersion)===String(input.planVersion))) throw new ReviewWorkflowError('active_assignment_required'); return evolve(state, REVIEW_EVENTS.SUBMITTED, input); },
  approve(state, input) { if (input.actorId === state.authorId) throw new ReviewWorkflowError('self_approval_denied'); if (state.status !== REVIEW_STATUS.IN_REVIEW) throw new ReviewWorkflowError('plan_not_in_review'); return decide(state, input, 'approved', REVIEW_EVENTS.APPROVED, 'approver'); },
  reject(state, input) { if (state.status !== REVIEW_STATUS.IN_REVIEW) throw new ReviewWorkflowError('plan_not_in_review'); return decide(state, input, 'rejected', REVIEW_EVENTS.REJECTED, 'reviewer'); },
  draftFromApproved(state, input) { if (state.status !== REVIEW_STATUS.APPROVED) throw new ReviewWorkflowError('plan_not_approved'); if (!input.actorId || !input.occurredAt || !String(input.reason||'').trim() || !/^[a-f0-9]{64}$/.test(String(input.sourceHash||''))) throw new ReviewWorkflowError('draft_provenance_required'); return evolve(state, REVIEW_EVENTS.DRAFT_STARTED, { ...input, sourceVersion:state.approvedVersion, sourceHash:input.sourceHash, actorId:input.actorId, timestamp:input.occurredAt, reason:input.reason, baseSnapshot:state.approvedSnapshot }); },
});
module.exports = { ReviewWorkflowError, initialState, applyReviewEvent, rehydrateReviewWorkflow, workflow };
