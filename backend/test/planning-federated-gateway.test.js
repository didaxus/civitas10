const test = require('node:test'); const assert = require('node:assert/strict');
const { createPlanningRuntimeTransportAdapter } = require('../planning/infrastructure/transportAdapter');
const { createHmacModuleExecutionContextIssuer } = require('../planning/infrastructure/moduleExecutionContext');
const { createStaticServiceIdentityProvider } = require('../planning/infrastructure/serviceIdentity');
const { createFakeFederatedPlanningRuntime } = require('../planning/testing/fakeFederatedRuntime');
const { DEFAULT_POLICY } = require('../planning/infrastructure/resiliencePolicy');
const { toRfc9457Problem } = require('../planning/presentation/problemMapper');
function deps(scenario='success'){ const fake=createFakeFederatedPlanningRuntime({ scenario }); const binding={ id:'bind-1', version:7, logtoOrganizationId:'org-A', moduleId:'planning', runtimeId:'rt-1', selectedContractVersion:'planning-runtime/v1', status:'bound', isExecutable:true, organizationModuleId:'mv-1' }; const runtime={ id:'rt-1', runtimeId:'rt-1', moduleId:'planning', runtimeContractVersion:'planning-runtime/v1', runtimeStatus:'available', serviceIdentityRequired:true, expectedAudience:'planning-runtime:test', serviceRef:{ scheme:'civitas-service', name:'planning-runtime', port:8443 }, compatibilityMetadata:{ supportedContracts:['planning-runtime/v1'] } }; const circuit=new Map(); return { fake, port:createPlanningRuntimeTransportAdapter({ runtimeBindingRepository:{ async listBindings(){return [binding]}, async getRuntimeByDatabaseId(){return runtime}, async getRuntimeByRuntimeId(){return runtime} }, compatibilityRepository:{ async getCompatibility(){return { compatibilityStatus:'compatible' }} }, moduleExecutionContextIssuer:createHmacModuleExecutionContextIssuer({ secret:'test-secret', ttlMs:30000 }), serviceIdentityProvider:createStaticServiceIdentityProvider({ identity:'spiffe://civitas/gateway', credentialVersion:'cred-v1', allowedAudiences:['planning-runtime:test'], allowedRuntimeIds:['rt-1'] }), transportClient:fake, circuitStatePort:{ async readCircuitState(q){return circuit.get(q.targetBindingId)||null}, async writeCircuitState(s){circuit.set(s.targetBindingId,s); return s;} }, logger:{ info(){}, warn(){}, error(){} }, metrics:{ increment(){} }, resiliencePolicy:{ ...DEFAULT_POLICY, totalDeadlineMs:1000, responseTimeoutMs:500, maxAttempts:2, baseBackoffMs:1 } }) }; }
function ctx(over={}){ return { organizationId:'org-A', subjectId:'sub-1', clientId:'client-1', operation:{ moduleId:'planning', capabilityId:'planning.plans', operationId:'planning.plans.create', actionId:'planning.plans.create', permission:'planning.plans.manage', executionKind:'write' }, authorizationDecision:{ decisionId:'authz-1', authorizationSnapshotVersion:'1', organizationId:'org-A' }, availabilityDecision:{ decisionId:'avail-1', version:'1', executable:true, runtimeBindingVersion:'7', compatibilityVersion:'cmp-1' }, correlationId:'corr-1', idempotency:{ key:'idem-key', requestFingerprint:'fp-1' }, deadline:new Date(Date.now()+5000).toISOString(), ...over }; }
test('PlanningRemoteApplicationPort uses named methods and maps provider-neutral DTOs through private runtime', async()=>{ const { port, fake }=deps(); assert.equal(typeof port.createPlan,'function'); assert.equal(port.execute, undefined); const res=await port.createPlan({ title:'Annual plan' }, ctx()); assert.equal(res.ok,true); assert.equal(res.value.id,'plan-1'); assert.equal(res.runtimeContractVersion,'planning-runtime/v1'); assert.equal(fake.calls[0].headers.Authorization, undefined); assert.equal(fake.calls[0].headers.Cookie, undefined); assert.equal(fake.calls[0].headers['Idempotency-Key'], 'idem-key'); });
test('forbidden idempotency and operation mismatch fail closed before network', async()=>{ const { port, fake }=deps(); const read=ctx({ operation:{ moduleId:'planning', capabilityId:'planning.plans', operationId:'planning.plans.list', actionId:'planning.plans.read', permission:'planning.plans.read', executionKind:'read' }, idempotency:{ key:'bad', requestFingerprint:'fp' }}); const res=await port.listPlans({}, read); assert.equal(res.ok,false); assert.equal(fake.calls.length,0); });
test('conflict maps to typed problem and RFC 9457 without raw remote body', async()=>{ const { port }=deps('conflict'); const c=ctx({ concurrency:{ etag:'v1' } }); const res=await port.createPlan({ title:'Annual plan' }, c); assert.equal(res.ok,false); assert.equal(res.problem.code,'planning.remote.conflict'); const pub=toRfc9457Problem(res.problem); assert.equal(pub.status,409); assert.equal(JSON.stringify(pub).includes('hostname'), false); });
test('connection reset retries bounded with same idempotency key', async()=>{ const { port, fake }=deps('connection_reset'); const res=await port.createPlan({ title:'Annual plan' }, ctx()); assert.equal(res.ok,false); assert.equal(fake.calls.length,2); assert.equal(fake.calls[0].headers['Idempotency-Key'], fake.calls[1].headers['Idempotency-Key']); });
test('wrong audience is rejected by fake runtime and normalized safely', async()=>{ const d=deps(); d.fake.setScenario('wrong_audience'); const res=await d.port.createPlan({ title:'x' }, ctx()); assert.equal(res.ok,false); assert.match(res.problem.code,/bad_gateway|authorization_context|unavailable/); });


