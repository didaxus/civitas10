#!/usr/bin/env node
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { permissionsByName, organizationRolePotentials, roleBundles } = require('../../core/authz')

const roles = new Map((organizationRolePotentials || []).map((role) => [role.roleKey, role]))
const bundleMembership = new Map()
for (const bundle of roleBundles || []) {
  for (const permission of bundle.permissionIds || []) {
    const bundles = bundleMembership.get(permission) || []
    bundles.push(bundle.key || bundle.bundleKey)
    bundleMembership.set(permission, bundles.sort())
  }
}
const roleMembership = new Map()
for (const role of roles.values()) {
  for (const permission of role.potentialPermissionIds || []) {
    const list = roleMembership.get(permission) || []
    list.push(role.roleKey)
    roleMembership.set(permission, list.sort())
  }
}
const executableMembership = new Map()
for (const role of roles.values()) {
  for (const permission of role.activeExecutableScopeIds || []) {
    const list = executableMembership.get(permission) || []
    list.push(role.roleKey)
    executableMembership.set(permission, list.sort())
  }
}

const report = Object.values(permissionsByName)
  .filter((permission) => permission.surface === 'organization')
  .sort((a, b) => a.name.localeCompare(b.name))
  .map((permission) => {
    const canonicalRoles = roleMembership.get(permission.name) || []
    const executableRoles = executableMembership.get(permission.name) || []
    const drift = []
    if (!canonicalRoles.length) drift.push('not_in_role_potential')
    if (permission.name.startsWith('owner.')) drift.push('owner_permission_on_organization_surface')
    if (permission.name.includes('*')) drift.push('wildcard_permission')
    if (permission.status !== 'active' && executableRoles.length) drift.push('non_active_executable_assignment')
    return {
      permission: permission.name,
      canonicalStatus: permission.status,
      organizationSurface: permission.surface === 'organization',
      presentationMetadata: { groupKey: permission.domain || permission.namespace, generated: true },
      roleBundles: bundleMembership.get(permission.name) || [],
      affectedRoles: canonicalRoles,
      logtoProvisioned: permission.status === 'active',
      logtoAssignedRoles: executableRoles,
      executableStatus: executableRoles.length ? 'active-only' : 'not-executable',
      driftClassification: drift.length ? drift : ['none'],
    }
  })

process.stdout.on('error', (error) => { if (error.code !== 'EPIPE') throw error })
process.stdout.write(`${JSON.stringify({ generatedAt: new Date(0).toISOString(), report }, null, 2)}\n`)
