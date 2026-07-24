const PLANNING_MODULE_ID = 'planning';
const PLANNING_REMOTE_PORT_VERSION = 'planning-remote-application-port/v1';
const EXECUTION_KINDS = Object.freeze(['read', 'write', 'asynchronous']);
const REMOTE_PROBLEM_CODES = Object.freeze({
  VALIDATION: 'planning.remote.validation', NOT_FOUND: 'planning.remote.not_found', CONFLICT: 'planning.remote.conflict',
  PRECONDITION: 'planning.remote.precondition_failed', PRECONDITION_REQUIRED: 'planning.remote.precondition_required', AUTH_CONTEXT: 'planning.remote.authorization_context_rejected',
  CONTRACT_MISMATCH: 'planning.remote.contract_mismatch', UNAVAILABLE: 'planning.remote.unavailable', TIMEOUT: 'planning.remote.timeout',
  BAD_GATEWAY: 'planning.remote.bad_gateway', UNEXPECTED: 'planning.remote.unexpected', TENANT_MISMATCH: 'planning.remote.tenant_mismatch',
  IDEMPOTENCY_CONFLICT: 'planning.remote.idempotency_conflict', BULKHEAD_REJECTED: 'planning.remote.bulkhead_rejected'
});
const NAMED_USE_CASES = Object.freeze({
  createPlan: { capabilityId:'planning.plans', operationId:'planning.plans.create', actionId:'planning.plans.create', permission:'planning.plans.manage', executionKind:'write', idempotency:'required', concurrency:'none', planned:true },
  listPlans: { capabilityId:'planning.plans', operationId:'planning.plans.list', actionId:'planning.plans.read', permission:'planning.plans.read', executionKind:'read', idempotency:'forbidden', concurrency:'none', planned:true },
  getPlan: { capabilityId:'planning.plans', operationId:'planning.plans.get', actionId:'planning.plans.read', permission:'planning.plans.read', executionKind:'read', idempotency:'forbidden', concurrency:'none', planned:true },
  updatePlan: { capabilityId:'planning.plans', operationId:'planning.plans.update', actionId:'planning.plans.update', permission:'planning.plans.manage', executionKind:'write', idempotency:'required', concurrency:'if-match', planned:true },
<<<<<<< ours
  getProfile: { capabilityId:'planning.profile', operationId:'planning.profile.get', actionId:'planning.profile.read', permission:'planning.profile.read', executionKind:'read', idempotency:'forbidden', concurrency:'none', planned:true },
  replaceProfile: { capabilityId:'planning.profile', operationId:'planning.profile.replace', actionId:'planning.profile.replace', permission:'planning.profile.manage', executionKind:'write', idempotency:'required', concurrency:'if-match', planned:true }
=======
  archivePlan: { capabilityId:'planning.plans', operationId:'planning.plans.archive', actionId:'planning.plans.archive', permission:'planning.plans.manage', executionKind:'write', idempotency:'required', concurrency:'if-match', planned:true },
  getProfile: { capabilityId:'planning.profile', operationId:'planning.profile.get', actionId:'planning.profile.read', permission:'planning.agora.read', executionKind:'read', idempotency:'forbidden', concurrency:'none', planned:true },
  replaceProfile: { capabilityId:'planning.profile', operationId:'planning.profile.replace', actionId:'planning.profile.update', permission:'planning.agora.manage', executionKind:'write', idempotency:'required', concurrency:'if-match', planned:true }
>>>>>>> theirs
});
function assertPlanningRemoteCallContext(context, useCase){
  if(!context || context.organizationId !== context.authorizationDecision?.organizationId && context.authorizationDecision?.organizationId) throw new Error('planning remote context tenant mismatch');
  if(context.operation?.moduleId !== PLANNING_MODULE_ID) throw new Error('planning remote context module mismatch');
  const expected = NAMED_USE_CASES[useCase]; if(!expected) throw new Error('unknown planning remote use case');
  for (const k of ['capabilityId','operationId','actionId','permission','executionKind']) if(context.operation[k] !== expected[k]) throw new Error(`planning remote context ${k} mismatch`);
  if(context.availabilityDecision?.executable !== true) throw new Error('planning remote context requires executable availability decision');
  if(!context.authorizationDecision?.decisionId || !context.availabilityDecision?.decisionId || !context.correlationId) throw new Error('planning remote context missing decision/correlation');
  if(expected.idempotency === 'required' && !context.idempotency?.key) throw new Error('planning remote idempotency key required');
  if(expected.idempotency === 'forbidden' && context.idempotency?.key) throw new Error('planning remote idempotency forbidden');
  if(!EXECUTION_KINDS.includes(context.operation.executionKind)) throw new Error('planning remote execution kind invalid');
  return true;
}
function ok(value, meta){ return Object.freeze({ ok:true, value, runtimeContractVersion:meta.runtimeContractVersion, runtimeBindingVersion:meta.runtimeBindingVersion, correlationId:meta.correlationId, remoteRequestId:meta.remoteRequestId }); }
function problem(code, category, options={}){ return Object.freeze({ code, category, retryable:!!options.retryable, titleKey:options.titleKey||code, detailKey:options.detailKey||code, correlationId:options.correlationId, decisionId:options.decisionId, fieldViolations:options.fieldViolations||[], expectedVersion:options.expectedVersion, currentVersion:options.currentVersion }); }
function failed(problemValue, correlationId){ return Object.freeze({ ok:false, problem:problemValue, correlationId }); }
function createPlanningRemoteApplicationPort(impl){ const required=Object.keys(NAMED_USE_CASES); for(const m of required) if(typeof impl?.[m] !== 'function') throw new Error(`PlanningRemoteApplicationPort missing named use case ${m}`); for(const forbidden of ['execute','call','invoke','dispatch','request','runRemoteAction','executePlanningOperation']) if(typeof impl[forbidden] === 'function') throw new Error(`PlanningRemoteApplicationPort forbids generic ${forbidden}`); return Object.freeze(Object.fromEntries(required.map((m)=>[m, impl[m].bind(impl)]))); }
module.exports = { PLANNING_MODULE_ID, PLANNING_REMOTE_PORT_VERSION, NAMED_USE_CASES, REMOTE_PROBLEM_CODES, assertPlanningRemoteCallContext, ok, problem, failed, createPlanningRemoteApplicationPort };
