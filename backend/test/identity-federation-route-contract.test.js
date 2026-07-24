'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const express = require('express')
const { createSecurityPolicyRegistry } = require('../middleware/securityPolicies')
const { registerIdentityFederationRoutes } = require('../routes/identityFederationRoutes')
const { createIdentityFederationService, createInMemoryIdentityFederationRepository, strongEtag } = require('../services/identityFederation')

const roles = { organization: { roles: { member: 'organization_member', admin: 'organization_admin' } } }
function fakeGlobalAccess({ requiredScopes }) { return (req, res, next) => { req.user = { id: 'owner', globalRoles: ['owner_global'], scopes: req.headers['x-scopes']?.split(' ') || requiredScopes }; next() } }
function fakeOrgAccess({ requiredAllScopes }) { return (req, res, next) => { req.user = { id: 'tenant-user', organizationId: req.headers['x-auth-org'] || req.params.organizationId, organizationRoles: [req.headers['x-org-role'] || 'organization_admin', 'organization_member'], scopes: req.headers['x-scopes']?.split(' ') || requiredAllScopes }; next() } }
function fakeRole(role) { return (req, res, next) => req.user.organizationRoles?.includes(role) ? next() : res.status(403).json({ error: 'role_missing' }) }
function fakePermission(permission) { return (req, res, next) => req.user.scopes?.includes(permission) ? next() : res.status(403).json({ error: 'Forbidden', code: 'permission_missing', requiredPermission: permission }) }
function safeOrg(_req, _res, next) { next() }
function requireOrg(req, _res, next) { req.org = { id: req.params.organizationId, logto_organization_id: req.params.organizationId }; next() }

async function request(app, method, path, { headers = {}, body } = {}) {
  const server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  const port = server.address().port
  return await new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined
    const req = http.request({ port, method, path, headers: { ...headers, ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}) } }, (res) => {
      let data = ''
      res.on('data', (c) => { data += c })
      res.on('end', () => { server.close(); resolve({ status: res.statusCode, headers: res.headers, body: data ? JSON.parse(data) : null }) })
    })
    req.on('error', (e) => { server.close(); reject(e) })
    if (payload) req.write(payload)
    req.end()
  })
}

function makeApp() {
  const repository = createInMemoryIdentityFederationRepository([
    { id: 'saml-a', organizationId: 'tenant-a', name: 'SAML A', version: 3, status: 'draft', protocol: 'scim', kind: 'scim' },
    { id: 'saml-b', organizationId: 'tenant-b', name: 'SAML B', version: 5, status: 'draft', protocol: 'scim', kind: 'scim' },
  ])
  const app = express()
  registerIdentityFederationRoutes({ secureRoute: createSecurityPolicyRegistry({ app }), requireSafeOrganizationIdParam: safeOrg, requireGlobalAccess: fakeGlobalAccess, requireGlobalOwner: (_req, _res, next) => next(), requireOrganizationAccess: fakeOrgAccess, requireOrg, requireOrganizationRole: fakeRole, requirePermission: fakePermission, sharedAuth: roles, apiResource: 'https://civitas.didaxus.com/api', service: createIdentityFederationService({ repository }) })
  return app
}

test('identity federation routes are canonical and serve two isolated tenants with ETags', async () => {
  const app = makeApp()
  const a = await request(app, 'GET', '/api/v1/o/tenant-a/identity/federation/providers/saml-a')
  assert.equal(a.status, 200)
  assert.equal(a.headers.etag, strongEtag(3))
  const b = await request(app, 'GET', '/api/v1/owner/organizations/tenant-b/identity/federation/providers/saml-b')
  assert.equal(b.status, 200)
  assert.equal(b.headers.etag, strongEtag(5))
  const routes = app._router.stack.flatMap((l) => l.route ? Object.keys(l.route.methods).map((m) => `${m.toUpperCase()} ${l.route.path}`) : [])
  assert(routes.some((r) => r.includes('/api/v1/owner/organizations/:organizationId/identity/federation/providers')))
  assert(routes.some((r) => r.includes('/api/v1/o/:organizationId/identity/federation/providers')))
  assert(!routes.some((r) => /\/activate|\/sync|\/remove/.test(r)))
})

