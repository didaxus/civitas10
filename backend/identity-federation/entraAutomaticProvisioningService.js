'use strict'

const crypto = require('crypto')

const MAX_PAYLOAD_BYTES = 16 * 1024
const RATE_LIMIT = 20
const RESERVED_ROLE_NAMES = new Set(['owner_global', 'platform_admin', 'organization_admin'])

function id(prefix, material) { return `${prefix}_${crypto.createHash('sha256').update(String(material)).digest('base64url').slice(0, 12)}` }
function etag(v) { return `W/"${Number(v)}"` }
function err(code, status = 400) { const e = new Error(code); e.code = code; e.status = status; return e }
function bytes(payload) { return Buffer.byteLength(JSON.stringify(payload || {})) }
function assertPayload(payload) { if (bytes(payload) > MAX_PAYLOAD_BYTES) throw err('payload_too_large', 413) }
function assertToken(connection, token) {
  if (!token || token.type !== 'Bearer') throw err('bearer_token_required', 401)
  if (token.organizationId !== connection.organizationId || token.connectionId !== connection.id || token.issuerTenantId !== connection.issuerTenantId) throw err('connection_token_mismatch', 403)
  if (connection.revokedSecrets.has(token.secretVersion) || token.secretVersion !== connection.activeSecretVersion) throw err('secret_revoked', 401)
}
function parseFilter(filter) {
  if (!filter) return null
  const match = String(filter).match(/^\s*(userName|externalId|displayName)\s+eq\s+"([^"\\]*(?:\\.[^"\\]*)*)"\s*$/)
  if (!match) throw err('malformed_filter')
  return { field: match[1], value: match[2].replace(/\\"/g, '"') }
}
function assertFlatPatch(operations) {
  for (const op of operations || []) {
    if (!Array.isArray(op.path) && typeof op.path !== 'string') throw err('patch_path_required')
    if (typeof op.value === 'object' && op.value && !Array.isArray(op.value)) throw err('nested_patch_payload_forbidden')
  }
}
function assertSafeGroupName(displayName) {
  if (RESERVED_ROLE_NAMES.has(String(displayName || '').trim().toLowerCase()) || /^role[:_]/i.test(String(displayName || ''))) throw err('crafted_group_name_role_escalation')
}

function createEntraProvisioningHarness({ retryFailures = 0 } = {}) {
  let now = 0
  let failures = retryFailures
  const calls = []
  const connections = new Map()
  const users = new Map()
  const groups = new Map()
  const memberships = new Set()
  const histories = []
  const seen = new Map()
  const bucket = new Map()
  function connection(input) {
    const row = { id: input.id, organizationId: input.organizationId, issuerTenantId: input.issuerTenantId, activeSecretVersion: input.secretVersion || 's1', revokedSecrets: new Set(input.revokedSecrets || []), discovered: false }
    connections.set(row.id, row)
    return row
  }
  function authorized(connectionId, token) { const c = connections.get(connectionId); if (!c) throw err('connection_not_found', 404); assertToken(c, token); return c }
  function checkRate(c) { const k = `${c.organizationId}:${c.id}`; const n = (bucket.get(k) || 0) + 1; bucket.set(k, n); if (n > RATE_LIMIT) throw err('rate_limited', 429) }
  async function once(key, effect) {
    if (seen.has(key)) return { ...seen.get(key), idempotent: true }
    if (failures-- > 0) throw err('transient_retryable', 503)
    const result = await effect(); seen.set(key, result); return { ...result, idempotent: false }
  }
  return {
    calls, connections, users, groups, memberships, histories,
    issueToken({ organizationId, connectionId, issuerTenantId, secretVersion = 's1' }) { return { type: 'Bearer', organizationId, connectionId, issuerTenantId, secretVersion } },
    rotateSecret(connectionId, version) { const c = connections.get(connectionId); c.revokedSecrets.add(c.activeSecretVersion); c.activeSecretVersion = version },
    connection,
    discover({ connectionId, token }) { const c = authorized(connectionId, token); c.discovered = true; return { Resources: ['User', 'Group'], authenticationSchemes: [{ type: 'oauthbearertoken' }] } },
    testConnectivity({ connectionId, token }) { authorized(connectionId, token); return { ok: true, auth: 'bearer' } },
    createUser(input) { assertPayload(input); const c = authorized(input.connectionId, input.token); checkRate(c); return once(input.idempotencyKey || `create:${input.connectionId}:${input.externalId}`, () => { if ([...users.values()].some(u => u.organizationId === c.organizationId && u.connectionId === c.id && (u.externalId === input.externalId || u.userName === input.userName))) throw err('duplicate_user_key_race', 409); const u = { id: id('usr', `${c.id}:${input.externalId}`), organizationId: c.organizationId, connectionId: c.id, externalId: input.externalId, userName: input.userName, active: input.active !== false, version: 1 }; users.set(u.id, u); return { user: { ...u }, etag: etag(u.version) } }) },
    queryUsers({ connectionId, token, filter, startIndex = 1, count = 100 }) { const c = authorized(connectionId, token); const f = parseFilter(filter); let list = [...users.values()].filter(u => u.organizationId === c.organizationId && u.connectionId === c.id); if (f) list = list.filter(u => u[f.field] === f.value); const start = Math.max(0, Number(startIndex) - 1); return { totalResults: list.length, startIndex, itemsPerPage: count, Resources: list.slice(start, start + count).map(u => ({ ...u })) } },
    patchUser({ connectionId, token, userId, ifMatch, operations, idempotencyKey }) { assertFlatPatch(operations); const c = authorized(connectionId, token); return once(idempotencyKey || `patch:${userId}:${JSON.stringify(operations)}`, () => { const u = users.get(userId); if (!u || u.connectionId !== c.id || u.organizationId !== c.organizationId) throw err('user_not_found', 404); if (ifMatch && ifMatch !== etag(u.version)) throw err('stale_etag', 412); for (const op of operations) { const path = String(op.path); if (path === 'active' && u.active && op.value === false) histories.push({ userId, action: 'deprovisioned', externalId: u.externalId }); u[path] = op.value } u.version += 1; return { user: { ...u }, etag: etag(u.version) } }) },
    createGroup(input) { assertPayload(input); assertSafeGroupName(input.displayName); const c = authorized(input.connectionId, input.token); const g = { id: id('grp', `${c.id}:${input.externalId}`), organizationId: c.organizationId, connectionId: c.id, externalId: input.externalId, displayName: input.displayName, version: 1 }; groups.set(g.id, g); return { group: { ...g }, etag: etag(g.version) } },
    updateGroup({ connectionId, token, groupId, displayName }) { assertSafeGroupName(displayName); const c = authorized(connectionId, token); const g = groups.get(groupId); if (!g || g.connectionId !== c.id) throw err('group_not_found', 404); g.displayName = displayName; g.version += 1; return { group: { ...g }, etag: etag(g.version) } },
    deleteGroup({ connectionId, token, groupId }) { const c = authorized(connectionId, token); const g = groups.get(groupId); if (!g || g.connectionId !== c.id) throw err('group_not_found', 404); groups.delete(groupId); for (const k of [...memberships]) if (k.startsWith(`${g.id}:`)) memberships.delete(k); return { deleted: true } },
    addMember({ connectionId, token, groupId, userId }) { const c = authorized(connectionId, token); if (!groups.get(groupId) || !users.get(userId) || groups.get(groupId).connectionId !== c.id || users.get(userId).connectionId !== c.id) throw err('cross_connection_substitution', 403); memberships.add(`${groupId}:${userId}`); return { added: true } },
    removeMember({ connectionId, token, groupId, userId, expectedRemovals = 1 }) { const c = authorized(connectionId, token); if (expectedRemovals > 50) throw err('mass_group_removal_requires_reconciliation', 409); if (!groups.get(groupId) || groups.get(groupId).connectionId !== c.id) throw err('group_not_found', 404); memberships.delete(`${groupId}:${userId}`); return { removed: true } },
  }
}
module.exports = { createEntraProvisioningHarness, etag }
