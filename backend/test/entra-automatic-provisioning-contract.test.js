'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { createEntraProvisioningHarness, etag } = require('../identity-federation/entraAutomaticProvisioningService')

function seeded() {
  const h = createEntraProvisioningHarness()
  h.connection({ id: 'conn-a', organizationId: 'org-a', issuerTenantId: 'entra-a', secretVersion: 's1' })
  h.connection({ id: 'conn-b', organizationId: 'org-b', issuerTenantId: 'entra-b', secretVersion: 's1' })
  return { h, tokenA: h.issueToken({ organizationId: 'org-a', connectionId: 'conn-a', issuerTenantId: 'entra-a' }), tokenB: h.issueToken({ organizationId: 'org-b', connectionId: 'conn-b', issuerTenantId: 'entra-b' }) }
}

test('Microsoft Entra discovery and bearer connectivity advertise SCIM user and group support', () => {
  const { h, tokenA } = seeded()
  assert.deepEqual(h.discover({ connectionId: 'conn-a', token: tokenA }).Resources, ['User', 'Group'])
  assert.deepEqual(h.testConnectivity({ connectionId: 'conn-a', token: tokenA }), { ok: true, auth: 'bearer' })
})

test('Microsoft Entra user lifecycle covers create, query, update, deprovision and reactivate', async () => {
  const { h, tokenA } = seeded()
  const created = await h.createUser({ connectionId: 'conn-a', token: tokenA, externalId: 'aad-user-1', userName: 'ada@example.edu', idempotencyKey: 'u1' })
  assert.equal(created.etag, etag(1))
  assert.equal(h.queryUsers({ connectionId: 'conn-a', token: tokenA, filter: 'userName eq "ada@example.edu"' }).totalResults, 1)
  const updated = await h.patchUser({ connectionId: 'conn-a', token: tokenA, userId: created.user.id, ifMatch: created.etag, operations: [{ path: 'displayName', value: 'Ada Lovelace' }], idempotencyKey: 'u1-update' })
  assert.equal(updated.user.displayName, 'Ada Lovelace')
  const off = await h.patchUser({ connectionId: 'conn-a', token: tokenA, userId: created.user.id, ifMatch: updated.etag, operations: [{ path: 'active', value: false }], idempotencyKey: 'u1-off' })
  assert.equal(off.user.active, false)
  const on = await h.patchUser({ connectionId: 'conn-a', token: tokenA, userId: created.user.id, ifMatch: off.etag, operations: [{ path: 'active', value: true }], idempotencyKey: 'u1-on' })
  assert.equal(on.user.active, true)
  assert.deepEqual(h.histories, [{ userId: created.user.id, action: 'deprovisioned', externalId: 'aad-user-1' }])
})

test('Microsoft Entra group lifecycle and membership add/remove are isolated to one connection', async () => {
  const { h, tokenA } = seeded()
  const user = (await h.createUser({ connectionId: 'conn-a', token: tokenA, externalId: 'aad-user-1', userName: 'ada@example.edu' })).user
  const group = h.createGroup({ connectionId: 'conn-a', token: tokenA, externalId: 'aad-group-1', displayName: 'Teachers' }).group
  assert.equal(h.updateGroup({ connectionId: 'conn-a', token: tokenA, groupId: group.id, displayName: 'Faculty' }).group.displayName, 'Faculty')
  assert.deepEqual(h.addMember({ connectionId: 'conn-a', token: tokenA, groupId: group.id, userId: user.id }), { added: true })
  assert.equal(h.memberships.has(`${group.id}:${user.id}`), true)
  assert.deepEqual(h.removeMember({ connectionId: 'conn-a', token: tokenA, groupId: group.id, userId: user.id }), { removed: true })
  assert.equal(h.memberships.size, 0)
  assert.deepEqual(h.deleteGroup({ connectionId: 'conn-a', token: tokenA, groupId: group.id }), { deleted: true })
})

test('Microsoft Entra pagination returns stable total and windows without tenant bleed', async () => {
  const { h, tokenA, tokenB } = seeded()
  for (let i = 0; i < 5; i++) await h.createUser({ connectionId: 'conn-a', token: tokenA, externalId: `a-${i}`, userName: `a${i}@example.edu` })
  await h.createUser({ connectionId: 'conn-b', token: tokenB, externalId: 'b-1', userName: 'b@example.edu' })
  const page = h.queryUsers({ connectionId: 'conn-a', token: tokenA, startIndex: 2, count: 2 })
  assert.equal(page.totalResults, 5)
  assert.deepEqual(page.Resources.map((u) => u.userName), ['a1@example.edu', 'a2@example.edu'])
})

test('retry with one transient failure reuses the idempotency key and does not duplicate effects', async () => {
  const h = createEntraProvisioningHarness({ retryFailures: 1 })
  h.connection({ id: 'conn-a', organizationId: 'org-a', issuerTenantId: 'entra-a' })
  const tokenA = h.issueToken({ organizationId: 'org-a', connectionId: 'conn-a', issuerTenantId: 'entra-a' })
  await assert.rejects(() => h.createUser({ connectionId: 'conn-a', token: tokenA, externalId: 'aad-user-1', userName: 'ada@example.edu', idempotencyKey: 'retry-u1' }), /transient_retryable/)
  const firstSuccess = await h.createUser({ connectionId: 'conn-a', token: tokenA, externalId: 'aad-user-1', userName: 'ada@example.edu', idempotencyKey: 'retry-u1' })
  const replay = await h.createUser({ connectionId: 'conn-a', token: tokenA, externalId: 'aad-user-1', userName: 'ada@example.edu', idempotencyKey: 'retry-u1' })
  assert.equal(firstSuccess.idempotent, false)
  assert.equal(replay.idempotent, true)
  assert.equal(h.users.size, 1)
})

