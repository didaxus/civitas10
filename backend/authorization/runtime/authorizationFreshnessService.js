'use strict'
const { getAuthorizationEventDefinition } = require('./authorizationEvents')
function createAuthorizationFreshnessService({ versionService, cachePort, eventPort }={}){
 if(!versionService?.increment||!versionService?.getVersion||!cachePort?.invalidateOrganization||!eventPort?.publish)throw new Error('authorization freshness requires version, cache invalidation, and event ports')
 return Object.freeze({
  async invalidate({organizationId,eventType,actorUserId,aggregateId,reason=eventType}){const definition=getAuthorizationEventDefinition(eventType);if(!definition.requiresReauthorization)throw new Error('event does not invalidate authorization');const snapshot=await versionService.increment({organizationId,reason,actorUserId});await cachePort.invalidateOrganization({organizationId,throughPolicyVersion:snapshot.policyVersion});await eventPort.publish({eventType,organizationId,aggregateId,policyVersion:snapshot.policyVersion,requiresReauthorization:true});return snapshot},
  async assertCurrent({organizationId,snapshotVersion,critical=true}){let current;try{current=await versionService.getVersion(organizationId)}catch(error){if(critical){const denied=new Error('authorization_freshness_unavailable');denied.code='authorization_freshness_unavailable';throw denied}return false}if(String(snapshotVersion)!==String(current.policyVersion)){const stale=new Error('authorization_snapshot_stale');stale.code='authorization_snapshot_stale';throw stale}return true},
 })
}
module.exports={createAuthorizationFreshnessService}
