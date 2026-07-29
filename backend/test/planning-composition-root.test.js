'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createPlanningRuntime, REQUIRED_PLANNING_COMPOSITION_DEPENDENCIES } = require('../planning/composition/createPlanningRuntime');

function dependencies() {
  const query = async () => ({ rowCount: 0, rows: [] });
  const pool = { query, connect: async () => ({ query, release() {} }) };
  return {
    pool,
    authorizationContextPort: { validateDataScope: async () => ({ allowed: true }) },
    availabilityResolver: { resolve: async () => ({ executable: false }) },
    authorizationProviders: {},
    authorizationResourceResolver: () => ({}),
    authenticationAudienceMiddleware: (_req, _res, next) => next(),
    organizationContextMiddleware: (_req, _res, next) => next(),
    canonicalPrincipalMiddleware: (_req, _res, next) => next(),
  };
}

for (const dependency of REQUIRED_PLANNING_COMPOSITION_DEPENDENCIES) {
  test(`planning composition refuses to mount without ${dependency}`, () => {
    const deps = dependencies();
    delete deps[dependency];
    assert.throws(() => createPlanningRuntime(deps), new RegExp(dependency));
  });
}

test('planning composition creates all six named application services', () => {
  const runtime = createPlanningRuntime(dependencies());
  for (const name of ['createPlan', 'listPlans', 'readPlan', 'updatePlan', 'readProfile', 'replaceProfile']) assert.equal(typeof runtime.services[name], 'function');
});