test('tenant path, auth context, and records cannot cross tenants', async () => {
  assert.equal((await request(makeApp(), 'GET', '/api/v1/o/tenant-a/identity/federation/providers/saml-a', { headers: { 'x-auth-org': 'tenant-b' } })).status, 403)
  assert.equal((await request(makeApp(), 'GET', '/api/v1/o/tenant-a/identity/federation/providers/saml-b')).status, 404)
})

test('mutating process routes require Idempotency-Key', async () => {
  const res = await request(makeApp(), 'POST', '/api/v1/o/tenant-a/identity/federation/providers/saml-a/state-decisions', { headers: { 'If-Match': strongEtag(3) }, body: { decision: 'enabled' } })
  assert.equal(res.status, 400)
  assert.equal(res.body.header, 'Idempotency-Key')
})

test('versioned updates and activation decisions reject stale If-Match', async () => {
  const stale = await request(makeApp(), 'POST', '/api/v1/o/tenant-a/identity/federation/providers/saml-a/state-decisions', { headers: { 'If-Match': strongEtag(2), 'Idempotency-Key': 'k1' }, body: { decision: 'enabled' } })
  assert.equal(stale.status, 412)
  assert.equal(stale.headers.etag, strongEtag(3))
})

test('canonical permission denial uses permission middleware', async () => {
  const denied = await request(makeApp(), 'GET', '/api/v1/o/tenant-a/identity/federation/providers', { headers: { 'x-scopes': 'org.documents.create' } })
  assert.equal(denied.status, 403)
  assert.equal(denied.body.requiredPermission, 'org.documents.read')
})

test('SCIM REST v1 management routes enforce tenant context and connection ownership', async () => {
  const app = makeApp()
  const routes = app._router.stack.flatMap((l) => l.route ? Object.keys(l.route.methods).map((m) => `${m.toUpperCase()} ${l.route.path}`) : [])
  for (const route of [
    'GET /api/v1/owner/organizations/:organizationId/scim/connections',
    'POST /api/v1/owner/organizations/:organizationId/scim/connections',
    'POST /api/v1/owner/organizations/:organizationId/scim/connections/:connectionId/credentials',
    'GET /api/v1/o/:organizationId/scim/connections/:connectionId',
    'PUT /api/v1/o/:organizationId/scim/connections/:connectionId',
    'POST /api/v1/o/:organizationId/scim/connections/:connectionId/reconciliation-plans',
    'GET /api/v1/o/:organizationId/scim/connections/:connectionId/reconciliation-plans',
    'POST /api/v1/o/:organizationId/scim/connections/:connectionId/reconciliation-runs',
    'GET /api/v1/o/:organizationId/scim/connections/:connectionId/reconciliation-runs',
  ]) assert(routes.includes(route), route)

  const connection = await request(app, 'GET', '/api/v1/o/tenant-a/scim/connections/saml-a')
  assert.equal(connection.status, 200)
  assert.equal(connection.body.connection.organizationId, 'tenant-a')
  assert.equal((await request(app, 'GET', '/api/v1/o/tenant-a/scim/connections/saml-a', { headers: { 'x-auth-org': 'tenant-b' } })).status, 403)
  assert.equal((await request(app, 'GET', '/api/v1/o/tenant-a/scim/connections/saml-b')).status, 404)
})

test('SCIM credentials and reconciliation process routes require Idempotency-Key', async () => {
  const app = makeApp()
  assert.equal((await request(app, 'POST', '/api/v1/owner/organizations/tenant-a/scim/connections/saml-a/credentials', { body: { bearerToken: 'secret' } })).status, 400)
  assert.equal((await request(app, 'POST', '/api/v1/o/tenant-a/scim/connections/saml-a/reconciliation-plans', { body: { changes: [] } })).status, 400)
  assert.equal((await request(app, 'POST', '/api/v1/o/tenant-a/scim/connections/saml-a/reconciliation-runs', { body: {} })).status, 400)
})
