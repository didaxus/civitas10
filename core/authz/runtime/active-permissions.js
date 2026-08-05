'use strict'

const { API_RESOURCE, permissionsByName } = require('..')
const { validatePermissionName } = require('../validation/validate-permission-name')

function requireActivePermission(name, expectedSurface) {
  const syntax = validatePermissionName(name, { allowUnknownAction: true })
  if (!syntax.valid) throw new Error(`Invalid runtime permission ${name}: ${syntax.expected}`)
  const definition = permissionsByName[name]
  if (!definition) throw new Error(`Runtime permission does not exist in authorization catalog: ${name}`)
  if (definition.status !== 'active') throw new Error(`Runtime permission must be active: ${name}`)
  if (definition.resource !== API_RESOURCE) throw new Error(`Runtime permission ${name} must belong to ${API_RESOURCE}`)
  if (definition.surface !== expectedSurface) throw new Error(`Runtime permission ${name} must use ${expectedSurface} surface`)
  return definition.name
}

const OWNER_PERMISSION_NAMES = Object.freeze({
  profileRead: 'owner.profile.read',
  organizationsRead: 'owner.organizations.read',
  organizationsCreate: 'owner.organizations.create',
  runtimeRead: 'owner.runtime.read',
  runtimeOperationsExecute: 'owner.runtime.operations.execute',
  workerQueuesRead: 'owner.worker_queues.read',
  roleLabelsManage: 'owner.role_labels.manage',
})

const ORGANIZATION_PERMISSION_NAMES = Object.freeze({
  documentsRead: 'org.documents.read',
  documentsCreate: 'org.documents.create',
})

const OWNER_PERMISSIONS = Object.freeze(Object.fromEntries(Object.entries(OWNER_PERMISSION_NAMES).map(([key, name]) => [key, requireActivePermission(name, 'global')])))
const ORGANIZATION_PERMISSIONS = Object.freeze(Object.fromEntries(Object.entries(ORGANIZATION_PERMISSION_NAMES).map(([key, name]) => [key, requireActivePermission(name, 'organization')])))

module.exports = { API_RESOURCE, OWNER_PERMISSIONS, ORGANIZATION_PERMISSIONS, requireActivePermission }
