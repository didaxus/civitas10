'use strict'

const crypto = require('crypto')

const SCIM_GROUP_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:Group'
const SCIM_LIST_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:ListResponse'
const SOURCE_KIND = 'directory_sync_scim'

function stableScimId(connectionId, externalId) {
  return `grp_${crypto.createHash('sha256').update(`${connectionId}:${externalId}`).digest('base64url').slice(0, 24)}`
}
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)) }
function bad(message, status = 400) { const e = new Error(message); e.status = status; return e }
function memberValues(members) { return Array.isArray(members) ? [...new Set(members.map((m) => String(m?.value || '').trim()).filter(Boolean))] : [] }
function normalizeGroup(row) {
  return {
    schemas: [SCIM_GROUP_SCHEMA],
    id: row.id,
    externalId: row.externalId,
    displayName: row.displayName,
    members: row.members.map((value) => ({ value })),
    meta: { resourceType: 'Group', created: row.createdAt, lastModified: row.updatedAt, location: row.location },
  }
}
function parseFilter(filter) {
  if (!filter) return null
  const match = String(filter).match(/^\s*(displayName|externalId)\s+eq\s+"([^"]*)"\s*$/i)
  if (!match) throw bad('unsupported_filter')
  return { field: match[1] === 'displayName' ? 'displayName' : 'externalId', value: match[2] }
}

function createInMemoryScimGroupRepository(seed = {}) {
  const groups = new Map()
  const provenance = new Map()
  for (const row of seed.groups || []) groups.set(row.id, { members: [], version: 1, ...row })
  return {
    provenance,
    async listGroups({ connectionId }) { return [...groups.values()].filter((g) => g.connectionId === connectionId && g.objectType === 'group' && g.state !== 'deleted').map(clone) },
    async getGroup({ connectionId, groupId }) { const g = groups.get(groupId); return g?.connectionId === connectionId && g.state !== 'deleted' ? clone(g) : null },
    async getObject({ connectionId, objectId }) { const g = groups.get(objectId); return g?.connectionId === connectionId && g.state !== 'deleted' ? clone(g) : null },
    async findGroupByExternalId({ connectionId, externalId }) { return [...groups.values()].find((g) => g.connectionId === connectionId && g.externalId === externalId && g.state !== 'deleted') || null },
    async saveGroup(row) { groups.set(row.id, clone(row)); return clone(row) },
    async listSourceManagedProvenance({ connectionId, externalGroupId }) { return clone(provenance.get(`${connectionId}:${externalGroupId}`) || []) },
    async removeSourceManagedProvenance({ connectionId, externalGroupId }) { const key = `${connectionId}:${externalGroupId}`; const rows = provenance.get(key) || []; provenance.delete(key); return clone(rows) },
  }
}

function createScimGroupService({ repository = createInMemoryScimGroupRepository(), baseUrl = '/scim/v2' } = {}) {
  async function assertMembersInConnection(connectionId, values) {
    for (const value of values) {
      const object = await repository.getObject({ connectionId, objectId: value })
      if (!object) throw bad(`member_not_in_connection:${value}`)
    }
  }
  async function save({ connectionId, existing, body }) {
    const externalId = String(body?.externalId || existing?.externalId || body?.displayName || '').trim()
    const displayName = String(body?.displayName || existing?.displayName || '').trim()
    if (!externalId) throw bad('externalId_required')
    if (!displayName) throw bad('displayName_required')
    const dup = await repository.findGroupByExternalId({ connectionId, externalId })
    if (dup && dup.id !== existing?.id) throw bad('externalId_conflict', 409)
    const members = body?.members === undefined ? (existing?.members || []) : memberValues(body.members)
    await assertMembersInConnection(connectionId, members)
    const now = new Date().toISOString()
    const id = existing?.id || stableScimId(connectionId, externalId)
    return repository.saveGroup({ objectType: 'group', state: 'active', version: Number(existing?.version || 0) + 1, createdAt: existing?.createdAt || now, updatedAt: now, ...existing, id, connectionId, externalId, displayName, members, sourceKind: SOURCE_KIND, canonicalRoleId: null, location: `${baseUrl}/connections/${connectionId}/Groups/${id}` })
  }
  return {
    async createGroup({ connectionId, body }) { return normalizeGroup(await save({ connectionId, body })) },
    async listGroups({ connectionId, filter, startIndex = 1, count = 100 }) {
      const parsed = parseFilter(filter)
      let rows = await repository.listGroups({ connectionId })
      if (parsed) rows = rows.filter((g) => g[parsed.field] === parsed.value)
      const start = Math.max(Number(startIndex || 1), 1) - 1
      const limit = Math.max(Number(count || 100), 0)
      return { schemas: [SCIM_LIST_SCHEMA], totalResults: rows.length, startIndex: start + 1, itemsPerPage: Math.max(0, Math.min(limit, rows.length - start)), Resources: rows.slice(start, start + limit).map(normalizeGroup) }
    },
    async getGroup({ connectionId, groupId }) { const row = await repository.getGroup({ connectionId, groupId }); if (!row) throw bad('group_not_found', 404); return normalizeGroup(row) },
    async replaceGroup({ connectionId, groupId, body }) { const existing = await repository.getGroup({ connectionId, groupId }); if (!existing) throw bad('group_not_found', 404); return normalizeGroup(await save({ connectionId, existing, body })) },
    async patchGroup({ connectionId, groupId, body }) {
      let row = await repository.getGroup({ connectionId, groupId }); if (!row) throw bad('group_not_found', 404)
      for (const op of body?.Operations || []) {
        const operation = String(op.op || '').toLowerCase(); const path = String(op.path || '').toLowerCase()
        if (operation === 'replace' && (!path || path === 'members')) row.members = memberValues(path ? op.value : op.value?.members)
        else if (operation === 'replace' && path === 'displayname') row.displayName = String(op.value || '').trim()
        else if (operation === 'add' && (!path || path === 'members')) row.members = [...new Set([...row.members, ...memberValues(path ? op.value : op.value?.members)])]
        else if (operation === 'remove' && path.startsWith('members')) { const remove = memberValues(op.value); row.members = row.members.filter((m) => !remove.includes(m)) }
        else throw bad('unsupported_patch_operation')
        await assertMembersInConnection(connectionId, row.members)
      }
      row.version = Number(row.version || 0) + 1; row.updatedAt = new Date().toISOString(); return normalizeGroup(await repository.saveGroup(row))
    },
    async deleteGroup({ connectionId, groupId, maxDeprovision = 50 }) {
      const row = await repository.getGroup({ connectionId, groupId }); if (!row) throw bad('group_not_found', 404)
      const sourceRows = await repository.listSourceManagedProvenance({ connectionId, externalGroupId: row.externalId })
      if (sourceRows.length > maxDeprovision) throw bad('mass_deprovision_check_required', 409)
      await repository.removeSourceManagedProvenance({ connectionId, externalGroupId: row.externalId })
      row.state = 'deleted'; row.members = []; row.version = Number(row.version || 0) + 1; row.updatedAt = new Date().toISOString(); await repository.saveGroup(row)
      return { removedProvenanceCount: sourceRows.length }
    },
  }
}

module.exports = { SCIM_GROUP_SCHEMA, SCIM_LIST_SCHEMA, SOURCE_KIND, createInMemoryScimGroupRepository, createScimGroupService, stableScimId }
