'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createPlanningRouter } = require('../planning/presentation/routes');
const { schemas, validate } = require('../planning/presentation/requestSchemas');
const { createDataScopePolicyProvider } = require('../authorization/policies/providers');
const { createDefaultPolicyRegistry } = require('../authorization/policies');

function router() {
  const port = Object.fromEntries(['createPlan','listPlans','readPlan','updatePlan','readProfile','replaceProfile'].map((name) => [name, async () => ({ ok:true, value:{} })]));
  return createPlanningRouter({ planningRemoteApplicationPort:port, availabilityResolver:{ async resolve(){ return { executable:false }; } }, authorizationProviders:{}, authorizationRegistry:createDefaultPolicyRegistry(), authorizationResourceResolver:()=>({}), preAuthorizationMiddleware:[(_req,_res,next)=>next()] });
}

test('Planning gateway mounts exactly the canonical six-operation slice', () => {
  const routes = router().stack.filter((layer) => layer.route).map((layer) => `${Object.keys(layer.route.methods)[0].toUpperCase()} ${layer.route.path}`).sort();
  assert.deepEqual(routes, [
    'GET /o/:organizationId/planning/plans',
    'GET /o/:organizationId/planning/plans/:planId',
    'GET /o/:organizationId/planning/profile',
    'PATCH /o/:organizationId/planning/plans/:planId',
    'POST /o/:organizationId/planning/plans',
    'PUT /o/:organizationId/planning/profile',
  ]);
  assert.equal(routes.some((route) => route.includes('production-handoffs')), false);
});

test('executable request schemas require plan type and write headers', () => {
  assert.deepEqual(validate(schemas.createPlan, { title:'Plan' }).map((error) => error.field), ['planType']);
  assert.equal(validate(schemas.createPlan, { title:'Plan', planType:'curriculum' }).length, 0);
  assert.deepEqual(validate(schemas.idempotencyHeaders, {}).map((error) => error.field), ['idempotency-key']);
  assert.deepEqual(validate(schemas.concurrencyHeaders, {}).map((error) => error.field), ['if-match']);
});

test('canonical data-scope provider delegates principal role paths to the evaluator', async () => {
  let received;
  const provider = createDataScopePolicyProvider({ evaluator:{ async evaluate(input){ received=input; return { allowed:true, constraint:{ kind:'organization' } }; } } });
  const result = await provider.evaluate({ organizationId:'org-1', principal:{ subject:'user-1' }, rolePaths:[{ rolePathId:'path-1' }], permission:'planning.plans.read', capability:'planning.plans' });
  assert.equal(result.status, 'valid'); assert.equal(result.strategy, 'organization');
  assert.deepEqual(received.principal.rolePaths, [{ rolePathId:'path-1' }]);
});
