import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const evidencePath = path.join(root, 'artifacts/planning/p3-019-gate-evidence.json');
const mode = process.argv[2] || 'check';
const requiredScenarios = [
  'two_org_allow_deny_no_leakage','authn_audience_tenant','role_path','owner_ceiling','tenant_activation','policies','data_scope','module_lifecycle_health','replay_jti','idempotency_replay_conflict','stale_etag','approved_mutation_denial','timeout_unavailable_incompatible_circuit_open_recovery','ui_degraded_fallback_states','remote_bundle_failure'
];
const requiredSurfaces = ['openapi','private_runtime_schema','generated_clients','backend_routes_actions_services','frontend_routes_actions_screens','planning_events'];
const activationEvidence = ['contracts','consumers','tests','deployment','observability','rollback'];
const hashInputs = {
  openapi: ['contracts/openapi/civitas-api.yaml','contracts/openapi/common/parameters.yaml','contracts/openapi/common/responses.yaml','contracts/openapi/common/schemas.yaml','contracts/openapi/common/security.yaml'],
  private_runtime_schema: ['contracts/federation/planning-runtime/v1/schema.json','backend/planning/infrastructure/runtimeContractV1.js','backend/planning/application/dtos.js'],
  generated_clients: ['contracts/modules/generated/module-catalog-v2.inventory.json','contracts/modules/generated/module-catalog-v2.types.ts','artifacts/module-ui/module-ui-contributions.inventory.json'],
  backend_routes_actions_services: ['backend/planning/application/remotePort.js','backend/planning/presentation/problemMapper.js','backend/planning/infrastructure/transportAdapter.js','backend/services/moduleAvailabilityResolver.js','backend/services/moduleControlPlane.js'],
  frontend_routes_actions_screens: ['frontend/src/navigation/route-catalog.ts','frontend/src/navigation/route-builders.ts','frontend/src/authorization/registry/define-actions.ts','frontend/src/module-ui/loader/fallbackStates.ts','frontend/src/module-ui/loader/ModuleUiErrorBoundary.tsx'],
  planning_events: ['contracts/integration/integration-event-registry.json','contracts/integration/integration-event-v1.schema.json','docs/architecture/module-event-contracts.md']
};
function fail(message){ console.error(`P3-019 gate failed: ${message}`); process.exitCode = 1; }
function sha(files){ const h=crypto.createHash('sha256'); for(const f of files){ const p=path.join(root,f); if(!fs.existsSync(p)){ fail(`missing parity input ${f}`); continue; } h.update(`\n-- ${f} --\n`); h.update(fs.readFileSync(p)); } return h.digest('hex'); }
function currentHashes(){ return Object.fromEntries(Object.entries(hashInputs).map(([k,v])=>[k,{ algorithm:'sha256', files:v, hash:sha(v)}])); }
if(!fs.existsSync(evidencePath)){ fail(`missing ${path.relative(root,evidencePath)}`); process.exit(1); }
const evidence = JSON.parse(fs.readFileSync(evidencePath,'utf8'));
for(const id of requiredScenarios){ const row=evidence.scenarios?.find(s=>s.id===id); if(!row) fail(`missing scenario ${id}`); else if(row.status !== 'active' && row.status !== 'blocked') fail(`scenario ${id} must be active or blocked, not ${row.status}`); }
for(const surface of requiredSurfaces){ const row=evidence.parity?.[surface]; if(!row) fail(`missing parity surface ${surface}`); else if(row.hash !== currentHashes()[surface].hash) fail(`hash drift for ${surface}: expected ${currentHashes()[surface].hash}, found ${row.hash}`); }
for(const entry of [...(evidence.scenarios||[]), ...(evidence.activationEntries||[])]){
  if(entry.status === 'active') for(const key of activationEvidence) if(entry.evidence?.[key] !== 'pass') fail(`active entry ${entry.id} lacks passing ${key} evidence`);
}
if(!/without data deletion/i.test(evidence.rollback?.principle||'')) fail('rollback principle must document rollback without data deletion');
if(!evidence.canary?.stages?.length) fail('missing canary stages');
if(!process.exitCode) console.log(`P3-019 ${mode} passed with ${requiredScenarios.length} scenarios and ${requiredSurfaces.length} parity hashes`);
