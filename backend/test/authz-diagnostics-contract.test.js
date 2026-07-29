const test = require('node:test');
const assert = require('node:assert/strict');
const { explainAuthorization } = require('../authorization/diagnostics');

test('authorization diagnostics explain token, scope, organization, policy, visual and runtime without secrets', async () => {
  const report = await explainAuthorization({
    surface: 'organization', organizationId: 'org-1', permission: 'lms.grades.read', policyVersion: 7, diagnosticPermissionGranted: true,
    principal: { subject: 'user-secret@example.test', tokenType: 'organization', organizationId: 'org-1', scopes: ['lms.grades.read'], organizationRoleIds: ['role_teacher'], audience: ['urn:civitas:api'], issuer: 'https://issuer/' },
    expected: { audience: 'urn:civitas:api', issuer: 'https://issuer/' },
    policies: [],
    decision: { allowed: true, decisionId: 'd1', permission: 'lms.grades.read', reasonCode: 'authorization_allowed', policyVersion: 7, evaluatedRolePaths: [{ rolePathId: 'rp1' }] },
    visual: { screen: { screenId: 'tenant.lms.grades', route: { routeId: 'tenant.lms.grades' }, organizationCustomization: { visibility: 'hideable' } }, action: { actionId: 'lms.grades.export' }, visualPreference: { hidden: false, responsiveRule: 'mobile-overflow', token: 'raw' }, featureFlag: { key: 'grades', enabled: true } },
    runtime: { cacheHit: true, policyVersion: 7, configVersion: 'cfg-2', outboxLagMs: 30, redisKey: 'civitas:authz:secret' },
    provenance: { entitlement: { roleMembership: { roleId: 'role_teacher' }, ownerCeiling: { allowed: true }, tenantActivation: { allowed: true }, reasonCodes: ['authorization_allowed'] }, dataScope: { strategy: 'assigned', assignmentIds: ['asg-1'], resourceOwnership: 'organization' }, taxonomy: { dimensionKey: 'academic.stage', dimensionValueId: 'primary' }, unit: { unitId: 'unit-1', relation: 'teaches' }, governance: { readModelVersion: 'rm-1' } }
  });
  assert.equal(report.diagnosticAllowed, true);
  assert.equal(report.token.subject.startsWith('sub_'), true);
  assert.equal(report.token.effectiveScopes.includes('lms.grades.read'), true);
  assert.equal(report.visual.screenId, 'tenant.lms.grades');
  assert.equal(report.runtime.cache.status, 'hit');
  assert.equal(report.provenance.scopeChain.dimensionKey, 'academic.stage');
  assert.equal(JSON.stringify(report).includes('user-secret@example.test'), false);
  assert.equal(JSON.stringify(report).includes('raw'), false);
  assert.equal(JSON.stringify(report).includes('redisKey'), false);
});

test('tenant admin cannot diagnose another organization', async () => {
  const report = await explainAuthorization({ surface: 'organization', organizationId: 'org-2', permission: 'lms.grades.read', principal: { subject: 'u1', tokenType: 'organization', organizationId: 'org-1', scopes: ['lms.grades.read'], organizationRoleIds: ['role_admin'] } });
  assert.equal(report.diagnosticAllowed, false);
  assert.equal(report.finalDecision.allowed, false);
  assert.equal(report.reasonCode, 'organization_route_mismatch');
});


test('diagnostics require an explicit diagnostic permission grant even for same-tenant requests', async () => {
  const report = await explainAuthorization({ surface: 'organization', organizationId: 'org-1', permission: 'lms.grades.read', principal: { subject: 'u1', tokenType: 'organization', organizationId: 'org-1', scopes: ['lms.grades.read'], organizationRoleIds: ['role_admin'] } });
  assert.equal(report.diagnosticAllowed, false);
  assert.equal(report.finalDecision.allowed, false);
});
