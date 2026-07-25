'use strict';

const express = require('express');
const { randomUUID, createHash } = require('node:crypto');
const { requireOrganizationAccess } = require('../../middleware/auth');
const { requireOrg } = require('../../middleware/requireOrg');
const { requireAuthorization } = require('../../authorization/policies');
const { NAMED_USE_CASES, PLANNING_MODULE_ID, REMOTE_PROBLEM_CODES, problem } = require('../application/remotePort');
const { toRfc9457Problem } = require('./problemMapper');
const { permissionsByName } = require('../../../core/authz');

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH']);

function activePermission(permission) {
  return (req, res, next) => {
    const definition = permissionsByName[permission];
    if (!definition || definition.status !== 'active') {
      const decisionId = `authz_${randomUUID()}`;
      return res.status(403).json({ error: 'Forbidden', code: 'permission_not_active', requiredPermission: permission, decisionId });
    }
    const scopes = req.auth?.scopes instanceof Set ? req.auth.scopes : new Set(req.user?.scopes || []);
    if (!scopes.has(permission)) {
      const decisionId = `authz_${randomUUID()}`;
      return res.status(403).json({ error: 'Forbidden', code: 'permission_missing', requiredPermission: permission, decisionId });
    }
    return next();
  };
}

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

function availabilityGuard({ availabilityResolver }) {
  return async (req, res, next) => {
    if (!availabilityResolver) return sendProblem(res, problem(REMOTE_PROBLEM_CODES.UNAVAILABLE, 'availability', { detailKey:'Planning module availability resolver is not configured.', correlationId: correlationId(req) }));
    const useCase = req.planningUseCase;
    const spec = NAMED_USE_CASES[useCase];
    const decision = await availabilityResolver.resolve({ organizationId:req.params['organization' + 'Id'], moduleId:PLANNING_MODULE_ID, capabilityId:spec.capabilityId, operationId:spec.operationId, executionKind:spec.executionKind });
    req.planningAvailabilityDecision = decision;
    if (decision.executable) return next();
    return sendProblem(res, problem(REMOTE_PROBLEM_CODES.UNAVAILABLE, 'availability', { detailKey: decision.reasonCode, decisionId: decision.decisionId, correlationId: correlationId(req), retryable: decision.state !== 'unavailable' }));
  };
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
    requireOrganizationAccess({ requiredAllScopes: [spec.permission] }),
    requireOrg,
    availabilityGuard(deps),
    activePermission(spec.permission),
    requireAuthorization({ permission: spec.permission, actionId: spec.actionId, surface: 'organization', operation: spec.executionKind, policies: ['same-organization', 'membership-required'] }),
    validator,
    controller(controllerMethod, payloadBuilder));
}

function createPlanningRouter({ planningRemoteApplicationPort, availabilityResolver } = {}) {
  const router = express.Router();
  router.use(express.json({ limit: '32kb' }));
  router.use((req, _res, next) => { if (planningRemoteApplicationPort) req.app.locals.planningRemoteApplicationPort = planningRemoteApplicationPort; next(); });
  mount(router, 'post', '/o/:organizationId/planning/plans', 'createPlan', [validateParams(), validateBody('planWrite')], 'createPlan', (req)=>({ ...req.body, organizationId:req.params['organization' + 'Id'] }), { availabilityResolver });
  mount(router, 'get', '/o/:organizationId/planning/plans', 'listPlans', validateParams(), 'listPlans', (req)=>({ cursor:req.query.cursor || null, limit:req.query.limit ? Number(req.query.limit) : undefined }), { availabilityResolver });
  mount(router, 'get', '/o/:organizationId/planning/plans/:planId', 'getPlan', validateParams(true), 'getPlan', (req)=>({ planId:req.params.planId }), { availabilityResolver });
  mount(router, 'patch', '/o/:organizationId/planning/plans/:planId', 'updatePlan', [validateParams(true), validateBody('planWrite')], 'updatePlan', (req)=>({ ...req.body, planId:req.params.planId }), { availabilityResolver });
  mount(router, 'put', '/o/:organizationId/planning/plans/:planId', 'updatePlan', [validateParams(true), validateBody('planWrite')], 'updatePlan', (req)=>({ ...req.body, planId:req.params.planId }), { availabilityResolver });
  mount(router, 'get', '/o/:organizationId/planning/profile', 'getProfile', validateParams(), 'getProfile', ()=>({}), { availabilityResolver });
  mount(router, 'put', '/o/:organizationId/planning/profile', 'replaceProfile', [validateParams(), validateBody('profileWrite')], 'replaceProfile', (req)=>({ ...req.body }), { availabilityResolver });
  return router;
}

function registerPlanningRoutes(app, options) { app.use('/api/v1', createPlanningRouter(options)); }
module.exports = { createPlanningRouter, registerPlanningRoutes, activePermission, buildContext };