test('execution context validates issuer runtime module contract audience and tenant server-side', async()=>{
  const { createHmacModuleExecutionContextValidator } = require('../planning/infrastructure/moduleExecutionContext');
  const { port, fake }=deps();
  const res=await port.createPlan({ title:'Annual plan', organizationId:'org-B' }, ctx({ availabilityDecision:{ decisionId:'avail-1', version:'1', executable:true, runtimeBindingVersion:'7', compatibilityVersion:'cmp-1', runtimeId:'rt-1' }}));
  assert.equal(res.ok,true);
  assert.equal(fake.calls[0].body.organizationId,'org-A');
  const validator=createHmacModuleExecutionContextValidator({ secret:'test-secret' });
  const checked=validator.validate(fake.calls[0].headers['X-Civitas-Execution-Context'], { issuer:'civitas-runtime-control-plane', organizationId:'org-A', audience:'planning-runtime:test', runtimeId:'rt-1', moduleId:'planning', contractVersion:'planning-runtime/v1', correlationId:'corr-1' });
  assert.equal(checked.ok,true);
  assert.equal(validator.validate(fake.calls[0].headers['X-Civitas-Execution-Context'], { organizationId:'org-B' }).reason,'wrong_organizationId');
});

test('user tokens and sensitive caller headers are rejected before runtime execution', async()=>{
  const { port, fake }=deps();
  const res=await port.createPlan({ title:'x' }, ctx({ accessToken:'user-token-value' }));
  assert.equal(res.ok,false);
  assert.equal(fake.calls.length,0);
});

test('runtime must be available and service identity must target configured audience/runtime', async()=>{
  const fake=createFakeFederatedPlanningRuntime(); const binding={ id:'bind-1', version:7, logtoOrganizationId:'org-A', moduleId:'planning', runtimeId:'rt-1', selectedContractVersion:'planning-runtime/v1', status:'bound', isExecutable:true, organizationModuleId:'mv-1' }; const runtime={ id:'rt-1', runtimeId:'rt-1', moduleId:'planning', runtimeContractVersion:'planning-runtime/v1', runtimeStatus:'planned', serviceIdentityRequired:true, expectedAudience:'planning-runtime:test', serviceRef:{ scheme:'civitas-service', name:'planning-runtime', port:8443 }, compatibilityMetadata:{ supportedContracts:['planning-runtime/v1'] } };
  const port=createPlanningRuntimeTransportAdapter({ runtimeBindingRepository:{ async listBindings(){return [binding]}, async getRuntimeByDatabaseId(){return runtime} }, compatibilityRepository:{ async getCompatibility(){return { compatibilityStatus:'compatible' }} }, moduleExecutionContextIssuer:createHmacModuleExecutionContextIssuer({ secret:'test-secret', ttlMs:30000 }), serviceIdentityProvider:createStaticServiceIdentityProvider({ identity:'spiffe://civitas/gateway', credentialVersion:'cred-v1', allowedAudiences:['planning-runtime:test'], allowedRuntimeIds:['rt-1'] }), transportClient:fake, circuitStatePort:{ async readCircuitState(){return null}, async writeCircuitState(s){return s;} }, logger:{ info(){}, warn(){}, error(){} }, metrics:{ increment(){} }, resiliencePolicy:{ ...DEFAULT_POLICY, totalDeadlineMs:1000, responseTimeoutMs:500, maxAttempts:1, baseBackoffMs:1 } });
  const res=await port.createPlan({ title:'Annual plan' }, ctx());
  assert.equal(res.ok,false);
  assert.equal(fake.calls.length,0);
});

