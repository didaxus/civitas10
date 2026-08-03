'use strict'
const { loadCanonicalAuthorizationContract } = require('./canonical-contract-loader')
const { LogtoBootstrapPlanError } = require('./errors')
const CIVITAS_API_RESOURCE = 'https://civitas.didaxus.com/api'
const OIDC_SCOPES = new Set(['openid', 'profile', 'email', 'offline_access'])
const EXACT_REJECTIONS = ['org.impersonate', 'impersonation:write', 'billing.seats.request_modify', 'owner:read', 'owner:write', 'organization.members.write', 'read', 'write']
function validateLocalAuthorizationContract(contract = loadCanonicalAuthorizationContract()) {
  const errors = [...contract.errors]
  const { manifest } = contract
  if (manifest.resource !== CIVITAS_API_RESOURCE) errors.push(`unexpected Logto API resource: ${manifest.resource}`)
  if (!manifest.catalogHash) errors.push('manifest missing catalogHash')
  if (!manifest.roleModelVersion) errors.push('manifest missing roleModelVersion')
  for (const [role, permissions] of Object.entries(manifest.rolePermissionAssignments)) {
    for (const permission of permissions) {
      if (role === 'owner_global' && !permission.startsWith('owner.')) errors.push(`owner_global may only receive owner.*: ${permission}`)
      if (role.startsWith('organization_') && permission.startsWith('owner.')) errors.push(`organization role may not receive owner.*: ${role} -> ${permission}`)
      if (role.startsWith('organization_') && /^(account|self)\./.test(permission)) errors.push(`organization role may not receive account/self permission: ${role} -> ${permission}`)
      if (OIDC_SCOPES.has(permission)) errors.push(`OIDC login scope must not be provisioned as API permission: ${role} -> ${permission}`)
      if (EXACT_REJECTIONS.includes(permission) || permission.includes('*')) errors.push(`forbidden role assignment: ${role} -> ${permission}`)
      if (role === 'owner_global' && /^(org|analytics|billing|lms)\./.test(permission)) errors.push(`owner_global forbidden non-owner candidate: ${permission}`)
    }
  }
  for (const permission of manifest.permissions) {
    if (permission.status !== 'active' && permission.identityProvisioning !== 'provisionable' && Object.values(manifest.rolePermissionAssignments).some((perms)=>perms.includes(permission.name))) errors.push(`non-provisionable permission assigned: ${permission.name}`)
    if (OIDC_SCOPES.has(permission.name)) errors.push(`OIDC login scope present in API permission catalog: ${permission.name}`)
  }
  return { valid: errors.length === 0, errors, contract }
}
function assertValidLocalAuthorizationContract(contract) { const result = validateLocalAuthorizationContract(contract); if (!result.valid) throw new LogtoBootstrapPlanError('Local authorization contract failed preflight validation', { errors: result.errors }); return result }
module.exports = { CIVITAS_API_RESOURCE, EXACT_REJECTIONS, OIDC_SCOPES, assertValidLocalAuthorizationContract, validateLocalAuthorizationContract }
