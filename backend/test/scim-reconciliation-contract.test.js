'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const express = require('express')
const { createSecurityPolicyRegistry } = require('../middleware/securityPolicies')
const { planScimReconciliation, ACTIONS } = require('../scim/reconciliation/planner')
const { createScimReconciliationService, InMemoryScimReconciliationRepository } = require('../scim/reconciliation/service')
const { registerScimReconciliationRoutes } = require('../routes/scimReconciliationRoutes')

const desiredState = { users: [{ externalId: 'e1', email: 'ada@example.test', active: true, organizationIds: ['org-a'], managedRoles: ['organization_member'] }] }
const civitasState = { userLinks: [{ externalId: 'e1', logtoUserId: 'u1', source: 'scim' }] }
const convergedLogtoState = { users: [{ id: 'u1', email: 'ada@example.test', active: true }], organizationMemberships: [{ organizationId: 'org-a', userId: 'u1' }], managedRoles: [{ organizationId: 'org-a', userId: 'u1', name: 'organization_member' }] }

function types(plan) { return plan.actions.map((a) => a.type) }

test('SCIM reconciliation emits create, link, lifecycle, membership, role, ceiling, approval, and noop actions', () => {
  const missing = planScimReconciliation({ desiredState, civitasState: {}, logtoState: { users: [], organizationMemberships: [], managedRoles: [] } })
  assert(types(missing).includes(ACTIONS.CREATE_USER))
  const link = planScimReconciliation({ desiredState, civitasState: {}, logtoState: { ...convergedLogtoState, organizationMemberships: [], managedRoles: [] } })
  assert(types(link).includes(ACTIONS.LINK_USER))
  const inactive = planScimReconciliation({ desiredState, civitasState, logtoState: { ...convergedLogtoState, users: [{ id: 'u1', email: 'ada@example.test', active: false }], organizationMemberships: [], managedRoles: [] } })
  assert(types(inactive).includes(ACTIONS.ACTIVATE_USER))
  assert(types(inactive).includes(ACTIONS.ADD_ORGANIZATION_MEMBERSHIP))
  assert(types(inactive).includes(ACTIONS.ADD_MANAGED_ROLE))
  const blocked = planScimReconciliation({ desiredState, civitasState, logtoState: convergedLogtoState, policy: { allowedManagedRoles: ['organization_admin'] } })
  assert(types(blocked).includes(ACTIONS.BLOCK_BY_CEILING))
  const removalApproval = planScimReconciliation({ desiredState: { users: [{ ...desiredState.users[0], active: false, managedRoles: [] }] }, civitasState, logtoState: convergedLogtoState })
  assert(types(removalApproval).includes(ACTIONS.REQUIRE_APPROVAL))
  const noop = planScimReconciliation({ desiredState, civitasState, logtoState: convergedLogtoState })
  assert.deepEqual(types(noop), [ACTIONS.NOOP])
})

test('executable runs are idempotent by idempotency key and converged dry-run has no mutation', async () => {
  const calls = []
  const repository = new InMemoryScimReconciliationRepository({ desiredState, civitasState, logtoState: { users: [{ id: 'u1', email: 'ada@example.test', active: true }], organizationMemberships: [], managedRoles: [] }, policy: {} })
  const service = createScimReconciliationService({ repository, logtoClient: { addUserToLogtoOrganization: async (input) => calls.push(['membership.add', input]), assignOrganizationRoleToUser: async (input) => calls.push(['role.add', input]) } })
  const first = await service.execute({ organizationId: 'org-a', idempotencyKey: 'run-1', body: {}, actorId: 'tester' })
  const second = await service.execute({ organizationId: 'org-a', idempotencyKey: 'run-1', body: {}, actorId: 'tester' })
  assert.equal(first, second)
  assert.equal(calls.length, 2)
  const converged = createScimReconciliationService({ repository: new InMemoryScimReconciliationRepository({ desiredState, civitasState, logtoState: convergedLogtoState }) })
  assert.equal((await converged.dryRun({ organizationId: 'org-a' })).summary.mutationCount, 0)
})

function fakeGlobalAccess({ requiredScopes }) { return (req, _res, next) => { req.user = { id: 'owner', globalRoles: ['owner_global'], scopes: requiredScopes }; next() } }
function fakeOrgAccess({ requiredAllScopes }) { return (req, _res, next) => { req.user = { id: 'tenant-user', organizationId: req.params.organizationId, organizationRoles: ['organization_admin', 'organization_member'], scopes: requiredAllScopes }; next() } }
function fakeRole(role) { return (req, res, next) => req.user.organizationRoles?.includes(role) ? next() : res.status(403).json({ error: 'role_missing' }) }
function fakePermission(permission) { return (req, res, next) => req.user.scopes?.includes(permission) ? next() : res.status(403).json({ error: 'permission_missing' }) }
async function request(app, method, path, { headers = {}, body } = {}) { const server = app.listen(0); await new Promise((resolve) => server.once('listening', resolve)); const port = server.address().port; return await new Promise((resolve, reject) => { const payload = body ? JSON.stringify(body) : undefined; const req = http.request({ port, method, path, headers: { ...headers, ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}) } }, (res) => { let data = ''; res.on('data', (c) => { data += c }); res.on('end', () => { server.close(); resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }) }) }); req.on('error', (e) => { server.close(); reject(e) }); if (payload) req.write(payload); req.end() }) }

test('SCIM reconciliation REST resources expose dry-run plans and executable runs', async () => {
  const app = express(); app.use(express.json())
  const service = createScimReconciliationService({ repository: new InMemoryScimReconciliationRepository({ desiredState, civitasState, logtoState: convergedLogtoState }) })
  registerScimReconciliationRoutes({ secureRoute: createSecurityPolicyRegistry({ app }), requireSafeOrganizationIdParam: (_req, _res, next) => next(), requireGlobalAccess: fakeGlobalAccess, requireGlobalOwner: (_req, _res, next) => next(), requireOrganizationAccess: fakeOrgAccess, requireOrg: (req, _res, next) => { req.org = { id: req.params.organizationId }; next() }, requireOrganizationRole: fakeRole, requirePermission: fakePermission, sharedAuth: { organization: { roles: { member: 'organization_member', admin: 'organization_admin' } } }, apiResource: 'api', service })
  assert.equal((await request(app, 'POST', '/api/v1/o/org-a/scim/reconciliation/plans')).body.actions[0].type, ACTIONS.NOOP)
  assert.equal((await request(app, 'POST', '/api/v1/o/org-a/scim/reconciliation/runs')).status, 400)
  const run = await request(app, 'POST', '/api/v1/o/org-a/scim/reconciliation/runs', { headers: { 'Idempotency-Key': 'run-route-1' } })
  assert.equal(run.status, 202)
  assert.equal((await request(app, 'GET', '/api/v1/o/org-a/scim/reconciliation/runs/run-route-1')).body.id, 'run-route-1')
})
