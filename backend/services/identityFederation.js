'use strict'

const crypto = require('crypto')

const CONTRACT_VERSION = '2026-07-civitas10-identity-federation-v1'

function strongEtag(version) { return `"identity-federation:${Number(version || 0)}"` }
function parseIfMatch(value) { return typeof value === 'string' ? value.trim() : '' }
function stableId(prefix, material) { return `${prefix}_${crypto.createHash('sha256').update(String(material)).digest('base64url').slice(0, 18)}` }

function createInMemoryIdentityFederationRepository(seed = []) {
  const providers = new Map()
  const processes = new Map()
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
  }
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
  }
}

module.exports = { CONTRACT_VERSION, createIdentityFederationService, createInMemoryIdentityFederationRepository, strongEtag }
