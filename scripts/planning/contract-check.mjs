import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
const ROOT=process.cwd();
const readJson=(file)=>JSON.parse(fs.readFileSync(path.join(ROOT,file),'utf8'));
const pointer=(doc,ref)=>ref.slice(2).split('/').reduce((v,key)=>v?.[key.replaceAll('~1','/').replaceAll('~0','~')],doc);
function assert(condition,message){if(!condition)throw new Error(message);}
function responseSchema(openapi,op){const success=Object.entries(op.responses).find(([code])=>/^2/.test(code))?.[1]; const response=success?.$ref?pointer(openapi,success.$ref):success; return response?.content?.['application/json']?.schema?.$ref;}
function validateInventoryShape(schema,inventory){
 for(const key of schema.required)assert(key in inventory,`inventory missing ${key}`);
 assert(inventory.schemaVersion===schema.properties.schemaVersion.const,'inventory schemaVersion invalid');
 assert(inventory.operations.length===6,'inventory must contain exactly six operations');
 const required=schema.properties.operations.items.required;
 for(const row of inventory.operations)for(const key of required)assert(key in row,`${row.openapiOperationId||'operation'} missing ${key}`);
}
export function checkContracts({inventory:override}={}){
 const openapi=parseYaml(fs.readFileSync(path.join(ROOT,'contracts/openapi/modules/planning.yaml'),'utf8'));
 const runtime=readJson('contracts/federation/planning-runtime/v1/schema.json');
 const inventory=override||readJson('contracts/planning/operation-inventory.v1.json');
 const inventorySchema=readJson('contracts/planning/operation-inventory.v1.schema.json');
 const registry=readJson('contracts/integration/integration-event-registry.json');
 validateInventoryShape(inventorySchema,inventory);
 const seen=new Set();
 for(const row of inventory.operations){
  assert(!seen.has(row.openapiOperationId),`duplicate operation ${row.openapiOperationId}`); seen.add(row.openapiOperationId);
  const op=openapi.paths?.[row.route]?.[row.method.toLowerCase()];
  assert(op,`${row.openapiOperationId} method mismatch: ${row.method} ${row.route} missing`);
  assert(op.operationId===row.openapiOperationId,`${row.openapiOperationId} OpenAPI operationId mismatch`);
  assert(op['x-civitas-route-id']===row.action,`${row.openapiOperationId} route mismatch`);
  assert(op['x-civitas-action-id']===row.action,`${row.openapiOperationId} action mismatch`);
  assert(op['x-civitas-permission']===row.permission,`${row.openapiOperationId} permission mismatch`);
  const request=op.requestBody?.content?.['application/json']?.schema?.$ref||null;
  assert(request===row.requestSchema,`${row.openapiOperationId} request schema mismatch`);
  assert(responseSchema(openapi,op)===row.resultSchema,`${row.openapiOperationId} result schema mismatch`);
  assert(runtime.operations[row.runtimeOperation],`${row.openapiOperationId} runtime operation missing: ${row.runtimeOperation}`);
  assert(runtime.operations[row.runtimeOperation].useCase===row.applicationService,`${row.openapiOperationId} application service mismatch`);
  assert(row.action.endsWith('.read') || !row.runtimeOperation.endsWith('.get'),`${row.openapiOperationId} must use read semantics`);
  if(row.event){
   const registration=registry.events.find(event=>event.eventType===row.event); assert(registration,`${row.openapiOperationId} event missing from registry`);
   const eventSchema=readJson(path.posix.join('contracts/integration',registration.payloadSchema.$ref));
   for(const field of ['actor','correlationId','sensitivity','diff'])assert(eventSchema.required?.includes(field),`${row.event} event schema missing ${field}`);
   assert(eventSchema.$defs?.redactedDiff?.properties?.redacted?.const===true,`${row.event} diff is not safe/redacted`);
  }
 }
 assert(!openapi.paths['/o/{organizationId}/planning/plans/{planId}'].put,'plan update must expose PATCH only');
 return {operations:inventory.operations.length};
}
function run(){
 const result=checkContracts();
 const fixturesDir=path.join(ROOT,'contracts/planning/fixtures/breaking');
 for(const file of fs.readdirSync(fixturesDir)){
  const fixture=JSON.parse(fs.readFileSync(path.join(fixturesDir,file),'utf8')); const inventory=readJson('contracts/planning/operation-inventory.v1.json');
  Object.assign(inventory.operations.find(row=>row.openapiOperationId===fixture.operationId),fixture.set);
  let error; try{checkContracts({inventory});}catch(caught){error=caught}
  assert(error,`${file} was not detected as breaking`); assert(error.message.includes(fixture.expectedError),`${file} failed for unexpected reason: ${error.message}`);
 }
 console.log(`Planning contract check passed: ${result.operations} operations and ${fs.readdirSync(fixturesDir).length} breaking fixtures`);
}
if(import.meta.url===`file://${process.argv[1]}`)try{run()}catch(error){console.error(`Planning contract check failed: ${error.message}`);process.exitCode=1}
