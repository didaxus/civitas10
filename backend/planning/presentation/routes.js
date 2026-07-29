'use strict';

const express = require('express');
const { randomUUID, createHash } = require('node:crypto');
const { requireAuthorization } = require('../../authorization/policies');
const { NAMED_USE_CASES, PLANNING_MODULE_ID, REMOTE_PROBLEM_CODES, problem } = require('../application/remotePort');
const { toRfc9457Problem } = require('./problemMapper');

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH']);

function validateParams(requiredPlanId = false) {
  return (req, res, next) => {
    if (!ID_PATTERN.test(req.params['organization' + 'Id'] || '')) return res.status(400).json(problemBody('organization_id_invalid', 'Invalid organization identifier.'));
    if (requiredPlanId && !ID_PATTERN.test(req.params.planId || '')) return res.status(400).json(problemBody('plan_id_invalid', 'Invalid plan identifier.'));
    return next();
  };
}

function validateBody(kind) {
  return (req, res, next) => {
    const body = req.body || {};
    if (kind === 'planWrite' && typeof body.title !== 'string') return res.status(422).json(problemBody('title_required', 'title must be a string.'));
    if (WRITE_METHODS.has(req.method) && !req.headers['idempotency-key']) return res.status(400).json(problemBody('idempotency_key_required', 'Idempotency-Key is required for planning writes.'));
    return next();
  };
}

function problemBody(code, detail, status = 400) { return { type: `https://civitas.local/problems/planning/request/${code}`, title: code, status, detail, code }; }
function sendProblem(res, remoteProblem) { const body = toRfc9457Problem(remoteProblem); return res.status(body.status).type('application/problem+json').json(body); }
function fingerprint(req) { return createHash('sha256').update(JSON.stringify({ method:req.method, path:req.originalUrl, body:req.body || {} })).digest('hex'); }
function correlationId(req) { return req.headers['x-correlation-id'] || req.headers['x-request-id'] || `corr_${randomUUID()}`; }

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
    ...(decisionId ? { decisionId } : {}),
  });
}

function routeUseCase(useCase) { return (req, _res, next) => { req.planningUseCase = useCase; next(); }; }

function controller(method, payloadBuilder) {
  return async (req, res) => {
    const port = req.app.locals.planningRemoteApplicationPort;
    if (!port || typeof port[method] !== 'function') return sendProblem(res, problem(REMOTE_PROBLEM_CODES.UNAVAILABLE, 'remote', { detailKey:'PlanningRemoteApplicationPort is not configured.', correlationId: correlationId(req) }));
    const result = await port[method](payloadBuilder(req), buildContext(req, req.planningUseCase));
    if (!result.ok) return sendProblem(res, result.problem);
    if (result.value?.etag || result.value?.version) res.set('ETag', String(result.value.etag || result.value.version));
    return res.status(method === 'createPlan' ? 201 : 200).json(result.value);
  };
}

function mount(router, method, path, useCase, validator, controllerMethod, payloadBuilder, deps) {
  const spec = NAMED_USE_CASES[useCase];
  router[method](path,
    routeUseCase(useCase),
    requireAuthorization({
      permission: spec.permission,
      actionId: spec.actionId,
      surface: 'organization',
      operation: spec.operationId,
      policies: ['same-organization', 'membership-required'],
      providers: {
        ...deps.authorizationProviders,
        moduleAvailabilityResolver: deps.availabilityResolver || { async resolve() { return { executable: false, state: 'unavailable', reasonCode: 'runtime_unavailable' }; } },
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

function createPlanningRouter({ planningRemoteApplicationPort, availabilityResolver, authorizationProviders, authorizationResourceResolver, authorizationRegistry } = {}) {
  const router = express.Router();
  router.use(express.json({ limit: '32kb' }));
  router.use((req, _res, next) => { if (planningRemoteApplicationPort) req.app.locals.planningRemoteApplicationPort = planningRemoteApplicationPort; next(); });
  const deps = { availabilityResolver, authorizationProviders, authorizationResourceResolver, authorizationRegistry };
  mount(router, 'post', '/o/:organizationId/planning/plans', 'createPlan', [validateParams(), validateBody('planWrite')], 'createPlan', (req)=>({ ...req.body, organizationId:req.params['organization' + 'Id'] }), deps);
  mount(router, 'get', '/o/:organizationId/planning/plans', 'listPlans', validateParams(), 'listPlans', (req)=>({ cursor:req.query.cursor || null, limit:req.query.limit ? Number(req.query.limit) : undefined }), deps);
  mount(router, 'get', '/o/:organizationId/planning/plans/:planId', 'getPlan', validateParams(true), 'getPlan', (req)=>({ planId:req.params.planId }), deps);
  mount(router, 'patch', '/o/:organizationId/planning/plans/:planId', 'updatePlan', [validateParams(true), validateBody('planWrite')], 'updatePlan', (req)=>({ ...req.body, planId:req.params.planId }), deps);
  mount(router, 'put', '/o/:organizationId/planning/plans/:planId', 'updatePlan', [validateParams(true), validateBody('planWrite')], 'updatePlan', (req)=>({ ...req.body, planId:req.params.planId }), deps);
  mount(router, 'get', '/o/:organizationId/planning/profile', 'getProfile', validateParams(), 'getProfile', ()=>({}), deps);
  mount(router, 'put', '/o/:organizationId/planning/profile', 'replaceProfile', [validateParams(), validateBody('profileWrite')], 'replaceProfile', (req)=>({ ...req.body }), deps);
  return router;
}

function registerPlanningRoutes(app, options = {}) {
  app.use('/api/v1', createPlanningRouter(options));
  if (options.authoringService) {
    const { createPlanningAuthoringRouter } = require('./authoringRoutes');
    app.use('/api/v1/o/:organizationId/planning', createPlanningAuthoringRouter(options.authoringService));
  }
}
module.exports = { createPlanningRouter, registerPlanningRoutes, authorizationProblem, buildContext };
