'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { getCustomJwtClaims } = require('../../scripts/logto/templates/get-custom-jwt-claims')
const claimsContract = require('../../scripts/logto/bootstrap-custom-token-claims')
const { probeCustomTokenContext } = require('../../scripts/logto/custom-token-context-probe')
const { buildOrganizationPrincipal } = require('../authorization/principal')

const context = { tokenType: 'organization_access_token', resource: 'https://civitas.didaxus.com/api', organizationId: 'org_123', subject: 'subject_123', organizationMembership: { id: 'membership_123', organizationId: 'org_123', userId: 'subject_123' }, organizationRoles: [{ id: 'role_teacher', status: 'active', surface: 'organization' }] }

test('organization token emits exactly the frozen three custom claims', async () => {
  const result = await getCustomJwtClaims(context)
  assert.deepEqual(Object.keys(result).sort(), [...claimsContract.ALLOWED_CUSTOM_CLAIMS].sort())
  assert.equal(result[claimsContract.VERSION_CLAIM], claimsContract.AUTHZ_CONTRACT_VERSION)
})

test('wrong token, audience, unverifiable membership, and owner role emit no claims', async () => {
  for (const candidate of [
    { ...context, tokenType: 'access_token' }, { ...context, resource: 'https://other.test/api' },
    { ...context, organizationMembership: undefined }, { ...context, organizationRoles: ['owner_global'] },
  ]) assert.deepEqual(await getCustomJwtClaims(candidate), {})
})

test('custom claim plan is deterministic, exact, and read-only until approved apply', () => {
  const a = claimsContract.buildCustomClaimsPlan()
  const b = claimsContract.buildCustomClaimsPlan()
  assert.deepEqual(a, b)
  assert.equal(claimsContract.validateCustomClaimsPlan(a).valid, true)
  assert.equal(a.claims.length, 3)
  assert.equal(a.operations.every((operation) => !/delete/i.test(operation.type)), true)
})

test('redacted context probe records capabilities but no identity values', () => {
  const evidence = probeCustomTokenContext({ ...context, email: 'private@example.test', accessToken: 'secret' })
  const serialized = JSON.stringify(evidence)
  assert.equal(evidence.capabilities.realMembershipId, true)
  assert.equal(serialized.includes('membership_123'), false)
  assert.equal(serialized.includes('private@example.test'), false)
  assert.equal(serialized.includes('secret'), false)
})

test('principal paths remain independently membership, role, tenant, and freshness bound', async () => {
  const claims = { iss: 'https://issuer.test/oidc', sub: 'subject_123', aud: 'https://civitas.didaxus.com/api', iat: 1785283200, exp: 1785286800, organization_id: 'org_123', scope: 'lms.groups.read', [claimsContract.MEMBERSHIP_CLAIM]: 'membership_123', [claimsContract.ROLES_CLAIM]: ['role_teacher', 'role_headteacher'], [claimsContract.VERSION_CLAIM]: claimsContract.AUTHZ_CONTRACT_VERSION }
  const input = { claims, permissionId: 'lms.groups.read', rolePotentialVersion: '2026-07-role-potential-v2', session: { organizationId: 'org_123', bindingVersion: 2, currentBindingVersion: 2 }, tenantContext: { organizationId: 'org_123', contextVersion: 3, currentContextVersion: 3 }, routeOrganizationId: 'org_123', resourceOrganizationId: 'org_123', requiredScope: 'lms.groups.read', providers: { getOrganization: async () => ({ status: 'active' }), getMembership: async () => ({ id: 'membership_123', organizationId: 'org_123', subject: 'subject_123', status: 'active', snapshotVersion: 4, currentSnapshotVersion: 4 }), getRoleBinding: async ({ logtoRoleId }) => ({ status: 'active', surface: 'organization', canonicalRoleId: logtoRoleId === 'role_teacher' ? 'organization_teacher' : 'organization_headteacher' }) } }
  const principal = await buildOrganizationPrincipal(input)
  const principalSchema = require('../../contracts/authorization/principal.schema.json')
  const rolePathSchema = require('../../contracts/authorization/role-path.schema.json')
  assert.equal(principal.schemaVersion, principalSchema.properties.schemaVersion.const)
  assert.equal(principal.authzContractVersion, principalSchema.properties.authzContractVersion.const)
  assert.equal(principal.provenance.tokenContractVersion, claimsContract.AUTHZ_CONTRACT_VERSION)
  for (const field of principalSchema.required) assert.notEqual(principal[field], undefined, field)
  assert.equal(principal.rolePaths.length, 2)
  for (const path of principal.rolePaths) for (const field of rolePathSchema.required) assert.notEqual(path[field], undefined, field)
  assert.equal(principal.rolePaths.every((path) => path.membershipBindingId === 'membership_123' && path.permissionId === 'lms.groups.read'), true)
  await assert.rejects(() => buildOrganizationPrincipal({ ...input, routeOrganizationId: 'org_other' }), { code: 'route_tenant_mismatch' })
  await assert.rejects(() => buildOrganizationPrincipal({ ...input, claims: { ...claims, [claimsContract.VERSION_CLAIM]: 'old' } }), { code: 'authz_contract_version_unsupported' })
})
