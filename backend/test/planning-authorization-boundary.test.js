'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createPlanningRouter, authorizationProblem } = require('../planning/presentation/routes');
const { toRfc9457Problem } = require('../planning/presentation/problemMapper');
const { problem, REMOTE_PROBLEM_CODES } = require('../planning/application/remotePort');
const { requireAuthorization } = require('../authorization/policies');
const { AUTHZ_CONTRACT_VERSION, MEMBERSHIP_CLAIM, ROLES_CLAIM, CONTRACT_CLAIM } = require('../authorization/principalBuilder');

const ORG = 'org_A';
const PERMISSION = 'planning.plans.read';

function auth(overrides = {}) {
  const now = new Date();
  const claims = {
    iss: 'https://issuer.example/oidc', sub: 'user_A', aud: ['https://civitas.didaxus.com/api'],
    iat: Math.floor(now.getTime() / 1000) - 1, exp: Math.floor(now.getTime() / 1000) + 300,
    organization_id: ORG, scope: PERMISSION, authz_snapshot_version: 3,
    [MEMBERSHIP_CLAIM]: 'membership_A', [ROLES_CLAIM]: ['organization_admin'], [CONTRACT_CLAIM]: AUTHZ_CONTRACT_VERSION,
    ...(overrides.claims || {}),
  };
  for (const claim of overrides.removeClaims || []) delete claims[claim];
  return {
    tokenValidated: overrides.tokenValidated !== false,
    claims,
    trustedMembershipBinding: {
      serverTrusted: true, membershipBindingId: 'membership_A', subject: 'user_A', organizationId: ORG,
      membershipState: 'active', snapshotVersion: 3, bindingRecordVersion: 'binding-v1',
      rolePotentialVersion: 'role-potential-v1', checkedAt: now.toISOString(),
      roleAssignments: [{ state: 'active', logtoRoleId: 'organization_admin', canonicalRoleId: 'organization_admin', rolePathId: 'path_A', fragments: [{ surface: 'rest', permissions: [PERMISSION], fragmentId: 'fragment_A', version: 'v1' }] }],
      ...(overrides.binding || {}),
    },
  };
}

async function requestPlanning(authContext, organizationId = ORG) {
  let remoteCalls = 0;
  let availabilityCalls = 0;
  const app = express();
  app.use((req, _res, next) => { req.auth = authContext; next(); });
  app.use(createPlanningRouter({
    planningRemoteApplicationPort: { listPlans: async () => { remoteCalls += 1; return { ok: true, value: [] }; } },
    availabilityResolver: { resolve: async () => { availabilityCalls += 1; return { executable: true, decisionId: 'availability_A', state: 'available' }; } },
  }));
  const server = app.listen(0);
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/o/${organizationId}/planning/plans`);
    return { response, body: await response.json(), remoteCalls, availabilityCalls };
  } finally { await new Promise((resolve) => server.close(resolve)); }
}

for (const [label, claim] of [
  ['organization_membership_id', MEMBERSHIP_CLAIM],
  ['organization_role_ids', ROLES_CLAIM],
  ['authz_contract_version', CONTRACT_CLAIM],
]) {
  test(`planning denies when required ${label} claim is absent and performs no remote call`, async () => {
    const result = await requestPlanning(auth({ removeClaims: [claim] }));
    assert.equal(result.response.status, 403);
    assert.match(result.response.headers.get('content-type'), /^application\/problem\+json/);
    assert.equal(result.remoteCalls, 0);
  });
}

test('planning rejects an invalid principal with 401 and does not consult availability or remote runtime', async () => {
  const result = await requestPlanning(auth({ tokenValidated: false }));
  assert.equal(result.response.status, 401);
  assert.equal(result.body.code, 'token_not_validated');
  assert.equal(result.availabilityCalls, 0);
  assert.equal(result.remoteCalls, 0);
});

test('planning rejects a cross-organization route before availability and remote execution', async () => {
  const result = await requestPlanning(auth(), 'org_B');
  assert.equal(result.response.status, 403);
  assert.equal(result.body.code, 'organization_mismatch');
  assert.equal(result.availabilityCalls, 0);
  assert.equal(result.remoteCalls, 0);
});

test('planned planning permission is denied by the shared PBAC catalog and never calls availability or remote runtime', async () => {
  const result = await requestPlanning(auth());
  assert.equal(result.response.status, 403);
  assert.equal(result.body.code, 'permission_inactive');
  assert.equal(result.availabilityCalls, 0);
  assert.equal(result.remoteCalls, 0);
});

function responseDouble() {
  return { statusCode: 0, body: null, status(code) { this.statusCode = code; return this; }, type() { return this; }, json(body) { this.body = body; return this; } };
}

async function activePermissionDecision({ scope = 'org.documents.read', dataScopeAllowed = true } = {}) {
  const context = auth({ claims: { scope }, binding: { roleAssignments: [{ state: 'active', logtoRoleId: 'organization_admin', canonicalRoleId: 'organization_admin', rolePathId: 'path_A', fragments: [{ surface: 'rest', permissions: ['org.documents.read'], fragmentId: 'fragment_A', version: 'v1' }] }] } });
  const req = { auth: context, params: { organizationId: ORG } };
  const res = responseDouble();
  let nextCalled = false;
  await requireAuthorization({ permission: 'org.documents.read', actionId: 'documents.read', surface: 'organization', operation: 'read', policies: ['same-organization', 'membership-required'], denialResponder: authorizationProblem, providers: {
    moduleAvailabilityResolver: { resolve: async () => ({ executable: true, decisionId: 'availability_A', state: 'available' }) },
    entitlementProvider: { evaluate: async ({ rolePaths }) => ({ allowed: true, matchedRolePathId: rolePaths[0].rolePathId, evaluatedRolePaths: [{ rolePathId: rolePaths[0].rolePathId, allowed: true }] }), evaluateSnapshot: async () => ({ status: 'current' }) },
    dataScopeProvider: { evaluate: async () => ({ allowed: dataScopeAllowed, status: dataScopeAllowed ? 'valid' : 'denied' }) },
  } })(req, res, () => { nextCalled = true; });
  return { res, nextCalled };
}

test('permission without token scope is denied before PBAC providers can grant access', async () => {
  const { res, nextCalled } = await activePermissionDecision({ scope: '' });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'permission_missing');
  assert.equal(nextCalled, false);
});

test('PBAC Data Scope denial restricts access and cannot grant it', async () => {
  const { res, nextCalled } = await activePermissionDecision({ dataScopeAllowed: false });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'resource_not_found_or_not_accessible');
  assert.equal(nextCalled, false);
});

test('RFC 9457 mapping covers authorization and remote 404/409/412/503/504 statuses', () => {
  for (const status of [401, 403]) {
    const res = responseDouble();
    authorizationProblem(res, { status, error: status === 401 ? 'Unauthorized' : 'Forbidden', code: 'denied' });
    assert.equal(res.statusCode, status);
    assert.equal(res.body.status, status);
  }
  for (const [code, status] of [
    [REMOTE_PROBLEM_CODES.NOT_FOUND, 404], [REMOTE_PROBLEM_CODES.CONFLICT, 409],
    [REMOTE_PROBLEM_CODES.PRECONDITION, 412], [REMOTE_PROBLEM_CODES.UNAVAILABLE, 503],
    [REMOTE_PROBLEM_CODES.TIMEOUT, 504],
  ]) assert.equal(toRfc9457Problem(problem(code, 'test')).status, status);
});
