'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createPlanningRouter } = require('../planning/presentation/routes');
const { createDefaultPolicyRegistry } = require('../authorization/policies');

test('auth, audience, organization and canonical principal exist before Planning authorization', async () => {
  const seen = [];
  const prerequisite = (name, assign) => (req, _res, next) => { assign(req); seen.push(name); next(); };
  const app = express();
  const remote = Object.fromEntries(['createPlan','listPlans','readPlan','updatePlan','readProfile','replaceProfile'].map((name) => [name, async () => ({ ok: true, value: [] })]));
  app.use(createPlanningRouter({ planningRemoteApplicationPort: remote,
    availabilityResolver: { async resolve() { throw new Error('authorization reached'); } },
    authorizationProviders: {}, authorizationRegistry: createDefaultPolicyRegistry(), authorizationResourceResolver(req) {
      assert.ok(req.auth); assert.ok(req.auth.audience); assert.ok(req.org); assert.ok(req.principal); seen.push('requireAuthorization'); return {};
    },
    preAuthorizationMiddleware: [
      prerequisite('authentication/audience', (req) => { req.auth = { audience: ['api'] }; req.user = { organizationId: 'org_A' }; }),
      prerequisite('organization', (req) => { req.org = { id: 'org_A' }; }),
      prerequisite('principal', (req) => { req.principal = { organizationId: 'org_A' }; }),
    ],
  }));
  const server = app.listen(0);
  try { await fetch(`http://127.0.0.1:${server.address().port}/o/org_A/planning/plans`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
  assert.deepEqual(seen, ['authentication/audience', 'organization', 'principal', 'requireAuthorization']);
});
