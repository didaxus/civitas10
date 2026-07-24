'use strict'

const crypto = require('crypto')

const SCIM_USER_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:User'
const ENTERPRISE_USER_SCHEMA = 'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User'
const ERROR_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:Error'
const LIST_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:ListResponse'

function nowIso() { return new Date().toISOString() }
function normalized(value) { return String(value || '').trim().toLocaleLowerCase('en-US') }
function etag(version) { return `W/"scim-user:${Number(version || 0)}"` }
function scimError(status, detail, scimType) { const e = new Error(detail); e.status = status; e.scimType = scimType; return e }
function errorBody(error) { return { schemas: [ERROR_SCHEMA], status: String(error.status || 500), detail: error.message || 'SCIM request failed', ...(error.scimType ? { scimType: error.scimType } : {}) } }
function stableId(connectionId, material) { return crypto.createHash('sha256').update(`${connectionId}:${material}:${Date.now()}:${Math.random()}`).digest('hex').slice(0, 32) }
function clone(v) { return JSON.parse(JSON.stringify(v)) }

function canonicalize(input, { existing, connectionId }) {
  const body = input && typeof input === 'object' ? input : {}
  const userName = body.userName ?? existing?.userName
  if (!userName || !String(userName).trim()) throw scimError(400, 'userName is required', 'invalidValue')
  const version = Number(existing?.version || 0) + 1
  const id = existing?.id || body.id || stableId(connectionId, body.externalId || userName)
  const created = existing?.meta?.created || nowIso()
  const lastModified = nowIso()
  const extension = body[ENTERPRISE_USER_SCHEMA] || existing?.[ENTERPRISE_USER_SCHEMA] || undefined
  return {
    schemas: Array.from(new Set([SCIM_USER_SCHEMA, ...(extension ? [ENTERPRISE_USER_SCHEMA] : []), ...(Array.isArray(body.schemas) ? body.schemas.filter((s) => s !== SCIM_USER_SCHEMA && s !== ENTERPRISE_USER_SCHEMA) : [])])),
    id,
    ...(body.externalId !== undefined || existing?.externalId !== undefined ? { externalId: body.externalId ?? existing.externalId } : {}),
    userName: String(userName),
    active: body.active !== undefined ? Boolean(body.active) : existing?.active !== undefined ? Boolean(existing.active) : true,
    ...(body.name !== undefined || existing?.name !== undefined ? { name: { ...(existing?.name || {}), ...(body.name || {}) } } : {}),
    ...(body.displayName !== undefined || existing?.displayName !== undefined ? { displayName: body.displayName ?? existing.displayName } : {}),
    ...(body.emails !== undefined || existing?.emails !== undefined ? { emails: Array.isArray(body.emails) ? body.emails : (existing?.emails || []) } : {}),
    ...(body.locale !== undefined || existing?.locale !== undefined ? { locale: body.locale ?? existing.locale } : {}),
    ...(body.timezone !== undefined || existing?.timezone !== undefined ? { timezone: body.timezone ?? existing.timezone } : {}),
    ...(body.preferredLanguage !== undefined || existing?.preferredLanguage !== undefined ? { preferredLanguage: body.preferredLanguage ?? existing.preferredLanguage } : {}),
    ...(extension ? { [ENTERPRISE_USER_SCHEMA]: extension } : {}),
    meta: { resourceType: 'User', created, lastModified, version: etag(version), location: `/scim/v2/connections/${connectionId}/Users/${id}` },
    version,
    connectionId,
    normalizedUserName: normalized(userName),
    deleted: false,
  }
}

