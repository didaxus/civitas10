#!/usr/bin/env node
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { getAuthorizationManifest } = require('../../core/authz')
const { emptyRemoteState, normalizeRemoteState } = require('../logto/authorization-state-reader')

const manifest = getAuthorizationManifest()
const remoteState = process.env.CIVITAS_AUTHZ_REMOTE_STATE_JSON ? normalizeRemoteState(JSON.parse(process.env.CIVITAS_AUTHZ_REMOTE_STATE_JSON)) : emptyRemoteState({ source: 'empty-no-credentials' })
const catalog = new Map(manifest.permissions.map((permission) => [permission.name, permission]))
const bundles = manifest.roleBundles || []
const rolePotentials = manifest.organizationRolePotentials || []
const bundleMembership = new Map()
for (const bundle of bundles) for (const permission of bundle.permissionIds || []) { const list = bundleMembership.get(permission) || []; list.push(bundle.key); bundleMembership.set(permission, list.sort()) }
const canonicalTargetRoles = new Map()
const canonicalExecutableRoles = new Map()
for (const role of rolePotentials) {
  for (const permission of role.potentialPermissionIds || []) { const list = canonicalTargetRoles.get(permission) || []; list.push(role.roleKey); canonicalTargetRoles.set(permission, list.sort()) }
  for (const permission of role.activeExecutableScopeIds || []) { const list = canonicalExecutableRoles.get(permission) || []; list.push(role.roleKey); canonicalExecutableRoles.set(permission, list.sort()) }
}
const observedPermissions = new Map((remoteState.permissions || []).map((permission) => [permission.name, permission]))
const observedAssigned = new Map()
for (const role of remoteState.organizationRoles || []) for (const permission of role.permissions || []) { const list = observedAssigned.get(permission) || []; list.push(role.name); observedAssigned.set(permission, list.sort()) }
const allPermissionIds = [...new Set([...catalog.keys(), ...observedPermissions.keys()])].sort()
const report = allPermissionIds.filter((id) => catalog.get(id)?.surface === 'organization' || observedPermissions.has(id)).map((id) => {
  const permission = catalog.get(id)
  const presentation = permission?.presentation || {}
  const observedRoles = observedAssigned.get(id) || []
  const drift = []
  if (!permission) drift.push('api_permission_absent_from_canonical_catalog')
  if (permission && remoteState.status === 'verified' && !observedPermissions.has(id) && permission.status === 'active') drift.push('canonical_permission_absent_from_logto')
  if (permission && !bundleMembership.get(id)?.length && canonicalTargetRoles.get(id)?.length) drift.push('canonical_target_permission_absent_from_every_bundle')
  if (permission?.name?.startsWith('owner.') && observedRoles.length) drift.push('owner_permission_assigned_to_organization_role')
  if (id.includes('*')) drift.push('wildcard_permission')
  if (permission && permission.status !== 'active' && observedRoles.length) drift.push('planned_permission_assigned_to_executable_logto_role')
  if (permission && (!presentation.label || !presentation.description || !presentation.groupKey || !presentation.groupLabel || typeof presentation.groupOrder !== 'number' || typeof presentation.order !== 'number')) drift.push('missing_presentation_metadata')
  return {
    canonicalPermission: id,
    catalogLifecycle: permission?.status || permission?.targetStatus || null,
    presentationComplete: Boolean(presentation.label && presentation.description && presentation.groupKey && presentation.groupLabel && typeof presentation.groupOrder === 'number' && typeof presentation.order === 'number'),
    bundleMembership: bundleMembership.get(id) || [],
    canonicalTargetRoles: canonicalTargetRoles.get(id) || [],
    canonicalExecutableRoles: canonicalExecutableRoles.get(id) || [],
    observedLogtoVerificationStatus: remoteState.status || 'verification_required',
    observedLogtoProvisioned: remoteState.status === 'verified' ? observedPermissions.has(id) : null,
    observedLogtoAssignedRoles: remoteState.status === 'verified' ? observedRoles : [],
    ownerSurfaceEligible: Boolean(permission && permission.surface === 'organization' && !id.startsWith('owner.') && !id.includes('*')),
    driftClassification: drift.length ? drift : ['none'],
  }
})
process.stdout.on('error', (error) => { if (error.code !== 'EPIPE') throw error })
process.stdout.write(`${JSON.stringify({ generatedAt: '1970-01-01T00:00:00.000Z', remoteStateStatus: remoteState.status || 'verification_required', report }, null, 2)}\n`)
