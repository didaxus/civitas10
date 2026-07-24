'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const express = require('express')
const { createSecurityPolicyRegistry } = require('../middleware/securityPolicies')
const { GROUP_SCHEMA, USER_SCHEMA, registerScimRoutes } = require('../scim')

async function request(app, path) {
  const server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  const port = server.address().port
  return await new Promise((resolve, reject) => {
    const req = http.request({ port, method: 'GET', path }, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => { server.close(); resolve({ status: res.statusCode, headers: res.headers, body: data && res.headers['content-type']?.includes('application/json') ? JSON.parse(data) : data || null }) })
    })
    req.on('error', (error) => { server.close(); reject(error) })
    req.end()
  })
}

function makeApp(options) {
  const app = express()
  registerScimRoutes({ secureRoute: createSecurityPolicyRegistry({ app }), ...options })
  return app
}

test('SCIM ServiceProviderConfig publishes provider-neutral capability support', async () => {
  const res = await request(makeApp({ filterMaxResults: 321 }), '/scim/v2/connections/tenant-a/ServiceProviderConfig')
  assert.equal(res.status, 200)
  assert.deepEqual(res.body.schemas, ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'])
  assert.deepEqual(res.body.patch, { supported: true })
  assert.deepEqual(res.body.filter, { supported: true, maxResults: 321 })
  assert.deepEqual(res.body.etag, { supported: true })
  assert.deepEqual(res.body.sort, { supported: false })
  assert.equal(res.body.bulk.supported, false)
  assert.equal(res.body.meta.resourceType, 'ServiceProviderConfig')
})

test('SCIM discovery returns RFC-shaped schemas and resource types without administrative resources', async () => {
  const app = makeApp()
  const resourceTypes = await request(app, '/scim/v2/connections/tenant-a/ResourceTypes')
  assert.equal(resourceTypes.status, 200)
  assert.equal(resourceTypes.body.schemas[0], 'urn:ietf:params:scim:api:messages:2.0:ListResponse')
  assert.deepEqual(resourceTypes.body.Resources.map((resource) => resource.id).sort(), ['Group', 'User'])
  assert(!resourceTypes.body.Resources.some((resource) => /admin/i.test(`${resource.name} ${resource.endpoint} ${resource.description}`)))

  const schemas = await request(app, '/scim/v2/connections/tenant-a/Schemas')
  assert.equal(schemas.status, 200)
  assert.equal(schemas.body.totalResults, 2)
  assert.deepEqual(schemas.body.Resources.map((schema) => schema.id).sort(), [GROUP_SCHEMA, USER_SCHEMA].sort())
  assert(schemas.body.Resources.every((schema) => schema.schemas.includes('urn:ietf:params:scim:schemas:core:2.0:Schema')))
})

test('SCIM discovery is scoped under the connection route and rejects unsafe connection ids', async () => {
  assert.equal((await request(makeApp(), '/scim/v2/ServiceProviderConfig')).status, 404)
  const invalid = await request(makeApp(), '/scim/v2/connections/%2E%2E/ServiceProviderConfig')
  assert.equal(invalid.status, 400)
  const missing = await request(makeApp(), '/scim/v2/connections/tenant-a/ResourceTypes/Admin')
  assert.equal(missing.status, 404)
})
