'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const http = require('node:http')
const { createSecurityPolicyRegistry } = require('../middleware/securityPolicies')
const { createInMemoryScimGroupRepository, createScimGroupService, registerScimGroupRoutes } = require('../scim/groups')

async function request(app, method, path, body) {
  const server = app.listen(0); await new Promise((r) => server.once('listening', r)); const port = server.address().port
  return await new Promise((resolve, reject) => { const payload = body ? JSON.stringify(body) : undefined; const req = http.request({ port, method, path, headers: payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {} }, (res) => { let data=''; res.on('data', (c)=>data+=c); res.on('end',()=>{ server.close(); resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }) }) }); req.on('error',(e)=>{server.close(); reject(e)}); if (payload) req.write(payload); req.end() })
}
function appWith(service) { const app = express(); registerScimGroupRoutes({ secureRoute: createSecurityPolicyRegistry({ app }), service }); return app }

test('SCIM Groups CRUD persists external directory objects without canonical roles', async () => {
  const app = appWith(createScimGroupService({ repository: createInMemoryScimGroupRepository() }))
  const created = await request(app, 'POST', '/scim/v2/connections/conn-a/Groups', { externalId: 'math', displayName: 'Math' })
  assert.equal(created.status, 201)
  assert.equal(created.body.externalId, 'math')
  const id = created.body.id
  assert.equal((await request(app, 'GET', `/scim/v2/connections/conn-a/Groups/${id}`)).body.displayName, 'Math')
  assert.equal((await request(app, 'GET', '/scim/v2/connections/conn-a/Groups?filter=externalId%20eq%20%22math%22')).body.totalResults, 1)
  assert.equal((await request(app, 'PUT', `/scim/v2/connections/conn-a/Groups/${id}`, { externalId: 'math', displayName: 'Mathematics' })).body.displayName, 'Mathematics')
  assert.equal((await request(app, 'DELETE', `/scim/v2/connections/conn-a/Groups/${id}`)).status, 204)
  assert.equal((await request(app, 'GET', `/scim/v2/connections/conn-a/Groups/${id}`)).status, 404)
})

test('SCIM Group membership add remove replace accepts members[].value only in same connection', async () => {
  const app = appWith(createScimGroupService({ repository: createInMemoryScimGroupRepository() }))
  const a = await request(app, 'POST', '/scim/v2/connections/conn-a/Groups', { externalId: 'a', displayName: 'A' })
  const b = await request(app, 'POST', '/scim/v2/connections/conn-b/Groups', { externalId: 'b', displayName: 'B' })
  const addCross = await request(app, 'PATCH', `/scim/v2/connections/conn-a/Groups/${a.body.id}`, { Operations: [{ op: 'add', path: 'members', value: [{ value: b.body.id }] }] })
  assert.equal(addCross.status, 400)
  const c = await request(app, 'POST', '/scim/v2/connections/conn-a/Groups', { externalId: 'c', displayName: 'C' })
  const add = await request(app, 'PATCH', `/scim/v2/connections/conn-a/Groups/${a.body.id}`, { Operations: [{ op: 'add', path: 'members', value: [{ value: c.body.id, display: 'ignored' }] }] })
  assert.deepEqual(add.body.members, [{ value: c.body.id }])
  const remove = await request(app, 'PATCH', `/scim/v2/connections/conn-a/Groups/${a.body.id}`, { Operations: [{ op: 'remove', path: 'members', value: [{ value: c.body.id }] }] })
  assert.deepEqual(remove.body.members, [])
})

test('SCIM Group delete blocks mass deprovision and removes only SCIM provenance when safe', async () => {
  const repository = createInMemoryScimGroupRepository()
  const service = createScimGroupService({ repository })
  const group = await service.createGroup({ connectionId: 'conn-a', body: { externalId: 'staff', displayName: 'Staff' } })
  repository.provenance.set('conn-a:staff', Array.from({ length: 51 }, (_, i) => ({ id: `p${i}`, sourceKind: 'directory_sync_scim' })))
  await assert.rejects(() => service.deleteGroup({ connectionId: 'conn-a', groupId: group.id }), /mass_deprovision_check_required/)
  repository.provenance.set('conn-a:staff', [{ id: 'p1', sourceKind: 'directory_sync_scim' }])
  const deleted = await service.deleteGroup({ connectionId: 'conn-a', groupId: group.id })
  assert.equal(deleted.removedProvenanceCount, 1)
  assert.deepEqual(repository.provenance.get('conn-a:staff'), undefined)
})
