'use strict'

const crypto = require('crypto')

const CONTRACT_VERSION = '2026-07-civitas10-identity-federation-v1'

function strongEtag(version) { return `"identity-federation:${Number(version || 0)}"` }
function parseIfMatch(value) { return typeof value === 'string' ? value.trim() : '' }
function stableId(prefix, material) { return `${prefix}_${crypto.createHash('sha256').update(String(material)).digest('base64url').slice(0, 18)}` }

function createInMemoryIdentityFederationRepository(seed = []) {
  const providers = new Map()
  const processes = new Map()
  const plans = new Map()
  const runs = new Map()
  for (const row of seed) providers.set(row.id, { version: 1, status: 'draft', ...row })
  return {
    async listProviders({ organizationId }) { return [...providers.values()].filter((r) => r.organizationId === organizationId).map((r) => ({ ...r })) },
    async getProvider({ organizationId, providerId }) { const row = providers.get(providerId); return row && row.organizationId === organizationId ? { ...row } : null },
    async upsertProvider({ organizationId, providerId, patch = {}, actorId }) {
      const id = providerId || stableId('ifp', `${organizationId}:${patch.issuer || patch.name || Date.now()}`)
      const existing = providers.get(id)
      if (existing && existing.organizationId !== organizationId) return null
      const next = { ...(existing || { id, organizationId, status: 'draft', version: 0, createdBy: actorId }), ...patch, id, organizationId, updatedBy: actorId, version: Number(existing?.version || 0) + 1 }
      providers.set(id, next)
      return { ...next }
    },
    async recordProcess({ organizationId, kind, idempotencyKey, targetId, decision, actorId }) {
      const key = `${organizationId}:${kind}:${idempotencyKey}`
      if (processes.has(key)) return { ...processes.get(key), idempotent: true }
      const row = { id: stableId('ifproc', key), organizationId, kind, idempotencyKey, targetId, decision, actorId, status: 'accepted', createdAt: new Date().toISOString() }
      processes.set(key, row)
      return { ...row, idempotent: false }
    },
    async listPlans({ organizationId, connectionId }) { return [...plans.values()].filter((r) => r.organizationId === organizationId && r.connectionId === connectionId).map((r) => ({ ...r })) },
    async createPlan({ organizationId, connectionId, body = {}, idempotencyKey, actorId }) {
      const key = `${organizationId}:scim-plan:${connectionId}:${idempotencyKey}`
      if (plans.has(key)) return { ...plans.get(key), idempotent: true }
      const row = { id: stableId('scimplan', key), organizationId, connectionId, status: 'planned', changes: Array.isArray(body.changes) ? body.changes : [], actorId, createdAt: new Date().toISOString(), idempotent: false }
      plans.set(key, row)
      return { ...row }
    },
    async listRuns({ organizationId, connectionId }) { return [...runs.values()].filter((r) => r.organizationId === organizationId && r.connectionId === connectionId).map((r) => ({ ...r })) },
    async createRun({ organizationId, connectionId, body = {}, idempotencyKey, actorId }) {
      const key = `${organizationId}:scim-run:${connectionId}:${idempotencyKey}`
      if (runs.has(key)) return { ...runs.get(key), idempotent: true }
      const row = { id: stableId('scimrun', key), organizationId, connectionId, status: 'queued', planId: body.planId || null, actorId, createdAt: new Date().toISOString(), idempotent: false }
      runs.set(key, row)
      return { ...row }
    },
  }
}

function scrubSecretBody(body = {}) {
  const { token, bearerToken, clientSecret, secret, password, privateKey, ...safe } = body || {}
  return safe
}

