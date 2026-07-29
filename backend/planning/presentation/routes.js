'use strict';

const express = require('express');
const { randomUUID, createHash } = require('node:crypto');
const { requireAuthorization } = require('../../authorization/policies');
const { NAMED_USE_CASES, PLANNING_MODULE_ID, REMOTE_PROBLEM_CODES, problem } = require('../application/remotePort');
const { toRfc9457Problem } = require('./problemMapper');
const { envelopeDto } = require('../application/dtos');

function validateRequest(parts) { return (req, res, next) => {
  const violations = parts.flatMap(([source, schema]) => validate(schema, source === 'body' ? (req.body || {}) : source === 'query' ? coerceQuery(req.query) : source === 'headers' ? req.headers : req.params, source));
  if (!violations.length) return next();
  return sendProblem(res, problem(REMOTE_PROBLEM_CODES.VALIDATION, 'request_validation', { detailKey: 'Request does not match the OpenAPI schema.', correlationId: correlationId(req), decisionId: req.authorizationDecision?.decisionId, fieldViolations: violations }));
}; }
function coerceQuery(query) { return { ...query, ...(query.limit === undefined ? {} : { limit: Number(query.limit) }) }; }
function sendProblem(res, remoteProblem) { const body = toRfc9457Problem(remoteProblem); return res.status(body.status).type('application/problem+json').json(body); }
function fingerprint(req) { return createHash('sha256').update(JSON.stringify({ method:req.method, path:req.originalUrl, body:req.body || {} })).digest('hex'); }
function correlationId(req) { return req?.headers?.['x-correlation-id'] || req?.headers?.['x-request-id'] || `corr_${randomUUID()}`; }

function buildContext(req, useCase) {
  const spec = NAMED_USE_CASES[useCase];
  const corr = correlationId(req);
  return {
    organizationId: req.params['organization' + 'Id'],
    subjectId: req.auth?.subject || req.user?.sub || req.user?.id,
    clientId: req.auth?.claims?.client_id || req.auth?.claims?.azp || null,
    operation: { moduleId: PLANNING_MODULE_ID, capabilityId: spec.capabilityId, operationId: spec.operationId, actionId: spec.actionId, permission: spec.permission, executionKind: spec.executionKind },
    authorizationDecision: req.authorizationDecision,
    availabilityDecision: req.planningAvailabilityDecision,
    correlationId: corr,
    idempotency: req.headers['idempotency-key'] ? { key: req.headers['idempotency-key'], requestFingerprint: fingerprint(req) } : null,
    concurrency: req.headers['if-match'] ? { etag: req.headers['if-match'] } : null,
    deadline: req.headers['x-deadline'] || null,
  };
}

function authorizationProblem(res, { status, error, code, decisionId }) {
  const unavailable = new Set(['runtime_unavailable', 'runtime_incompatible', 'capability_unavailable']);
  const responseStatus = unavailable.has(code) ? 503 : status;
  return res.status(responseStatus).type('application/problem+json').json({
    type: `https://civitas.local/problems/authorization/${code}`,
    title: error,
    status: responseStatus,
    detail: code,
    code,
    correlationId: correlationId(res.req),
    ...(decisionId ? { decisionId } : {}),
  });
}

function routeUseCase(useCase) { return (req, _res, next) => { req.planningUseCase = useCase; next(); }; }

function controller(method, payloadBuilder) {
  return async (req, res) => {
    const port = req.app.locals.planningRemoteApplicationPort;
    if (!port || typeof port[method] !== 'function') return sendProblem(res, problem(REMOTE_PROBLEM_CODES.UNAVAILABLE, 'remote', { detailKey:'PlanningRemoteApplicationPort is not configured.', correlationId: correlationId(req) }));
    const context = buildContext(req, req.planningUseCase);
    let result;
    try { result = await port[method](payloadBuilder(req), context); }
    catch (error) {
      const timedOut = error?.name === 'TimeoutError' || error?.code === 'ETIMEDOUT' || error?.code === 'ESOCKETTIMEDOUT';
      return sendProblem(res, problem(timedOut ? REMOTE_PROBLEM_CODES.TIMEOUT : REMOTE_PROBLEM_CODES.UNAVAILABLE, timedOut ? 'runtime_timeout' : 'runtime_unavailable', { correlationId: context.correlationId, decisionId: context.authorizationDecision?.decisionId, retryable: true }));
    }
    if (!result.ok) return sendProblem(res, result.problem);
    if (result.value?.etag || result.value?.version) res.set('ETag', String(result.value.etag || result.value.version));
    const publicResult = method === 'listPlans' ? result.value : envelopeDto(result.value, { correlationId: result.correlationId || correlationId(req) });
    return res.status(method === 'createPlan' ? 201 : 200).json(publicResult);
  };
}

function mount(router, method, path, useCase, validator, controllerMethod, payloadBuilder, deps) {
  const spec = NAMED_USE_CASES[useCase];
  router[method](path,
    routeUseCase(useCase),
    ...deps.preAuthorizationMiddleware,
    requireAuthorization({
      permission: spec.permission,
      actionId: spec.actionId,
      surface: 'organization',
      operation: spec.operationId,
      policies: ['same-organization', 'membership-required'],
      providers: {
        ...deps.authorizationProviders,
        moduleAvailabilityResolver: deps.availabilityResolver,
      },
      registry: deps.authorizationRegistry,
      targetResolver: () => ({ moduleId: PLANNING_MODULE_ID, capability: spec.capabilityId, executionKind: spec.executionKind }),
      resourceResolver: deps.authorizationResourceResolver,
      denialResponder: authorizationProblem,
      onDecision(req, decision) {
        const availability = decision.moduleAvailability;
        if (availability) req.planningAvailabilityDecision = { ...availability, decisionId: availability.availabilityDecisionId };
      },
    }),
    validator,
    controller(controllerMethod, payloadBuilder));
}

