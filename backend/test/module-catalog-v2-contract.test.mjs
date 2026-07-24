import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repo = (p) => resolve(REPO_ROOT, p);
import { loadCatalog, validateCatalog, inventoryBytes, generateTypes, assertTransition } from '../../scripts/modules/module-catalog-v2.mjs';

const valid = () => JSON.parse(JSON.stringify(loadCatalog()));
const errors = (c) => validateCatalog(c).map((e) => e.code);

test('valid catalog has exactly eleven deterministic modules', () => {
  const c = valid();
  assert.deepEqual(errors(c), []);
  assert.equal(c.modules.length, 11);
  assert.deepEqual(c.modules.map((m) => m.id), ['analytics','community','crm','hr','lms','marketing','payments','planning','reports','scheduling','support']);
  assert.equal(c.modules.find((m) => m.id === 'planning').deploymentMode, 'federated');
  assert.ok(c.modules.filter((m) => m.id !== 'planning').every((m) => m.status === 'planned' && m.deploymentMode === 'embedded'));
});

test('valid embedded, federated planning, ownership, dependencies and contributions pass', () => {
  const c = valid();
  assert.equal(c.modules.find((m) => m.id === 'lms').deploymentMode, 'embedded');
  const planning = c.modules.find((m) => m.id === 'planning');
  assert.equal(planning.status, 'planned');
  assert.equal(planning.federated.runtimeContractVersion, 'civitas-module-runtime/v1');
  assert.equal(planning.federated.serviceIdentityRequired, true);
  assert.equal(new Set(c.modules.map((m) => m.ownership.businessOwner)).size, 11);
});

test('deterministic inventory and hash are reproducible', () => {
  const c = valid();
  const a = inventoryBytes(c); const b = inventoryBytes(c);
  assert.equal(a, b);
  assert.equal(createHash('sha256').update(a).digest('hex'), readFileSync(repo('contracts/modules/generated/module-catalog-v2.inventory.sha256'),'utf8').trim());
  assert.equal(generateTypes(c), readFileSync(repo('contracts/modules/generated/module-catalog-v2.types.ts'),'utf8'));
});