function createIdentityFederationService({ repository = createInMemoryIdentityFederationRepository() } = {}) {
  async function assertRecordTenant(organizationId, record) {
    if (!record || record.organizationId !== organizationId) {
      const error = new Error('identity_federation_record_not_found')
      error.status = 404
      throw error
    }
    return record
  }
  async function assertConnectionOwnership(organizationId, connectionId) {
    const connection = await assertRecordTenant(organizationId, await repository.getProvider({ organizationId, providerId: connectionId }))
    if (connection.protocol !== 'scim' && connection.kind !== 'scim') { const error = new Error('identity_federation_record_not_found'); error.status = 404; throw error }
    return connection
  }
  async function updateScimConnectionRecord({ organizationId, connectionId, body, actorId }) {
    return repository.upsertProvider({ organizationId, providerId: connectionId, patch: { ...scrubSecretBody(body), protocol: 'scim', kind: 'scim', updatedBy: actorId }, actorId })
  }
  return {
    async listProviders({ organizationId }) { return { contractVersion: CONTRACT_VERSION, organizationId, providers: await repository.listProviders({ organizationId }) } },
    async getProvider({ organizationId, providerId }) { const provider = await assertRecordTenant(organizationId, await repository.getProvider({ organizationId, providerId })); return { contractVersion: CONTRACT_VERSION, organizationId, provider, etag: strongEtag(provider.version) } },
    async updateProvider({ organizationId, providerId, body, ifMatch, actorId }) {
      const current = providerId ? await repository.getProvider({ organizationId, providerId }) : null
      if (current) {
        await assertRecordTenant(organizationId, current)
        if (parseIfMatch(ifMatch) !== strongEtag(current.version)) { const error = new Error('precondition_failed'); error.status = 412; error.currentEtag = strongEtag(current.version); throw error }
      }
      const provider = await repository.upsertProvider({ organizationId, providerId, patch: body || {}, actorId })
      return { contractVersion: CONTRACT_VERSION, organizationId, provider, etag: strongEtag(provider.version) }
    },
    async decideProviderState({ organizationId, providerId, body, ifMatch, idempotencyKey, actorId }) {
      const current = await assertRecordTenant(organizationId, await repository.getProvider({ organizationId, providerId }))
      if (parseIfMatch(ifMatch) !== strongEtag(current.version)) { const error = new Error('precondition_failed'); error.status = 412; error.currentEtag = strongEtag(current.version); throw error }
      const decision = body?.decision === 'enabled' ? 'enabled' : body?.decision === 'disabled' ? 'disabled' : null
      if (!decision) { const error = new Error('identity_federation_decision_invalid'); error.status = 400; throw error }
      const provider = await repository.upsertProvider({ organizationId, providerId, patch: { status: decision }, actorId })
      const process = await repository.recordProcess({ organizationId, kind: 'provider-state-decisions', idempotencyKey, targetId: providerId, decision, actorId })
      return { contractVersion: CONTRACT_VERSION, organizationId, provider, process, etag: strongEtag(provider.version) }
    },
    async listScimConnections({ organizationId }) {
      const connections = (await repository.listProviders({ organizationId })).filter((p) => p.protocol === 'scim' || p.kind === 'scim')
      return { contractVersion: CONTRACT_VERSION, organizationId, connections }
    },
    async createScimConnection({ organizationId, body, actorId }) {
      const connection = await updateScimConnectionRecord({ organizationId, connectionId: null, body: { status: 'draft', ...(body || {}) }, actorId })
      return { contractVersion: CONTRACT_VERSION, organizationId, connection, etag: strongEtag(connection.version) }
    },
    async getScimConnection({ organizationId, connectionId }) {
      const connection = await assertConnectionOwnership(organizationId, connectionId)
      return { contractVersion: CONTRACT_VERSION, organizationId, connection, etag: strongEtag(connection.version) }
    },
    async updateScimConnection({ organizationId, connectionId, body, ifMatch, actorId }) {
      const current = await assertConnectionOwnership(organizationId, connectionId)
      if (parseIfMatch(ifMatch) !== strongEtag(current.version)) { const error = new Error('precondition_failed'); error.status = 412; error.currentEtag = strongEtag(current.version); throw error }
      const connection = await updateScimConnectionRecord({ organizationId, connectionId, body, actorId })
      return { contractVersion: CONTRACT_VERSION, organizationId, connection, etag: strongEtag(connection.version) }
    },
    async rotateScimCredentials({ organizationId, connectionId, body, idempotencyKey, actorId }) {
      await assertConnectionOwnership(organizationId, connectionId)
      const process = await repository.recordProcess({ organizationId, kind: 'scim-credentials', idempotencyKey, targetId: connectionId, decision: 'rotate', actorId })
      const connection = await updateScimConnectionRecord({ organizationId, connectionId, body: { credentialUpdatedAt: new Date().toISOString(), credentialLabel: body?.credentialLabel }, actorId })
      return { contractVersion: CONTRACT_VERSION, organizationId, connection, process, etag: strongEtag(connection.version) }
    },
    async createScimReconciliationPlan({ organizationId, connectionId, body, idempotencyKey, actorId }) {
      await assertConnectionOwnership(organizationId, connectionId)
      const plan = await repository.createPlan({ organizationId, connectionId, body, idempotencyKey, actorId })
      return { contractVersion: CONTRACT_VERSION, organizationId, connectionId, plan }
    },
    async listScimReconciliationPlans({ organizationId, connectionId }) {
      await assertConnectionOwnership(organizationId, connectionId)
      return { contractVersion: CONTRACT_VERSION, organizationId, connectionId, plans: await repository.listPlans({ organizationId, connectionId }) }
    },
    async createScimReconciliationRun({ organizationId, connectionId, body, idempotencyKey, actorId }) {
      await assertConnectionOwnership(organizationId, connectionId)
      const run = await repository.createRun({ organizationId, connectionId, body, idempotencyKey, actorId })
      return { contractVersion: CONTRACT_VERSION, organizationId, connectionId, run }
    },
    async listScimReconciliationRuns({ organizationId, connectionId }) {
      await assertConnectionOwnership(organizationId, connectionId)
      return { contractVersion: CONTRACT_VERSION, organizationId, connectionId, runs: await repository.listRuns({ organizationId, connectionId }) }
    },
  }
}

module.exports = { CONTRACT_VERSION, createIdentityFederationService, createInMemoryIdentityFederationRepository, strongEtag }
