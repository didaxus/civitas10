'use strict'
const { API_RESOURCE, GLOBAL_ROLES, ORGANIZATION_ROLES, KNOWN_DOMAINS } = require('../constants')
const legacyMap = require('../legacy/legacy-permission-map')
const NAME_RE = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/
const FORBIDDEN = new Set(['org.impersonate','billing.seats.request_modify'])
function validateAuthorizationContract(manifest, options = {}) {
  const errors = []
  const permissions = manifest.permissions || []
  const rolePermissionAssignments = manifest.rolePermissionAssignments || {}
  const byName = new Map()
  const screenActionIds = new Map()
  const allowedLegacy = new Set((options.legacyAllowlist || legacyMap.map((x)=>x.legacyPermission)))
  if (manifest.resource !== API_RESOURCE) errors.push('invalid manifest resource')
  for (const p of permissions) {
    if (byName.has(p.name)) errors.push(`duplicate permission: ${p.name}`)
    byName.set(p.name,p)
    if (!NAME_RE.test(p.name)) errors.push(`invalid permission name: ${p.name}`)
    if (p.resource !== API_RESOURCE) errors.push(`invalid resource for ${p.name}`)
    if (p.name.includes('*')) errors.push(`wildcard permission: ${p.name}`)
    if (p.name.startsWith('organization.')) errors.push(`deprecated organization prefix in catalog: ${p.name}`)
    if (FORBIDDEN.has(p.name)) errors.push(`forbidden permission: ${p.name}`)
    if (p.status === 'active' && (!Array.isArray(p.consumers) || p.consumers.length === 0) && !(options.activeConsumerExceptions || []).includes(p.name)) errors.push(`active permission without consumer: ${p.name}`)
    if (p.status === 'deprecated' && !p.replacement) errors.push(`deprecated permission missing replacement: ${p.name}`)
    if (p.screenActionIds) for (const id of p.screenActionIds) { if (screenActionIds.has(id)) errors.push(`duplicate screen/action id: ${id}`); screenActionIds.set(id,p.name) }
    const legacyLike = p.name.includes(':') || ['runtime','worker-queues'].includes(p.name.split('.')[0])
    if (legacyLike && !allowedLegacy.has(p.name)) errors.push(`legacy scope outside allowlist: ${p.name}`)
  }
  for (const domain of KNOWN_DOMAINS) if (!permissions.some((p)=>p.domain === domain)) errors.push(`known domain has no module ownership: ${domain}`)
  for (const [role, perms] of Object.entries(rolePermissionAssignments)) {
    if (![...GLOBAL_ROLES,...ORGANIZATION_ROLES].includes(role)) errors.push(`unknown role: ${role}`)
    for (const perm of perms) {
      if (perm.includes('*')) errors.push(`wildcard assigned to ${role}: ${perm}`)
      if (FORBIDDEN.has(perm)) errors.push(`forbidden permission assigned to ${role}: ${perm}`)
      if (perm.startsWith('organization.') || perm.includes(':')) errors.push(`legacy scope assigned to ${role}: ${perm}`)
      const def = byName.get(perm)
      if (!def) { errors.push(`role ${role} references missing permission: ${perm}`); continue }
      if (def.status !== 'active' && def.identityProvisioning !== 'provisionable') errors.push(`role ${role} references non-provisionable ${def.status} permission: ${perm}`)
      if (role === 'owner_global' && !perm.startsWith('owner.')) errors.push(`owner_global cannot receive non-owner permission: ${perm}`)
      if (ORGANIZATION_ROLES.includes(role) && perm.startsWith('owner.')) errors.push(`organization role cannot receive owner permission: ${role} -> ${perm}`)
    }
  }
  return { valid: errors.length === 0, errors }
}
module.exports = { validateAuthorizationContract }