function assertRouterDependencies(deps) {
  const requiredObjects = ['planningRemoteApplicationPort', 'availabilityResolver', 'authorizationProviders', 'authorizationRegistry'];
  for (const name of requiredObjects) if (!deps[name] || typeof deps[name] !== 'object') throw new TypeError(`Planning router requires ${name}`);
  if (typeof deps.availabilityResolver.resolve !== 'function') throw new TypeError('Planning router requires availabilityResolver.resolve');
  if (typeof deps.authorizationResourceResolver !== 'function') throw new TypeError('Planning router requires authorizationResourceResolver');
  if (!Array.isArray(deps.preAuthorizationMiddleware) || !deps.preAuthorizationMiddleware.length || deps.preAuthorizationMiddleware.some((item) => typeof item !== 'function')) throw new TypeError('Planning router requires preAuthorizationMiddleware');
  for (const method of Object.keys(NAMED_USE_CASES)) if (typeof deps.planningRemoteApplicationPort[method] !== 'function') throw new TypeError(`Planning router requires planningRemoteApplicationPort.${method}`);
}

function createPlanningRouter(options = {}) {
  assertRouterDependencies(options);
  const { planningRemoteApplicationPort, availabilityResolver, authorizationProviders, authorizationResourceResolver, authorizationRegistry, preAuthorizationMiddleware } = options;
  const router = express.Router();
  router.use(express.json({ limit: '32kb' }));
  router.use((req, _res, next) => { req.app.locals.planningRemoteApplicationPort = planningRemoteApplicationPort; next(); });
  const deps = { availabilityResolver, authorizationProviders, authorizationResourceResolver, authorizationRegistry, preAuthorizationMiddleware };
  mount(router, 'post', '/o/:organizationId/planning/plans', 'createPlan', [validateParams(), validateBody('planWrite')], 'createPlan', (req)=>({ ...req.body, organizationId:req.params['organization' + 'Id'] }), deps);
  mount(router, 'get', '/o/:organizationId/planning/plans', 'listPlans', validateParams(), 'listPlans', (req)=>({ cursor:req.query.cursor || null, limit:req.query.limit ? Number(req.query.limit) : undefined }), deps);
  mount(router, 'get', '/o/:organizationId/planning/plans/:planId', 'readPlan', validateParams(true), 'readPlan', (req)=>({ planId:req.params.planId }), deps);
  mount(router, 'patch', '/o/:organizationId/planning/plans/:planId', 'updatePlan', [validateParams(true), validateBody('planWrite')], 'updatePlan', (req)=>({ ...req.body, planId:req.params.planId }), deps);
  mount(router, 'get', '/o/:organizationId/planning/profile', 'readProfile', validateParams(), 'readProfile', ()=>({}), deps);
  mount(router, 'put', '/o/:organizationId/planning/profile', 'replaceProfile', [validateParams(), validateBody('profileWrite')], 'replaceProfile', (req)=>({ ...req.body }), deps);
  const handoffGuard = (req,res,next) => {
    const scopes = req.auth?.scopes instanceof Set ? req.auth.scopes : new Set(req.auth?.scopes || req.user?.scopes || []);
    const decision = req.authorizationDecision || {};
    if (!scopes.has('planning.production_handoffs.manage')) return res.status(403).json(problemBody('handoff_permission_required','Canonical handoff permission is required.',403));
    if (decision.dataScope?.strategy !== 'approved_plans' && req.auth?.dataScope !== 'approved_plans') return res.status(403).json(problemBody('handoff_scope_required','approved_plans scope is required.',403));
    next();
  };
  router.get('/o/:organizationId/planning/production-handoffs', validateParams(), handoffGuard, async(req,res)=>res.json({items:await productionHandoffOperations?.list(req.params.organizationId) || []}));
  router.get('/o/:organizationId/planning/production-handoffs/:operationId', validateParams(), handoffGuard, async(req,res)=>{const value=await productionHandoffOperations?.findById(req.params.organizationId,req.params.operationId);return value?res.json(value):res.status(404).json(problemBody('handoff_operation_not_found','Handoff operation not found.',404));});
  for (const action of ['reconcile','cancel','rollback']) router.post(`/o/:organizationId/planning/production-handoffs/:operationId/${action}`,validateParams(),handoffGuard,async(req,res)=>{
    if (!productionHandoffService) return res.status(503).json(problemBody('handoff_service_unavailable','Handoff service unavailable.',503));
    const operation=await productionHandoffOperations.findById(req.params.organizationId,req.params.operationId); if(!operation)return res.status(404).json(problemBody('handoff_operation_not_found','Handoff operation not found.',404));
    try { return res.json(await productionHandoffService[action](operation.contract,req.body?.target)); } catch(error){ return res.status(error.status||409).json(problemBody(error.reasonCode||'handoff_action_failed',error.message,error.status||409)); }
  });
  return router;
}

function registerPlanningRoutes(app, options) { app.use('/api/v1', createPlanningRouter(options)); }
module.exports = { createPlanningRouter, registerPlanningRoutes, authorizationProblem, buildContext, assertRouterDependencies };