test('security rejects cross-connection substitution and organization A token against connection B', async () => {
  const { h, tokenA, tokenB } = seeded()
  const user = (await h.createUser({ connectionId: 'conn-a', token: tokenA, externalId: 'u1', userName: 'u1@example.edu' })).user
  const group = h.createGroup({ connectionId: 'conn-b', token: tokenB, externalId: 'g1', displayName: 'Readers' }).group
  assert.throws(() => h.testConnectivity({ connectionId: 'conn-b', token: tokenA }), /connection_token_mismatch/)
  assert.throws(() => h.addMember({ connectionId: 'conn-b', token: tokenB, groupId: group.id, userId: user.id }), /cross_connection_substitution/)
})

test('security rejects malformed filters, nested PATCH payloads, duplicate user key races and stale ETags', async () => {
  const { h, tokenA } = seeded()
  const user = (await h.createUser({ connectionId: 'conn-a', token: tokenA, externalId: 'u1', userName: 'u1@example.edu' })).user
  assert.throws(() => h.queryUsers({ connectionId: 'conn-a', token: tokenA, filter: 'userName co "u1"' }), /malformed_filter/)
  assert.throws(() => h.patchUser({ connectionId: 'conn-a', token: tokenA, userId: user.id, operations: [{ path: 'name', value: { givenName: 'Ada' } }] }), /nested_patch_payload_forbidden/)
  await assert.rejects(() => h.createUser({ connectionId: 'conn-a', token: tokenA, externalId: 'u1', userName: 'other@example.edu', idempotencyKey: 'duplicate-race' }), /duplicate_user_key_race/)
  await assert.rejects(() => h.patchUser({ connectionId: 'conn-a', token: tokenA, userId: user.id, ifMatch: etag(99), operations: [{ path: 'active', value: false }] }), /stale_etag/)
})

test('security enforces secret rotation, mass group removal guard, group-name escalation guard, payload limits and rate limits', async () => {
  const { h, tokenA } = seeded()
  h.rotateSecret('conn-a', 's2')
  assert.throws(() => h.testConnectivity({ connectionId: 'conn-a', token: tokenA }), /secret_revoked/)
  const tokenA2 = h.issueToken({ organizationId: 'org-a', connectionId: 'conn-a', issuerTenantId: 'entra-a', secretVersion: 's2' })
  const group = h.createGroup({ connectionId: 'conn-a', token: tokenA2, externalId: 'g1', displayName: 'Teachers' }).group
  assert.throws(() => h.createGroup({ connectionId: 'conn-a', token: tokenA2, externalId: 'g2', displayName: 'owner_global' }), /crafted_group_name_role_escalation/)
  assert.throws(() => h.removeMember({ connectionId: 'conn-a', token: tokenA2, groupId: group.id, userId: 'u', expectedRemovals: 51 }), /mass_group_removal_requires_reconciliation/)
  assert.throws(() => h.createUser({ connectionId: 'conn-a', token: tokenA2, externalId: 'big', userName: 'big@example.edu', extra: 'x'.repeat(17000) }), /payload_too_large/)
  for (let i = 0; i < 20; i++) await h.createUser({ connectionId: 'conn-a', token: tokenA2, externalId: `rate-${i}`, userName: `rate-${i}@example.edu` })
  assert.throws(() => h.createUser({ connectionId: 'conn-a', token: tokenA2, externalId: 'rate-over', userName: 'rate-over@example.edu' }), /rate_limited/)
})

test('two-tenant reconciliation is idempotent and preserves deprovision history', async () => {
  const { h, tokenA, tokenB } = seeded()
  const a = (await h.createUser({ connectionId: 'conn-a', token: tokenA, externalId: 'same', userName: 'same@a.edu', idempotencyKey: 'same-a' })).user
  const b = (await h.createUser({ connectionId: 'conn-b', token: tokenB, externalId: 'same', userName: 'same@b.edu', idempotencyKey: 'same-b' })).user
  assert.notEqual(a.id, b.id)
  const off = await h.patchUser({ connectionId: 'conn-a', token: tokenA, userId: a.id, ifMatch: etag(1), operations: [{ path: 'active', value: false }], idempotencyKey: 'reconcile-off' })
  const replay = await h.patchUser({ connectionId: 'conn-a', token: tokenA, userId: a.id, ifMatch: etag(1), operations: [{ path: 'active', value: false }], idempotencyKey: 'reconcile-off' })
  assert.equal(off.idempotent, false)
  assert.equal(replay.idempotent, true)
  assert.equal(h.histories.length, 1)
  assert.equal(h.queryUsers({ connectionId: 'conn-b', token: tokenB, filter: 'externalId eq "same"' }).Resources[0].active, true)
})
