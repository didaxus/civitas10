'use strict'
function createPostgresDelegationContextRepository({ queryPostgres }={}) {
  if (typeof queryPostgres !== 'function') throw new Error('queryPostgres is required')
  return Object.freeze({
    durable: true,
    async insert(row) { const result=await queryPostgres(`insert into authorization_delegation_contexts(decision_id,actor_subject,actor_surface,client_id,target_organization_id,reason,issued_at,expires_at,allowed_capabilities,denied_effects,confirmation_policy,status) values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,'active') returning *`,[row.decisionId,row.actorSubject,row.actorSurface,row.clientId,row.targetOrganizationId,row.reason,row.issuedAt,row.expiresAt,JSON.stringify(row.allowedCapabilities),JSON.stringify(row.deniedEffects),row.confirmationPolicy]);return normalize(result.rows[0]) },
    async get(decisionId) { const result=await queryPostgres('select * from authorization_delegation_contexts where decision_id=$1',[decisionId]);return normalize(result.rows[0]) },
    async revoke(decisionId,revokedAt) { const result=await queryPostgres("update authorization_delegation_contexts set status='revoked',revoked_at=$2 where decision_id=$1 and status='active' returning *",[decisionId,revokedAt]);return normalize(result.rows[0]) },
  })
}
function normalize(row){if(!row)return null;return{decisionId:row.decision_id,actorSubject:row.actor_subject,actorSurface:row.actor_surface,clientId:row.client_id,targetOrganizationId:row.target_organization_id,reason:row.reason,issuedAt:new Date(row.issued_at).toISOString(),expiresAt:new Date(row.expires_at).toISOString(),allowedCapabilities:row.allowed_capabilities,deniedEffects:row.denied_effects,confirmationPolicy:row.confirmation_policy,status:row.status,revokedAt:row.revoked_at?new Date(row.revoked_at).toISOString():null}}
module.exports={createPostgresDelegationContextRepository}
