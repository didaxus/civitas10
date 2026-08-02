const { ToolExecutionError, TOOL_PROBLEMS } = require('./applicationServiceToolGateway');

const POLICY_VERSION = 'civitas-confirmation-policy/2026-07-01';
const text = (value, field) => { if (typeof value !== 'string' || !value.trim()) throw new ToolExecutionError(TOOL_PROBLEMS.INVALID, { field }); return value.trim(); };
const object = (value, field) => { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ToolExecutionError(TOOL_PROBLEMS.INVALID, { field }); return value; };
const base = (id, applicationServiceId, permission, options = {}) => Object.freeze({
  id, version: '1.0.0', status: 'active', exposure: 'curated', applicationServiceId, permission,
  effect: options.effect || 'write', risk: 'R2', confirmationPolicyVersion: POLICY_VERSION,
  requiresIfMatch: options.requiresIfMatch !== false, makerChecker: true, timeoutMs: options.timeoutMs || 5000,
  diff: { before: (input) => input.current || {}, after: (input) => input.changes || input.plan || input.document || input },
  ...options,
});

const planningWriteTools = Object.freeze([
  base('planning.plan.create', 'createPlan', 'planning.plans.manage', {
    requiresIfMatch: false,
    validateInput: (x) => ({ plan: object(x?.plan, 'plan') }),
    buildCommand: (x, { tenantId }) => ({ type: 'planning.create_plan.command.v1', organizationId: tenantId, ...x.plan }),
  }),
  base('planning.plan.update', 'updatePlan', 'planning.plans.manage', {
    validateInput: (x) => ({ planId: text(x?.planId, 'planId'), current: object(x?.current, 'current'), changes: object(x?.changes, 'changes') }),
    buildCommand: (x, { tenantId }) => ({ type: 'planning.update_plan.command.v1', organizationId: tenantId, planId: x.planId, ...x.changes }),
  }),
  base('planning.review.submit', 'submitReview', 'planning.plans.manage', {
    validateInput: (x) => ({ planId: text(x?.planId, 'planId'), review: object(x?.review, 'review') }),
    buildCommand: (x, { tenantId }) => ({ type: 'planning.submit_review.command.v1', organizationId: tenantId, planId: x.planId, ...x.review }),
  }),
  base('planning.review.decide', 'approve', 'planning.plans.manage', {
    effect: 'approval',
    validateInput: (x) => ({ planId: text(x?.planId, 'planId'), decision: text(x?.decision, 'decision'), reason: text(x?.reason, 'reason') }),
    buildCommand: (x, { tenantId }) => ({ type: 'planning.review_decision.command.v1', organizationId: tenantId, ...x }),
  }),
  base('documents.generate', 'requestGeneration', 'org.documents.create', {
    requiresIfMatch: false, timeoutMs: 3000,
    validateInput: (x) => ({ templateId: text(x?.templateId, 'templateId'), parameters: object(x?.parameters || {}, 'parameters'), visibility: x?.visibility === 'public' ? 'public' : 'private' }),
    buildCommand: (x, { tenantId }) => ({ type: 'documents.request_generation.command.v1', organizationId: tenantId, ...x }),
  }),
]);

module.exports = { POLICY_VERSION, planningWriteTools };
