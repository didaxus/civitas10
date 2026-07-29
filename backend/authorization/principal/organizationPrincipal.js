'use strict'

const { AUTHZ_CONTRACT_VERSION, MEMBERSHIP_CLAIM, ROLES_CLAIM, VERSION_CLAIM } = require('../../../scripts/logto/bootstrap-custom-token-claims')
const REASON_CODES = require('./reasonCodes')
const REASONS = new Set(REASON_CODES)

class PrincipalBindingError extends Error {
  constructor(reasonCode) { super(reasonCode); this.name = 'PrincipalBindingError'; this.code = reasonCode; this.status = 403 }
}
function deny(code) { if (!REASONS.has(code)) throw new Error(`unknown reason code: ${code}`); throw new PrincipalBindingError(code) }
function equalOrDeny(actual, expected, code) { if (expected != null && actual !== expected) deny(code) }

/** Build independent, membership-bound paths after JWT cryptographic validation. */
async function buildOrganizationPrincipal({
  claims = {}, session, tenantContext, routeOrganizationId, resourceOrganizationId,
  requiredScope, surface = 'organization', providers = {}, supportedVersions = [AUTHZ_CONTRACT_VERSION],
} = {}) {
  const tenantId = claims.organization_id
  const version = claims[VERSION_CLAIM]
  if (!version) deny('authz_contract_version_missing')
  if (!supportedVersions.includes(version)) deny('authz_contract_version_unsupported')
  const membershipId = claims[MEMBERSHIP_CLAIM]
  if (!membershipId || typeof membershipId !== 'string') deny('organization_membership_claim_missing')
  const roleIds = claims[ROLES_CLAIM]
  if (!Array.isArray(roleIds) || !roleIds.length || roleIds.some((id) => typeof id !== 'string' || !id || id === 'owner_global')) deny('organization_role_claim_invalid')

  // These checks intentionally precede every provider/resource lookup.
  equalOrDeny(tenantId, tenantContext?.organizationId, 'token_tenant_mismatch')
  equalOrDeny(tenantId, session?.organizationId, 'session_tenant_mismatch')
  equalOrDeny(tenantId, routeOrganizationId, 'route_tenant_mismatch')
  equalOrDeny(tenantId, resourceOrganizationId, 'resource_wrong_tenant')
  if (session?.bindingVersion !== session?.currentBindingVersion) deny('session_binding_stale')
  if (tenantContext?.contextVersion !== tenantContext?.currentContextVersion) deny('tenant_context_stale')

  const organization = await providers.getOrganization?.(tenantId)
  if (!organization || organization.status !== 'active') deny('organization_suspended')
  const membership = await providers.getMembership?.({ issuer: claims.iss, subject: claims.sub, organizationId: tenantId, membershipId })
  if (!membership || membership.id !== membershipId || membership.organizationId !== tenantId || membership.subject !== claims.sub) deny('organization_membership_mismatch')
  if (membership.status !== 'active') deny('organization_membership_inactive')
  if (membership.snapshotVersion !== membership.currentSnapshotVersion) deny('organization_membership_stale')

  const tokenScopes = new Set(typeof claims.scope === 'string' ? claims.scope.split(/\s+/).filter(Boolean) : [])
  const paths = []
  for (const logtoRoleId of [...new Set(roleIds)]) {
    const role = await providers.getRoleBinding?.({ organizationId: tenantId, membershipId, subject: claims.sub, logtoRoleId })
    if (!role || role.status !== 'active') deny('organization_role_not_active')
    if (role.surface !== surface) deny('organization_role_surface_mismatch')
    paths.push(Object.freeze({ issuer: claims.iss, audience: claims.aud, organizationId: tenantId, subject: claims.sub, membershipId, logtoRoleId, canonicalRoleId: role.canonicalRoleId, tokenScopePresent: requiredScope ? tokenScopes.has(requiredScope) : true, authzContractVersion: version, sessionBindingVersion: session?.bindingVersion, tenantContextVersion: tenantContext?.contextVersion, snapshotVersion: membership.currentSnapshotVersion }))
  }
  return Object.freeze({ organizationId: tenantId, subject: claims.sub, membershipId, paths: Object.freeze(paths) })
}

module.exports = { PrincipalBindingError, buildOrganizationPrincipal }
