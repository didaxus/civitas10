import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const require = createRequire(import.meta.url); const root=resolve(import.meta.dirname,"..");
const { governanceOperationRegistry, moduleInventory }=require(resolve(root,"core/governance/operation-registry.cjs"));
const backend=readFileSync(resolve(root,"backend/index.js"),"utf8");
const workspace=readFileSync(resolve(root,"frontend/src/features/governance/governance-workspace-contract.ts"),"utf8");
const routes=readFileSync(resolve(root,"frontend/src/navigation/routes.ts"),"utf8");
const states=new Set(["planned","read-only","preview","unavailable","active"]); const errors=[];
for(const op of governanceOperationRegistry){
 if(!states.has(op.status)) errors.push(`${op.operationId}/${op.surface}: invalid status ${op.status}`);
 if(op.status==="active" && (!op.authoritativeEndpoint||!op.backendAuthorization||!op.durableRepository)) errors.push(`${op.operationId}/${op.surface}: active without endpoint, backend authorization and durable repository`);
 if(op.status!=="planned" && !backend.includes(`\"${op.expressPattern}\"`)) errors.push(`${op.operationId}/${op.surface}: endpoint is not mounted`);
}
for(const module of moduleInventory.filter(x=>x.status==="active")) for(const operationId of module.mountedOperation.split("|")) if(!governanceOperationRegistry.some(x=>x.operationId===operationId && x.status!=="planned")) errors.push(`${module.module}: missing registered operation ${operationId}`);
for(const routeKey of [...workspace.matchAll(/routeKey: \"([^\"]+)\"/g)].map(x=>x[1])) if(!routes.includes(`${routeKey}:`)) errors.push(`workspace route ${routeKey} is not registered`);
for(const field of workspace.matchAll(/(?:readOperation: "[^"]+"|writeOperations: \[[^\]]*\])/g)) for(const operationId of field[0].match(/governance\.[A-Za-z]+/g) || []) if(!governanceOperationRegistry.some(x=>x.operationId===operationId)) errors.push(`workspace operation ${operationId} is not registered`);
if(errors.length){ console.error(errors.join("\n")); process.exit(1); } console.log(`Governance coherence gate passed (${governanceOperationRegistry.length} operations, ${moduleInventory.length} capabilities).`);