test('read use cases omit idempotency headers when the contract forbids them', async()=>{
  const { port, fake }=deps();
  const read=ctx({ operation:{ moduleId:'planning', capabilityId:'planning.plans', operationId:'planning.plans.list', actionId:'planning.plans.read', permission:'planning.plans.read', executionKind:'read' }, idempotency:null });
  const res=await port.listPlans({}, read);
  assert.equal(res.ok,true);
  assert.equal(fake.calls[0].headers['Idempotency-Key'], undefined);
});

test('operation and action mismatch fail closed before network', async()=>{
  const { port, fake }=deps();
  const mismatch=ctx({ operation:{ moduleId:'planning', capabilityId:'planning.plans', operationId:'planning.plans.update', actionId:'planning.plans.read', permission:'planning.plans.manage', executionKind:'write' } });
  const res=await port.createPlan({ title:'Annual plan' }, mismatch);
  assert.equal(res.ok,false);
  assert.equal(res.problem.code,'planning.remote.authorization_context_rejected');
  assert.equal(fake.calls.length,0);
});

test('invalid runtime success payloads are mapped to redacted gateway problems', async()=>{
  const { port }=deps('schema_invalid_response');
  const res=await port.createPlan({ title:'Annual plan' }, ctx());
  assert.equal(res.ok,false);
  assert.equal(res.problem.code,'planning.remote.bad_gateway');
  assert.equal(JSON.stringify(res.problem).includes('wrong'), false);
});

test('oversized runtime responses are rejected without leaking provider payloads', async()=>{
  const { port }=deps('oversized_body');
  const res=await port.createPlan({ title:'Annual plan' }, ctx());
  assert.equal(res.ok,false);
  assert.equal(res.problem.code,'planning.remote.bad_gateway');
  assert.equal(JSON.stringify(res.problem).includes('xxxxx'), false);
});

test('replaceProfile uses PUT /profile with If-Match and typed precondition/conflict problems', async()=>{
  const { port, fake }=deps();
  assert.equal(typeof port.replaceProfile,'function');
  assert.equal(port['upsert'+'Profile'], undefined);
  const profileContext=ctx({ operation:{ moduleId:'planning', capabilityId:'planning.profile', operationId:'planning.profile.replace', actionId:'planning.profile.replace', permission:'planning.profile.manage', executionKind:'write' }, concurrency:{ etag:'profile-v1' } });
  const res=await port.replaceProfile({ planningMode:'standard', preferences:{ fiscalYearStart:'09-01' } }, profileContext);
  assert.equal(res.ok,true);
  assert.equal(fake.calls[0].method,'PUT');
  assert.equal(fake.calls[0].path,'/private/planning-runtime/v1/profile:replace');
  assert.equal(fake.calls[0].headers['If-Match'],'profile-v1');
  assert.equal(fake.calls[0].body.operation.operationId,'planning.profile.replace');

  const missing=await port.replaceProfile({ planningMode:'standard' }, ctx({ operation:profileContext.operation }));
  assert.equal(missing.ok,false);
  assert.equal(missing.problem.code,'planning.remote.precondition_required');
  assert.deepEqual(missing.problem.fieldViolations,[{ field:'If-Match', code:'required' }]);

  const conflictDeps=deps('precondition_failed');
  const stale=await conflictDeps.port.replaceProfile({ planningMode:'standard' }, profileContext);
  assert.equal(stale.ok,false);
  assert.equal(stale.problem.code,'planning.remote.precondition_failed');
  assert.equal(toRfc9457Problem(stale.problem).status,412);
});