class InMemoryScimUserRepository {
  constructor(seed = []) { this.users = new Map(); this.ledger = new Map(); seed.forEach((u) => this.users.set(u.id, canonicalize(u, { connectionId: u.connectionId }))) }
  async findById(connectionId, id) { const u = this.users.get(id); return u && u.connectionId === connectionId ? clone(u) : null }
  async list(connectionId) { return [...this.users.values()].filter((u) => u.connectionId === connectionId && !u.deleted).map(clone) }
  async save(user) { this.assertUnique(user); this.users.set(user.id, clone(user)); return clone(user) }
  assertUnique(user) { for (const u of this.users.values()) if (u.connectionId === user.connectionId && u.id !== user.id && !u.deleted) { if (user.externalId && u.externalId === user.externalId) throw scimError(409, 'externalId already exists for this connection', 'uniqueness'); if (u.normalizedUserName === user.normalizedUserName) throw scimError(409, 'userName already exists for this connection', 'uniqueness') } }
  async idempotency(connectionId, key) { return this.ledger.get(`${connectionId}:${key}`) || null }
  async record(connectionId, key, result) { if (!key) return; this.ledger.set(`${connectionId}:${key}`, clone(result)) }
}

function applyPatch(user, body) {
  const next = clone(user)
  for (const op of body?.Operations || []) {
    const operation = String(op.op || '').toLowerCase()
    const path = op.path
    if (!['add', 'replace', 'remove'].includes(operation)) throw scimError(400, 'Unsupported PATCH operation', 'invalidSyntax')
    if (!path) {
      if (operation === 'remove') throw scimError(400, 'PATCH remove requires path', 'noTarget')
      Object.assign(next, op.value || {})
    } else if (operation === 'remove') delete next[path]
    else next[path] = op.value
  }
  return next
}

function createScimUserService({ repository = new InMemoryScimUserRepository() } = {}) {
  async function mutating(connectionId, key, fn) { if (key) { const prior = await repository.idempotency(connectionId, key); if (prior) return { ...prior, replayed: true } } const result = await fn(); if (key) await repository.record(connectionId, key, result); return result }
  return {
    async create({ connectionId, body, idempotencyKey }) { return mutating(connectionId, idempotencyKey, async () => ({ status: 201, user: await repository.save(canonicalize(body, { connectionId })) })) },
    async list({ connectionId, startIndex = 1, count = 100 }) { const all = await repository.list(connectionId); const start = Math.max(Number(startIndex) || 1, 1); const size = Math.min(Math.max(Number(count) || 100, 0), 200); return { schemas: [LIST_SCHEMA], totalResults: all.length, startIndex: start, itemsPerPage: Math.min(size, Math.max(all.length - start + 1, 0)), Resources: all.slice(start - 1, start - 1 + size).map(stripInternal) } },
    async get({ connectionId, userId }) { const user = await repository.findById(connectionId, userId); if (!user || user.deleted) throw scimError(404, 'User not found'); return stripInternal(user) },
    async put({ connectionId, userId, body, ifMatch, idempotencyKey }) { return mutating(connectionId, idempotencyKey, async () => { const current = await repository.findById(connectionId, userId); if (!current) throw scimError(404, 'User not found'); assertIfMatch(current, ifMatch); return { status: 200, user: await repository.save(canonicalize({ ...body, id: userId }, { existing: current, connectionId })) } }) },
    async patch({ connectionId, userId, body, ifMatch, idempotencyKey }) { return mutating(connectionId, idempotencyKey, async () => { const current = await repository.findById(connectionId, userId); if (!current) throw scimError(404, 'User not found'); assertIfMatch(current, ifMatch); return { status: 200, user: await repository.save(canonicalize(applyPatch(current, body), { existing: current, connectionId })) } }) },
    async delete({ connectionId, userId, ifMatch, idempotencyKey }) { return mutating(connectionId, idempotencyKey, async () => { const current = await repository.findById(connectionId, userId); if (!current) throw scimError(404, 'User not found'); assertIfMatch(current, ifMatch); await repository.save(canonicalize({ ...current, active: false }, { existing: current, connectionId })); return { status: 204 } }) },
  }
}
function assertIfMatch(user, value) { if (value && value !== user.meta.version && value !== '*') { const e = scimError(412, 'ETag precondition failed'); e.currentEtag = user.meta.version; throw e } }
function stripInternal(user) { const { version, connectionId, normalizedUserName, deleted, ...scim } = user; return scim }

module.exports = { ENTERPRISE_USER_SCHEMA, ERROR_SCHEMA, InMemoryScimUserRepository, createScimUserService, errorBody, etag, scimError }
