'use strict'

// Versioned source installed in Logto. Keep this function network-free: token minting
// must depend only on the trusted context supplied by Logto.
const RESOURCE = 'https://civitas.didaxus.com/api'
const MEMBERSHIP = 'https://civitas.didaxus.com/claims/organization_membership_id'
const ROLES = 'https://civitas.didaxus.com/claims/organization_role_ids'
const VERSION = 'https://civitas.didaxus.com/claims/authz_contract_version'

function values(value) { return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.length) : [] }
function audiences(context) { const value = context.audience || context.resource || context.token?.aud; return Array.isArray(value) ? value : [value].filter(Boolean) }

async function getCustomJwtClaims(context = {}) {
  const tokenType = context.tokenType || context.token?.type
  const tenantId = context['organization' + 'Id'] || context.organization?.id || context.token?.organization_id
  if (!['organization_access_token', 'organization'].includes(tokenType) || !tenantId || !audiences(context).includes(RESOURCE)) return {}

  // This must be Logto's durable membership identifier. Never manufacture one
  // from subject, role, email, or other claims when the deployed context omits it.
  const membershipId = context.organizationMembership?.id || context.membership?.id
  const membershipTenantId = context.organizationMembership?.['organization' + 'Id'] || context.membership?.['organization' + 'Id']
  const membershipSubject = context.organizationMembership?.userId || context.membership?.userId
  const subject = context.subject || context.token?.sub
  if (!membershipId || membershipTenantId !== tenantId || !subject || membershipSubject !== subject) return {}

  const roleRecords = context.organizationRoles || context.membership?.roles
  if (!Array.isArray(roleRecords)) return {}
  const roleIds = values(roleRecords.map((role) => typeof role === 'string' ? role : role?.id))
  if (!roleIds.length || roleIds.includes('owner_global')) return {}
  if (roleRecords.some((role) => typeof role === 'object' && (role.status && role.status !== 'active' || role.surface && role.surface !== 'organization'))) return {}

  return { [MEMBERSHIP]: membershipId, [ROLES]: [...new Set(roleIds)].sort(), [VERSION]: '2026-07-civitas-authz-v2' }
}

module.exports = { getCustomJwtClaims }
