'use strict'
const { AUTHORIZATION_NAMING_CONTRACT } = require('./naming-contract')
const { validatePermissionName } = require('../../core/authz/validation/validate-permission-name')
function validateRolePermissionReference(role, permission, catalogByName = new Map()) {
  const syntax = validatePermissionName(permission, { allowUnknownAction: true })
  if (!syntax.valid) return syntax
  if (role === 'owner_global' && !permission.startsWith('owner.')) return { valid: false, category: 'violation', kind: 'permission-reference', value: permission, expected: 'owner_global may only reference owner.* permissions' }
  if (role && role.startsWith('organization_') && permission.startsWith('owner.')) return { valid: false, category: 'violation', kind: 'permission-reference', value: permission, expected: 'organization roles must not reference owner.* permissions' }
  if (catalogByName.size) {
    const def = catalogByName.get(permission)
    if (!def) return { valid: false, category: 'violation', kind: 'permission-reference', value: permission, expected: 'permission reference must exist in #74 catalog' }
    if (def.status !== 'active' && def.identityProvisioning !== 'provisionable') return { valid: false, category: 'violation', kind: 'permission-reference', value: permission, expected: 'role references must target active or explicitly provisionable catalog permissions' }
    if (role?.startsWith('organization_') && def.surface !== 'organization' && def.surface !== 'self') return { valid: false, category: 'violation', kind: 'permission-reference', value: permission, expected: 'organization role permissions must be organization/self surface' }
  }
  return { valid: true, category: 'canonical', kind: 'permission-reference', value: permission }
}
module.exports = { validatePermissionName, validateRolePermissionReference }
