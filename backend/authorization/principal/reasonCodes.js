'use strict'
module.exports = Object.freeze([
  'authz_contract_version_missing', 'authz_contract_version_unsupported',
  'organization_membership_claim_missing', 'organization_membership_mismatch',
  'organization_membership_inactive', 'organization_membership_stale',
  'organization_role_claim_invalid', 'organization_role_surface_mismatch',
  'organization_role_not_active', 'session_tenant_mismatch', 'token_tenant_mismatch',
  'route_tenant_mismatch', 'resource_wrong_tenant', 'tenant_context_stale',
  'session_binding_stale', 'organization_suspended', 'delegation_invalid',
  'delegation_expired', 'delegation_effect_denied',
])
