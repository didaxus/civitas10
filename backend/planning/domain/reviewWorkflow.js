const { createHash } = require('node:crypto');
const { REVIEW_EVENTS, REVIEW_STATUS, ASSIGNMENT_ROLES } = require('./reviewContracts');

class ReviewWorkflowError extends Error { constructor(code, message = code) { super(message); this.name = 'ReviewWorkflowError'; this.code = code; } }
const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
function deepFreeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(deepFreeze); } return value; }
function canonical(value) { if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`; if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((k)=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`; return JSON.stringify(value); }
function snapshotHash(snapshot) { return createHash('sha256').update(canonical(snapshot)).digest('hex'); }
function initialState(organizationId, planId) { return { organizationId, planId, status: REVIEW_STATUS.DRAFT, version: 0, collaborators: new Map(), assignments: new Map(), reviewRequests: new Map(), decisions: [], policy: null, approvedVersion: null, approvedSnapshot: null }; }
function applyReviewEvent(state, event) {
  if (state.organizationId !== event.organizationId || state.planId !== event.planId) throw new ReviewWorkflowError('tenant_or_aggregate_mismatch');
  const next = { ...state, collaborators:new Map(state.collaborators), assignments:new Map(state.assignments), reviewRequests:new Map(state.reviewRequests), decisions:[...state.decisions], version:event.aggregateVersion };
  if (event.type === REVIEW_EVENTS.COLLABORATOR_ADDED) next.collaborators.set(event.collaboratorId, { collaboratorId:event.collaboratorId, capabilities:event.capabilities || ['edit'], active:true });
  if (event.type === REVIEW_EVENTS.POLICY_VERSIONED) next.policy = deepFreeze(clone(event.policy));
  if (event.type === REVIEW_EVENTS.ASSIGNED) next.assignments.set(event.assignmentId, { assignmentId:event.assignmentId, assigneeId:event.assigneeId || event.reviewerId, role:event.role || ASSIGNMENT_ROLES.REVIEWER, planVersion:event.planVersion, policyVersion:event.policyVersion, active:true });
  if (event.type === REVIEW_EVENTS.REQUESTED) next.reviewRequests.set(event.reviewRequestId, { reviewRequestId:event.reviewRequestId, assignmentIds:[...event.assignmentIds], planVersion:event.planVersion, policyVersion:event.policyVersion, status:'open' });
  if (event.type === REVIEW_EVENTS.SUBMITTED) { next.status=REVIEW_STATUS.IN_REVIEW; next.authorId=event.authorId; }
  if (event.type === REVIEW_EVENTS.APPROVED || event.type === REVIEW_EVENTS.CHANGES_REQUESTED) {
    next.status=event.type === REVIEW_EVENTS.APPROVED ? REVIEW_STATUS.APPROVED : REVIEW_STATUS.CHANGES_REQUESTED;
    next.decisions.push({ decisionId:event.decisionId, assignmentId:event.assignmentId, decision:event.decision, actorId:event.actorId, planVersion:event.planVersion, policyVersion:event.policyVersion });
    const assignment=next.assignments.get(event.assignmentId); if (assignment) next.assignments.set(event.assignmentId,{...assignment,active:false});
    if (event.reviewRequestId && next.reviewRequests.has(event.reviewRequestId)) next.reviewRequests.set(event.reviewRequestId,{...next.reviewRequests.get(event.reviewRequestId),status:'completed'});
    if (event.type === REVIEW_EVENTS.APPROVED) next.approvedVersion=event.planVersion, next.approvedSnapshot=deepFreeze(clone(event.approvedSnapshot));
  }
  if (event.type === REVIEW_EVENTS.DRAFT_STARTED) next.status=REVIEW_STATUS.DRAFT;
  return next;
}
function rehydrateReviewWorkflow(events, identity) { return events.reduce(applyReviewEvent, initialState(identity.organizationId,identity.planId)); }
function evolve(state,type,data) { return Object.freeze({ type,organizationId:state.organizationId,planId:state.planId,aggregateVersion:state.version+1,occurredAt:data.occurredAt,...data }); }
function assertPolicy(state,input) { if (!state.policy) throw new ReviewWorkflowError('maker_checker_policy_required'); if (String(input.policyVersion)!==String(state.policy.version)) throw new ReviewWorkflowError('stale_policy_version'); }
function assertAssignment(state,input,role) { const a=state.assignments.get(input.assignmentId); if (!a || !a.active || a.assigneeId!==input.actorId || a.role!==role) throw new ReviewWorkflowError('assignment_not_active'); if (String(a.planVersion)!==String(input.planVersion)) throw new ReviewWorkflowError('stale_assignment'); if (String(a.policyVersion)!==String(input.policyVersion)) throw new ReviewWorkflowError('stale_policy_version'); if (state.decisions.some((d)=>d.assignmentId===input.assignmentId)) throw new ReviewWorkflowError('duplicate_decision'); return a; }
const workflow=Object.freeze({
  versionPolicy(state,input) { if (!Number.isInteger(input.policy?.version) || input.policy.version < 1 || (state.policy && input.policy.version !== state.policy.version+1)) throw new ReviewWorkflowError('invalid_policy_version'); return evolve(state,REVIEW_EVENTS.POLICY_VERSIONED,input); },
  addCollaborator(state,input) { if (state.status===REVIEW_STATUS.APPROVED) throw new ReviewWorkflowError('approved_snapshot_immutable'); return evolve(state,REVIEW_EVENTS.COLLABORATOR_ADDED,input); },
  assign(state,input) { if (![REVIEW_STATUS.DRAFT,REVIEW_STATUS.CHANGES_REQUESTED].includes(state.status)) throw new ReviewWorkflowError('plan_not_assignable'); assertPolicy(state,input); if (!Object.values(ASSIGNMENT_ROLES).includes(input.role)) throw new ReviewWorkflowError('assignment_role_invalid'); return evolve(state,REVIEW_EVENTS.ASSIGNED,{...input,assigneeId:input.assigneeId || input.reviewerId}); },
  requestReview(state,input) { assertPolicy(state,input); const ids=input.assignmentIds || []; if (!ids.length || ids.some((id)=>!state.assignments.get(id)?.active)) throw new ReviewWorkflowError('active_assignment_required'); return evolve(state,REVIEW_EVENTS.REQUESTED,{...input,assignmentIds:[...ids]}); },
  submit(state,input) { if (![REVIEW_STATUS.DRAFT,REVIEW_STATUS.CHANGES_REQUESTED].includes(state.status)) throw new ReviewWorkflowError('plan_not_submittable'); assertPolicy(state,input); if (![...state.assignments.values()].some((a)=>a.active && String(a.planVersion)===String(input.planVersion))) throw new ReviewWorkflowError('active_assignment_required'); return evolve(state,REVIEW_EVENTS.SUBMITTED,input); },
  approve(state,input) { assertPolicy(state,input); if (input.actorId===state.authorId) throw new ReviewWorkflowError('self_approval_denied'); if (state.status!==REVIEW_STATUS.IN_REVIEW) throw new ReviewWorkflowError('plan_not_in_review'); assertAssignment(state,input,ASSIGNMENT_ROLES.APPROVER); const snapshot=clone(input.approvedSnapshot); if (!snapshot || typeof snapshot!=='object') throw new ReviewWorkflowError('approved_snapshot_required'); const provenance=deepFreeze(clone({ organizationId:state.organizationId,planId:state.planId,planVersion:input.planVersion,policyVersion:input.policyVersion,approvedBy:input.actorId,approvedAt:input.occurredAt,...input.provenance })); return evolve(state,REVIEW_EVENTS.APPROVED,{...input,decision:'approved',approvedSnapshot:deepFreeze(snapshot),snapshotHash:snapshotHash(snapshot),provenance}); },
  requestChanges(state,input) { assertPolicy(state,input); if (state.status!==REVIEW_STATUS.IN_REVIEW) throw new ReviewWorkflowError('plan_not_in_review'); assertAssignment(state,input,ASSIGNMENT_ROLES.REVIEWER); return evolve(state,REVIEW_EVENTS.CHANGES_REQUESTED,{...input,decision:'changes_requested'}); },
  draftFromApproved(state,input) { if (state.status!==REVIEW_STATUS.APPROVED) throw new ReviewWorkflowError('plan_not_approved'); return evolve(state,REVIEW_EVENTS.DRAFT_STARTED,{...input,sourceApprovedVersion:state.approvedVersion,baseSnapshot:clone(state.approvedSnapshot)}); },
});
module.exports={ ReviewWorkflowError,initialState,applyReviewEvent,rehydrateReviewWorkflow,workflow,snapshotHash };
