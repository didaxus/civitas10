'use strict'

const { API_RESOURCE, KNOWN_DOMAINS } = require('../constants')
const generated = require('./generated/permission-catalog')
const ownerRuntime = require('./owner.permissions').filter((permission) => permission.status === 'active')

function normalize(permission) {
  return Object.freeze({
    ...permission,
    domain: permission.domain || permission.namespace,
    status: permission.status || permission.targetStatus,
    resource: permission.resource || API_RESOURCE,
    surface: permission.surface === 'owner' ? 'global' : permission.surface,
    overlayMode: permission.overlayMode || (permission.surface === 'owner' ? 'global' : 'restrictable'),
    // New fields for two-level RBAC
    identityProvisioningStatus: permission.identityProvisioningStatus || (permission.targetStatus === 'active' ? 'provisioned' : 'not_provisioned'),
    runtimeAvailability: permission.runtimeAvailability || (permission.observedImplementation === 'active' ? 'available' : 'unavailable'),
    catalogStatus: permission.catalogStatus || permission.targetStatus,
  })
}

const generatedPermissions = generated.permissions.map(normalize)
const mergedByName = new Map(generatedPermissions.map((permission) => [permission.name, permission]))
for (const permission of ownerRuntime.map(normalize)) mergedByName.set(permission.name, permission)
const allPermissions = [...mergedByName.values()]
const modules = Object.freeze(Object.fromEntries(KNOWN_DOMAINS.map((domain) => [
  domain,
  Object.freeze(allPermissions.filter((permission) => permission.domain === domain).sort((a,b)=>a.name.localeCompare(b.name))),
])))
const permissions = Object.freeze(Object.values(modules).flat().sort((a,b)=>a.name.localeCompare(b.name)).map(Object.freeze))
const activePermissions = Object.freeze(permissions.filter((permission) => permission.status === 'active'))
const permissionsByName = Object.freeze(Object.fromEntries(permissions.map((p)=>[p.name,p])))
module.exports = { API_RESOURCE, knownDomains: KNOWN_DOMAINS, catalogHash: generated.catalogHash, modules, permissions, activePermissions, permissionsByName }
