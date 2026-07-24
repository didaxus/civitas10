const test = require('node:test');
const assert = require('node:assert/strict');
const { createInMemoryIdentityFederationRepository } = require('../identity/identityFederationRepository');
const { registerIdentityFederationRoutes, REASON } = require('../identity/identityFederationHandlers');

function registry(){ const routes=[]; const add=(method)=>(path, _policy, ...handlers)=>routes.push({method,path,handler:handlers.at(-1)}); return { routes, get:add('GET'), post:add('POST'), put:add('PUT'), delete:add('DELETE') }; }
function req({ org='org-A', body={}, headers={} }={}) { return { params:{organizationId:org}, body, user:{id:'user-1'}, get:(n)=>headers[n]||headers[n.toLowerCase()] }; }
function res(){ return { code:200, payload:null, status(c){this.code=c; return this}, json(p){this.payload=p; return this} }; }

test('registers owner and tenant identity federation route contracts', () => {
  const secureRoute = registry();
  registerIdentityFederationRoutes({ secureRoute, requireSafeOrganizationIdParam: (_req,_res,next)=>next?.(), ownerMiddleware: [], tenantMiddleware: [], repository: createInMemoryIdentityFederationRepository() });
  const paths = new Set(secureRoute.routes.map(r => `${r.method} ${r.path}`));
  for (const path of [
    'GET /owner/organizations/:organizationId/identity/connections',
    'POST /owner/organizations/:organizationId/identity/connections',
    'POST /owner/organizations/:organizationId/identity/connections/:connectionId/activate',
    'GET /o/:organizationId/identity/connection',
    'POST /o/:organizationId/identity/role-mappings',
    'PUT /o/:organizationId/identity/provisioning-policy',
    'GET /o/:organizationId/identity/reconciliation-runs/:runId'
  ]) assert.ok(paths.has(path), path);
});

test('mutations require optimistic concurrency and redact secrets from response/audit/outbox', async () => {
  const repository = createInMemoryIdentityFederationRepository();
  const secureRoute = registry();
  registerIdentityFederationRoutes({ secureRoute, requireSafeOrganizationIdParam: (_req,_res,next)=>next?.(), ownerMiddleware: [], tenantMiddleware: [], repository });
  const create = secureRoute.routes.find(r => r.method === 'POST' && r.path === '/owner/organizations/:organizationId/identity/connections').handler;
  const missing = res();
  await create(req({ body:{ protocol:'oidc', providerKind:'generic', name:'SSO', issuer:'https://idp', clientSecret:'super-secret' } }), missing);
  assert.equal(missing.code, 428);
  assert.equal(missing.payload.reasonCode, REASON.VERSION_REQUIRED);
  const ok = res();
  await create(req({ body:{ expectedVersion:0, protocol:'oidc', providerKind:'generic', name:'SSO', issuer:'https://idp', clientSecret:'super-secret' }, headers:{'idempotency-key':'idem-1'} }), ok);
  assert.equal(ok.code, 201);
  assert.equal(ok.payload.result.clientSecret, undefined);
  assert.equal(repository.outbox[0].payload.clientSecret, undefined);
  assert.equal(repository.audits.length, 1);
  const replay = res();
  await create(req({ body:{ expectedVersion:0 }, headers:{'idempotency-key':'idem-1'} }), replay);
  assert.deepEqual(replay.payload, ok.payload);
});
