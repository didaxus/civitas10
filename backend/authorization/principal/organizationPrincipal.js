'use strict'
const crypto = require('crypto')
const { AUTHZ_CONTRACT_VERSION, MEMBERSHIP_CLAIM, ROLES_CLAIM, VERSION_CLAIM } = require('../../../scripts/logto/bootstrap-custom-token-claims')
const REASON_CODES = require('./reasonCodes')
const REASONS = new Set(REASON_CODES)
const PRINCIPAL_SCHEMA_VERSION = 'civitas-principal/v2'
const ROLE_PATH_SCHEMA_VERSION = 'civitas-role-path/v2'
const PRINCIPAL_AUTHZ_CONTRACT_VERSION = 'civitas-authorization-foundation/v2'
const TOKEN_TO_PRINCIPAL_VERSION = Object.freeze({ [AUTHZ_CONTRACT_VERSION]: PRINCIPAL_AUTHZ_CONTRACT_VERSION })
class PrincipalBindingError extends Error { constructor(reasonCode) { super(reasonCode); this.name='PrincipalBindingError'; this.code=reasonCode; this.status=403 } }
function deny(code){if(!REASONS.has(code))throw new Error(`unknown reason code: ${code}`);throw new PrincipalBindingError(code)}
function equalOrDeny(actual,expected,code){if(expected!=null&&actual!==expected)deny(code)}
function iso(seconds){return new Date(Number(seconds)*1000).toISOString()}
function stableId(parts){return `principal_${crypto.createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0,24)}`}
async function buildOrganizationPrincipal({claims={},session,tenantContext,routeOrganizationId,resourceOrganizationId,permissionId,rolePotentialVersion,principalType='user',membershipBindingSource='logto_claim',surface='rest',providers={},supportedVersions=[AUTHZ_CONTRACT_VERSION]}={}){
 const tenantId=claims.organization_id;const tokenVersion=claims[VERSION_CLAIM]
 if(!tokenVersion)deny('authz_contract_version_missing');if(!supportedVersions.includes(tokenVersion)||!TOKEN_TO_PRINCIPAL_VERSION[tokenVersion])deny('authz_contract_version_unsupported')
 const membershipId=claims[MEMBERSHIP_CLAIM];if(!membershipId||typeof membershipId!=='string')deny('organization_membership_claim_missing')
 const roleIds=claims[ROLES_CLAIM];if(!Array.isArray(roleIds)||!roleIds.length||roleIds.some(id=>typeof id!=='string'||!id||id==='owner_global'))deny('organization_role_claim_invalid')
 if(!claims.iss||!claims.sub||!claims.iat||!claims.exp||!claims.aud||!permissionId||!rolePotentialVersion)deny('organization_role_claim_invalid')
 equalOrDeny(tenantId,tenantContext?.organizationId,'token_tenant_mismatch');equalOrDeny(tenantId,session?.organizationId,'session_tenant_mismatch');equalOrDeny(tenantId,routeOrganizationId,'route_tenant_mismatch');equalOrDeny(tenantId,resourceOrganizationId,'resource_wrong_tenant')
 if(session?.bindingVersion!==session?.currentBindingVersion)deny('session_binding_stale');if(tenantContext?.contextVersion!==tenantContext?.currentContextVersion)deny('tenant_context_stale')
 const organization=await providers.getOrganization?.(tenantId);if(!organization||organization.status!=='active')deny('organization_suspended')
 const membership=await providers.getMembership?.({issuer:claims.iss,subject:claims.sub,organizationId:tenantId,membershipId});if(!membership||membership.id!==membershipId||membership.organizationId!==tenantId||membership.subject!==claims.sub)deny('organization_membership_mismatch');if(membership.status!=='active')deny('organization_membership_inactive');if(!Number.isInteger(membership.currentSnapshotVersion)||membership.snapshotVersion!==membership.currentSnapshotVersion)deny('organization_membership_stale')
 const tokenScopes=new Set(String(claims.scope||'').split(/\s+/).filter(Boolean))
 const paths=[];for(const logtoRoleId of [...new Set(roleIds)]){const role=await providers.getRoleBinding?.({organizationId:tenantId,membershipId,subject:claims.sub,logtoRoleId});if(!role||role.status!=='active')deny('organization_role_not_active');if(role.surface!=='organization')deny('organization_role_surface_mismatch');paths.push(Object.freeze({schemaVersion:ROLE_PATH_SCHEMA_VERSION,rolePathId:`role_path_${crypto.createHash('sha256').update([tenantId,membershipId,logtoRoleId,permissionId].join('\u0000')).digest('hex').slice(0,24)}`,organizationId:tenantId,membershipBindingId:membershipId,membershipState:'active',logtoRoleId,canonicalRoleId:role.canonicalRoleId,roleAssignmentState:'active',permissionId,surface,fragments:Object.freeze(role.fragments||[]),tokenScopePresent:tokenScopes.has(permissionId),rolePotentialVersion,snapshotVersion:membership.currentSnapshotVersion}))}
 const audiences=Array.isArray(claims.aud)?[...new Set(claims.aud)]:[claims.aud]
 return Object.freeze({schemaVersion:PRINCIPAL_SCHEMA_VERSION,principalId:stableId([claims.iss,claims.sub,tenantId,membershipId]),principalType,subject:claims.sub,issuer:claims.iss,audiences,organizationId:tenantId,membershipBindingId:membershipId,membershipBindingSource,organizationRoleIds:[...new Set(roleIds)],authzContractVersion:TOKEN_TO_PRINCIPAL_VERSION[tokenVersion],issuedAt:iso(claims.iat),expiresAt:iso(claims.exp),snapshotVersion:membership.currentSnapshotVersion,rolePaths:Object.freeze(paths),provenance:Object.freeze({tokenContractVersion:tokenVersion,bindingRecordVersion:membership.bindingRecordVersion||null,resolvedAt:new Date(0).toISOString()})})
}
module.exports={PRINCIPAL_AUTHZ_CONTRACT_VERSION,PRINCIPAL_SCHEMA_VERSION,ROLE_PATH_SCHEMA_VERSION,TOKEN_TO_PRINCIPAL_VERSION,PrincipalBindingError,buildOrganizationPrincipal}
