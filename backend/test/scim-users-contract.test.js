'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const express = require('express')
const { createSecurityPolicyRegistry } = require('../middleware/securityPolicies')
const { registerScimUserRoutes } = require('../scim/users/routes')
const { createScimUserService, InMemoryScimUserRepository, ENTERPRISE_USER_SCHEMA } = require('../scim/users/service')

async function request(app, method, path, { headers = {}, body } = {}) {
  const server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  const payload = body ? JSON.stringify(body) : undefined
  return await new Promise((resolve, reject) => {
    const req = http.request({ port: server.address().port, method, path, headers: { ...headers, ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}) } }, (res) => {
      let data = ''
      res.on('data', (c) => { data += c })
      res.on('end', () => { server.close(); resolve({ status: res.statusCode, headers: res.headers, body: data ? JSON.parse(data) : null }) })
    })
    req.on('error', (e) => { server.close(); reject(e) })
    if (payload) req.write(payload)
    req.end()
  })
}
function app() { const a = express(); registerScimUserRoutes({ secureRoute: createSecurityPolicyRegistry({ app: a }), service: createScimUserService({ repository: new InMemoryScimUserRepository() }) }); return a }

test('SCIM Users CRUD supports attributes, ETags, list response, uniqueness, idempotency, and soft delete', async () => {
  const a = app()
  const body = { externalId: 'e-1', userName: 'Alice@Example.COM', active: true, name: { givenName: 'Alice', familyName: 'Doe' }, displayName: 'Alice Doe', emails: [{ value: 'alice@example.com', primary: true }], locale: 'en-US', timezone: 'UTC', preferredLanguage: 'en', [ENTERPRISE_USER_SCHEMA]: { department: 'Engineering', manager: { value: 'm-1' } } }
  const created = await request(a, 'POST', '/scim/v2/connections/00000000-0000-0000-0000-000000000001/Users', { headers: { 'Idempotency-Key': 'create-alice' }, body })
  assert.equal(created.status, 201)
  assert.equal(created.body.externalId, 'e-1')
  assert.equal(created.body.name.givenName, 'Alice')
  assert.equal(created.body[ENTERPRISE_USER_SCHEMA].department, 'Engineering')
  assert.equal(created.headers.etag, created.body.meta.version)
  const replay = await request(a, 'POST', '/scim/v2/connections/00000000-0000-0000-0000-000000000001/Users', { headers: { 'Idempotency-Key': 'create-alice' }, body: { ...body, userName: 'other' } })
  assert.equal(replay.body.id, created.body.id)
  const duplicate = await request(a, 'POST', '/scim/v2/connections/00000000-0000-0000-0000-000000000001/Users', { body: { userName: 'alice@example.com' } })
  assert.equal(duplicate.status, 409)
  assert.equal(duplicate.body.schemas[0], 'urn:ietf:params:scim:api:messages:2.0:Error')
  const listed = await request(a, 'GET', '/scim/v2/connections/00000000-0000-0000-0000-000000000001/Users')
  assert.equal(listed.body.totalResults, 1)
  const patched = await request(a, 'PATCH', `/scim/v2/connections/00000000-0000-0000-0000-000000000001/Users/${created.body.id}`, { headers: { 'If-Match': created.headers.etag }, body: { Operations: [{ op: 'replace', path: 'active', value: false }] } })
  assert.equal(patched.status, 200)
  assert.equal(patched.body.active, false)
  const stale = await request(a, 'PUT', `/scim/v2/connections/00000000-0000-0000-0000-000000000001/Users/${created.body.id}`, { headers: { 'If-Match': created.headers.etag }, body: { userName: 'alice2@example.com' } })
  assert.equal(stale.status, 412)
  assert.equal(stale.headers.etag, patched.headers.etag)
  const deleted = await request(a, 'DELETE', `/scim/v2/connections/00000000-0000-0000-0000-000000000001/Users/${created.body.id}`, { headers: { 'If-Match': patched.headers.etag } })
  assert.equal(deleted.status, 204)
  const afterDelete = await request(a, 'GET', `/scim/v2/connections/00000000-0000-0000-0000-000000000001/Users/${created.body.id}`)
  assert.equal(afterDelete.body.active, false)
})