const cases = [
  ['unknown module ID', (c) => { c.modules[0].id = 'identity'; }, 'MODULE_ID_SET'],
  ['provider inside moduleId', (c) => { c.modules[0].id = 'moodle.lms'; }, 'MODULE_PROVIDER_LEAKAGE'],
  ['missing module', (c) => { c.modules.pop(); }, 'MODULE_COUNT'],
  ['module twelve', (c) => { c.modules.push({...c.modules[0], id:'extra'}); }, 'MODULE_COUNT'],
  ['duplicate module ID', (c) => { c.modules[1].id = c.modules[0].id; }, 'MODULE_DUPLICATE_ID'],
  ['duplicate ownership', (c) => { c.modules[1].ownership.businessOwner = c.modules[0].ownership.businessOwner; }, 'MODULE_DUPLICATE_BUSINESS_OWNER'],
  ['duplicate capability', (c) => { c.modules[1].capabilities = [c.modules[0].capabilities[0]]; }, 'MODULE_DUPLICATE_CAPABILITY'],
  ['bad capability prefix', (c) => { c.modules[0].capabilities = ['crm.bad']; }, 'MODULE_CAPABILITY_PREFIX'],
  ['unknown deployment mode', (c) => { c.modules[0].deploymentMode = 'remote'; }, 'MODULE_UNKNOWN_DEPLOYMENT_MODE'],
  ['unknown status', (c) => { c.modules[0].status = 'installed'; }, 'MODULE_UNKNOWN_STATUS'],
  ['bad SemVer', (c) => { c.modules[0].version = 'v1'; }, 'MODULE_SEMVER'],
  ['unknown dependency', (c) => { c.modules[0].dependencies = [{ moduleId:'missing' }]; }, 'MODULE_DEPENDENCY_UNKNOWN'],
  ['duplicate alias', (c) => { c.modules.find(m=>m.id==='payments').compatibility.aliases.push({ from:'billing', to:'payments', status:'temporary', removalRequires:'zero-consumer-evidence' }); }, 'MODULE_ALIAS_DUPLICATE'],
  ['alias with ambiguous ownership', (c) => { c.modules.find(m=>m.id==='analytics').compatibility.aliases = [{ from:'legacy-analytics', to:'payments', status:'temporary', removalRequires:'zero-consumer-evidence' }]; }, 'MODULE_ALIAS_AMBIGUOUS_OWNERSHIP'],
  ['invalid alias status', (c) => { c.modules.find(m=>m.id==='payments').compatibility.aliases[0].status = 'active'; }, 'MODULE_ALIAS_INVALID_STATUS'],
  ['literal newline in JSON string', (c) => { c.modules[0].businessBoundary = 'line one\nline two'; }, 'MODULE_LITERAL_NEWLINE'],
  ['active without consumer evidence', (c) => { c.modules[0].status = 'active'; }, 'MODULE_ACTIVE_EVIDENCE_REQUIRED'],
  ['self dependency', (c) => { c.modules[0].dependencies = [{ moduleId:c.modules[0].id }]; }, 'MODULE_DEPENDENCY_SELF'],
  ['direct cycle', (c) => { c.modules[0].dependencies=[{moduleId:c.modules[1].id}]; c.modules[1].dependencies=[{moduleId:c.modules[0].id}]; }, 'MODULE_DEPENDENCY_CYCLE'],
  ['indirect cycle', (c) => { c.modules[0].dependencies=[{moduleId:c.modules[1].id}]; c.modules[1].dependencies=[{moduleId:c.modules[2].id}]; c.modules[2].dependencies=[{moduleId:c.modules[0].id}]; }, 'MODULE_DEPENDENCY_CYCLE'],
  ['unknown contribution type', (c) => { c.modules.find(m=>m.id==='planning').contributions[0].type='loader'; }, 'MODULE_CONTRIBUTION_TYPE'],
  ['bad contribution ref', (c) => { c.modules.find(m=>m.id==='planning').contributions[0].version='1'; }, 'MODULE_CONTRIBUTION_REF'],
  ['federated without runtimeContractVersion', (c) => { delete c.modules.find(m=>m.id==='planning').federated.runtimeContractVersion; }, 'MODULE_FEDERATED_REQUIRED'],
  ['federated without audience', (c) => { delete c.modules.find(m=>m.id==='planning').federated.audience; }, 'MODULE_FEDERATED_REQUIRED'],
  ['federated without UI contract', (c) => { delete c.modules.find(m=>m.id==='planning').federated.uiContractVersion; }, 'MODULE_FEDERATED_REQUIRED'],
  ['federated service identity false', (c) => { c.modules.find(m=>m.id==='planning').federated.serviceIdentityRequired=false; }, 'MODULE_FEDERATED_SERVICE_IDENTITY'],
  ['embedded remote metadata', (c) => { c.modules[0].federated = c.modules.find(m=>m.id==='planning').federated; }, 'MODULE_EMBEDDED_REMOTE_METADATA'],
  ['token field', (c) => { c.modules[0].accessToken = 'redacted'; }, 'MODULE_SECRET_OR_LIVE_FIELD'],
  ['password field', (c) => { c.modules[0].password = 'redacted'; }, 'MODULE_SECRET_OR_LIVE_FIELD'],
  ['clientSecret field', (c) => { c.modules[0].clientSecret = 'redacted'; }, 'MODULE_SECRET_OR_LIVE_FIELD'],
  ['privateKey field', (c) => { c.modules[0].privateKey = 'redacted'; }, 'MODULE_SECRET_OR_LIVE_FIELD'],
  ['callback value', (c) => { c.modules[0].compatibility.note = 'callback https://example.invalid'; }, 'MODULE_SECRET_OR_LIVE_VALUE'],
  ['live provider state', (c) => { c.modules[0].liveProviderState = {}; }, 'MODULE_SECRET_OR_LIVE_FIELD'],
  ['provider canonical capability', (c) => { c.modules[0].capabilities = [`${c.modules[0].id}.ok`, 'agora.plans']; }, 'MODULE_PROVIDER_LEAKAGE'],
  ['planning active', (c) => { c.modules.find(m=>m.id==='planning').status='active'; }, 'MODULE_PLANNING_STATUS'],
  ['planning embedded', (c) => { c.modules.find(m=>m.id==='planning').deploymentMode='embedded'; }, 'MODULE_PLANNING_DEPLOYMENT'],
  ['planning runtime endpoint', (c) => { c.modules.find(m=>m.id==='planning').runtimeEndpoint='https://runtime'; }, 'MODULE_SECRET_OR_LIVE_FIELD'],
  ['planning route mount', (c) => { c.modules.find(m=>m.id==='planning').routeMount='/planning'; }, 'MODULE_SECRET_OR_LIVE_FIELD'],
  ['extra top-level field', (c) => { c.generatedAt = '2026-07-23T00:00:00Z'; }, 'MODULE_EXTRA_FIELD'],
  ['extra module field', (c) => { c.modules[0].unexpected = true; }, 'MODULE_EXTRA_FIELD'],
  ['extra contribution field', (c) => { c.modules.find(m=>m.id==='planning').contributions[0].url = 'artifact-only'; }, 'MODULE_EXTRA_FIELD']
];
for (const [name, mutate, code] of cases) test(`rejects ${name}`, () => { const c = valid(); mutate(c); assert.ok(errors(c).includes(code), `${code} not found in ${errors(c).join(',')}`); });

test('status transition rules reject and allow expected paths', () => {
  assert.deepEqual(assertTransition('proposed','planned'), []);
  assert.equal(assertTransition('proposed','active')[0].code, 'MODULE_TRANSITION_FORBIDDEN');
  assert.equal(assertTransition('removed','active')[0].code, 'MODULE_TRANSITION_FORBIDDEN');
  assert.equal(assertTransition('planned','deprecated')[0].code, 'MODULE_TRANSITION_FORBIDDEN');
  assert.equal(assertTransition('planned','active')[0].code, 'MODULE_TRANSITION_EVIDENCE_REQUIRED');
});

test('negative regression: planning is not activated and only slice OpenAPI routes are mounted', () => {
  const catalogText = readFileSync(repo('contracts/authorization/civitas-permission-catalog.yaml'), 'utf8');
  assert.equal(/namespace": "planning"[\s\S]{0,500}targetStatus": "active"/.test(catalogText), false, 'planning permissions must not be active');
  const openapi = readFileSync(repo('contracts/openapi/civitas-api.yaml'), 'utf8');
  assert.equal(/\/o\/\{organizationId\}\/planning\/(plans|profile):/i.test(openapi), true, 'planning slice routes must be mounted in OpenAPI');
  assert.equal(/\/planning\/(?!plans|profile)/i.test(openapi), false, 'non-slice planning routes must not be mounted in OpenAPI');
  const generatedInventory = readFileSync(repo('contracts/modules/generated/module-catalog-v2.inventory.json'), 'utf8');
  assert.equal(/runtimeEndpoint|routeMount|tenantBinding|healthSnapshot|secretsRef/.test(generatedInventory), false, 'inventory must not contain live runtime binding fields');
});
