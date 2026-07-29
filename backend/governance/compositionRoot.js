"use strict";
const { createPostgresGovernanceAdapters } = require("./postgresAdapters");
const { requireGovernancePorts } = require("./ports");
const { createGovernanceRolesReadModel } = require("../services/governanceRolesReadModel");
const { createGovernanceStructureReadModel } = require("../services/governanceStructureReadModel");
const { createGovernanceOperationsReadModel } = require("../services/governanceOperationsReadModel");
const { createGovernanceReadModel } = require("../services/governanceReadModel");
function createGovernanceComposition({pool}){
 const adapters=createPostgresGovernanceAdapters({pool});
 const ports=requireGovernancePorts(adapters);
 const freshness={async invalidate(event){const policyVersion=await adapters.runtime.incrementPolicyVersion(event);await adapters.outbox.enqueue({...event,policyVersion});return {policyVersion}}};
 const roles=createGovernanceRolesReadModel({entitlementRepository:ports.entitlements,runtimeConsistencyPort:adapters.runtime,authorizationFreshnessService:freshness,auditPort:ports.audit,outboxPort:ports.outbox});
 const rawStructure=createGovernanceStructureReadModel({taxonomyRepository:ports.taxonomy,unitRepository:ports.organizationUnits,dataScopeRepository:ports.dataScope,runtimeConsistencyPort:adapters.runtime,auditPort:ports.audit,outboxPort:ports.outbox});
 const structure={...rawStructure,...Object.fromEntries(["createTaxonomyValue","publishTaxonomy","createUnit","activateUnit","createDataScope"].map(name=>[name,(input)=>adapters.transaction(()=>rawStructure[name](input))]))};
 const rateLimitPort={async consume({organizationId,actorLogtoUserId,limit,windowMs}){const since=new Date(Date.now()-windowMs);const r=await pool.query("select count(*)::int count from audit_logs where logto_organization_id=$1 and actor_logto_user_id=$2 and action='governance.access_preview.simulated' and created_at >= $3",[organizationId,actorLogtoUserId||null,since]);if(Number(r.rows[0].count)>=limit)throw Object.assign(new Error("access_preview_rate_limited"),{status:429,code:"access_preview_rate_limited"})}};
 const rawOperations=createGovernanceOperationsReadModel({policyPort:ports.aliasesNavigation,auditPort:ports.audit,rateLimitPort});
 const operations={...rawOperations,updateNavigationPreferences:(input)=>adapters.transaction(()=>rawOperations.updateNavigationPreferences(input))};
 const read=createGovernanceReadModel({roles,structure,operations});
 return Object.freeze({...roles,...structure,...operations,...read,entitlementRepository:ports.entitlements,dataScopeRepository:ports.dataScope});
}
module.exports={createGovernanceComposition};
