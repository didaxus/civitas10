const { randomUUID, createHash } = require('node:crypto');
const { REVIEW_ACTIONS, REVIEW_EVENTS, rehydrateReviewWorkflow, workflow, ReviewWorkflowError } = require('../domain');

class ReviewApplicationError extends Error { constructor(code, details) { super(code); this.name='ReviewApplicationError'; this.code=code; this.details=details; } }
const actionFor = { assignReviewer:REVIEW_ACTIONS.ASSIGN, assignApprover:REVIEW_ACTIONS.ASSIGN_APPROVER, submitReview:REVIEW_ACTIONS.SUBMIT, approve:REVIEW_ACTIONS.APPROVE, reject:REVIEW_ACTIONS.REJECT, draftFromApproved:REVIEW_ACTIONS.START_DRAFT };
const handlerFor = { assignReviewer:'assign', assignApprover:'assign', submitReview:'submit', approve:'approve', reject:'reject', draftFromApproved:'draftFromApproved' };
function fingerprint(command) { return JSON.stringify(Object.keys(command).sort().reduce((o,k)=>(o[k]=command[k],o),{})); }

function createReviewWorkflowService(ports, options={}) {
  if (!ports?.reviewRepository?.loadEvents || !ports?.reviewRepository?.append) throw new TypeError('reviewRepository loadEvents and append are required');
  if (!ports?.authorizationPolicy?.authorize) throw new TypeError('authorizationPolicy.authorize is required');
  if (!ports?.unitOfWork?.transaction) throw new TypeError('unitOfWork.transaction is required for atomic workflow writes');
  const clock=options.clock || (()=>new Date()); const uuid=options.uuid || randomUUID;
  async function execute(operation, command, context={}) {
    const action=actionFor[operation]; const key=command.idempotencyKey || context.idempotencyKey;
    if (!key) throw new ReviewApplicationError('idempotency_key_required');
    if (!command.ifMatch && command.ifMatch !== 0) throw new ReviewApplicationError('if_match_required');
    const fp=fingerprint(command);
    return ports.unitOfWork.transaction(async (tx) => {
      const ledger=tx.idempotencyLedger || ports.idempotencyLedger;
      const prior=await ledger?.lookup({ organizationId:command.organizationId, operation:action, key });
      if (prior) { if (prior.fingerprint !== fp) throw new ReviewApplicationError('idempotency_conflict'); return prior.result; }
      const repo=tx.reviewRepository || ports.reviewRepository;
      const events=await repo.loadEvents({ organizationId:command.organizationId, planId:command.planId });
      const state=rehydrateReviewWorkflow(events, command);
      if (String(state.version) !== String(command.ifMatch)) throw new ReviewApplicationError('etag_mismatch', { expected:command.ifMatch, current:state.version });
      const resource={ organizationId:command.organizationId, planId:command.planId, authorId:state.authorId || command.authorId, assignmentId:command.assignmentId, planVersion:command.planVersion, state };
      const authorization=await ports.authorizationPolicy.authorize({ action, principal:context.principal || { subjectId:command.actorId }, resource, environment:context.environment || {} });
      if (!authorization?.allowed) throw new ReviewApplicationError('authorization_denied', { decisionId:authorization?.decisionId, reason:authorization?.reason });
      if (operation === 'approve' && command.actorId === resource.authorId) throw new ReviewApplicationError('self_approval_denied');
      let event;
      const occurredAt=clock().toISOString();
      const makerChecker=operation==='approve'?await repo.getActivePolicy?.({organizationId:command.organizationId}):null;
      if(operation==='approve'&&(!makerChecker||authorization.dataScope!=='assigned_approvals'||authorization.permission!=='planning.plans.approve')) throw new ReviewApplicationError('approval_policy_or_scope_required');
      if(operation==='approve'&&(!command.approvedSnapshot||typeof command.approvedSnapshot!=='object'||Array.isArray(command.approvedSnapshot))) throw new ReviewApplicationError('approved_snapshot_required');
      const approval=operation==='approve'?{ snapshotHash:createHash('sha256').update(JSON.stringify(command.approvedSnapshot)).digest('hex'), provenance:{ organizationId:command.organizationId,planId:command.planId,planVersion:command.planVersion,actorId:command.actorId,approvedAt:occurredAt,policyVersion:makerChecker.policy_version },policyVersion:makerChecker.policy_version }:{};
      try { event=workflow[handlerFor[operation]](state, { ...command, ...(operation==='assignApprover'?{assignmentType:'approver'}:{}), ...approval,eventId:uuid(), reviewRequestId:command.reviewRequestId||uuid(), decisionId:command.decisionId || uuid(), occurredAt }); }
      catch (error) { if (error instanceof ReviewWorkflowError) throw new ReviewApplicationError(error.code); throw error; }
      await repo.append({ organizationId:command.organizationId, planId:command.planId, expectedVersion:state.version, event });
      const result=Object.freeze({ organizationId:command.organizationId, planId:command.planId, status:event.type, version:event.aggregateVersion, etag:String(event.aggregateVersion), event });
      const audit={ organizationId:command.organizationId, action, actorId:command.actorId, targetId:command.planId, decisionId:authorization.decisionId, correlationId:context.correlationId, eventId:event.eventId };
      await (tx.audit || ports.audit)?.record(audit);
      const safeEvent={...event};delete safeEvent.approvedSnapshot;delete safeEvent.baseSnapshot;
      await (tx.outbox || ports.outbox)?.enqueue({ eventId:event.eventId, type:event.type, organizationId:command.organizationId, aggregateId:command.planId, aggregateVersion:event.aggregateVersion, payload:safeEvent, correlationId:context.correlationId });
      await ledger?.recordSuccess({ organizationId:command.organizationId, operation:action, key, fingerprint:fp, result });
      return result;
    });
  }
  return Object.freeze(Object.fromEntries(Object.keys(actionFor).map((name)=>[name,(command,context)=>execute(name,command,context)])));
}
module.exports={ createReviewWorkflowService, ReviewApplicationError };
