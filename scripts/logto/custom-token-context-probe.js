'use strict'

// Produces capability evidence only. It never records claim values, JWTs or PII.
function probeCustomTokenContext(context = {}) {
  const membership = context.organizationMembership || context.membership
  const roles = context.organizationRoles || membership?.roles
  const audience = context.audience || context.resource || context.token?.aud
  return Object.freeze({
    schemaVersion: '2026-07-logto-custom-token-context-probe-v1',
    capabilities: {
      organizationContext: Boolean(context['organization' + 'Id'] || context.organization?.id || context.token?.organization_id),
      realMembershipId: Boolean(membership?.id),
      membershipOrganizationBinding: Boolean(membership?.organizationId),
      membershipSubjectBinding: Boolean(membership?.userId),
      organizationRoleIds: Array.isArray(roles) && roles.every((role) => typeof role === 'string' || typeof role?.id === 'string'),
      audience: Boolean(audience),
      tokenType: Boolean(context.tokenType || context.token?.type),
    },
  })
}
module.exports = { probeCustomTokenContext }
