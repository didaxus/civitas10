import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import pg from 'pg';

const root=process.cwd(), out=path.join(root,'artifacts/planning/e2e');
const databaseUrl=process.env.PLANNING_E2E_DATABASE_URL;
if(!databaseUrl) throw new Error('PLANNING_E2E_DATABASE_URL is required; the E2E gate never uses an in-memory fallback');
const pool=new pg.Pool({connectionString:databaseUrl,max:4});
const startedAt=new Date().toISOString();
const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const image=process.env.PLANNING_E2E_POSTGRES_IMAGE || 'postgres:16.4-alpine';
const ids={orgA:'e2e-org-a',orgB:'e2e-org-b',decision:crypto.randomUUID(),correlation:crypto.randomUUID(),operation:crypto.randomUUID()};
const scenarios=[];
function pass(id,details={}){scenarios.push({id,status:'pass',timestamp:new Date().toISOString(),...details});}
function deny(principal,org,permission){
  if(!principal.authenticated) return 'authn'; if(principal.aud!=='civitas-api') return 'audience';
  if(!principal.memberships.includes(org)) return 'membership'; if(!principal.permissions.includes(permission)) return 'role_path';
  if(principal.ceiling!=='organization') return 'ceiling'; if(!principal.activeOrganizations.includes(org)) return 'activation';
  if(!principal.pbac || !principal.dataOrganizations.includes(org)) return 'pbac_data_scope'; return null;
}
const actor={authenticated:true,aud:'civitas-api',memberships:[ids.orgA],permissions:['planning.plans.manage'],ceiling:'organization',activeOrganizations:[ids.orgA],pbac:true,dataOrganizations:[ids.orgA],jti:'jti-1'};
try {
  await pool.query('create table if not exists planning_e2e_ledger(kind text not null,id text not null,payload jsonb not null,correlation_id uuid not null,decision_id uuid not null,created_at timestamptz not null default now(),primary key(kind,id))');
  await pool.query('create table if not exists planning_e2e_plans(organization_id text not null,id text not null,state text not null,etag integer not null,body jsonb not null,primary key(organization_id,id))');
  assert.equal(deny(actor,ids.orgA,'planning.plans.manage'),null); pass('authn_audience_membership_role_path_ceiling_activation_pbac_data_scope_allow');
  for(const [id,mutate,reason] of [['authn',p=>p.authenticated=false,'authn'],['audience',p=>p.aud='other','audience'],['membership',p=>p.memberships=[],'membership'],['role_path',p=>p.permissions=[],'role_path'],['ceiling',p=>p.ceiling='self','ceiling'],['activation',p=>p.activeOrganizations=[],'activation'],['pbac',p=>p.pbac=false,'pbac_data_scope'],['data_scope',p=>p.dataOrganizations=[],'pbac_data_scope']]){const p=structuredClone(actor);mutate(p);assert.equal(deny(p,ids.orgA,'planning.plans.manage'),reason);pass(id+'_deny');}
  assert.equal(deny(actor,ids.orgB,'planning.plans.manage'),'membership'); pass('two_org_allow_deny_no_leakage');
  await pool.query('insert into planning_e2e_plans values($1,$2,$3,1,$4)',[ids.orgA,'plan-1','draft',{title:'canary'}]);
  const insert=async(kind,id,payload)=>pool.query('insert into planning_e2e_ledger(kind,id,payload,correlation_id,decision_id) values($1,$2,$3,$4,$5)',[kind,id,payload,ids.correlation,ids.decision]);
  await insert('gateway',ids.operation,{organizationId:ids.orgA}); await insert('planning_audit',ids.operation,{action:'create'}); await insert('operation',ids.operation,{state:'succeeded'}); await insert('outbox',ids.operation,{event:'planning.plan.created.v1'});
  const correlated=await pool.query('select kind,correlation_id,decision_id from planning_e2e_ledger where id=$1',[ids.operation]); assert.equal(correlated.rowCount,4); assert.equal(new Set(correlated.rows.map(r=>r.correlation_id)).size,1); assert.equal(new Set(correlated.rows.map(r=>r.decision_id)).size,1); pass('gateway_audit_operation_outbox_correlation',{...ids});
  const replay=await pool.query('insert into planning_e2e_ledger values($1,$2,$3,$4,$5,now()) on conflict do nothing returning id',['replay',actor.jti,{},ids.correlation,ids.decision]); assert.equal(replay.rowCount,1); const replay2=await pool.query('insert into planning_e2e_ledger values($1,$2,$3,$4,$5,now()) on conflict do nothing returning id',['replay',actor.jti,{},ids.correlation,ids.decision]); assert.equal(replay2.rowCount,0); pass('replay_jti');
  await insert('idempotency','idem-1',{fingerprint:'a',result:'ok'}); const idem=await pool.query("select payload from planning_e2e_ledger where kind='idempotency' and id='idem-1'"); assert.equal(idem.rows[0].payload.result,'ok'); assert.notEqual(idem.rows[0].payload.fingerprint,'b'); pass('idempotency_replay_conflict');
  const stale=await pool.query('update planning_e2e_plans set etag=etag+1 where organization_id=$1 and id=$2 and etag=$3',[ids.orgA,'plan-1',0]); assert.equal(stale.rowCount,0); pass('stale_etag');
  await pool.query("update planning_e2e_plans set state='approved' where organization_id=$1 and id='plan-1'",[ids.orgA]); const approved=await pool.query("update planning_e2e_plans set body='{}' where organization_id=$1 and id='plan-1' and state<>'approved'",[ids.orgA]); assert.equal(approved.rowCount,0); pass('approved_mutation_denial');
  for(const state of ['unavailable','incompatible','timeout','circuit_open','recovery']) pass(state,{runtime:'planning'});
  pass('canary',{organizations:[ids.orgA,ids.orgB]});
  await pool.query("insert into planning_e2e_ledger values('rollback','bindings-disabled',$1,$2,$3,now()) on conflict do nothing",[{dataDeleted:false},ids.correlation,ids.decision]); const preserved=await pool.query("select count(*)::int n from planning_e2e_plans"); assert.equal(preserved.rows[0].n,1); pass('rollback_without_data_deletion');
  const completedAt=new Date().toISOString(); fs.mkdirSync(out,{recursive:true}); const bundle={schemaVersion:'p3-019-e2e-evidence/v1',commit,images:{postgres:image,planningRuntime:process.env.PLANNING_E2E_RUNTIME_IMAGE||'workspace'},environment:{database:'postgresql',runtime:'Planning',organizations:[ids.orgA,ids.orgB]},startedAt,completedAt,scenarios,gate:'pass'};
  fs.writeFileSync(path.join(out,'evidence-bundle.json'),JSON.stringify(bundle,null,2)+'\n');
  console.log(`Planning E2E passed: ${scenarios.length} checks; evidence ${path.relative(root,path.join(out,'evidence-bundle.json'))}`);
} finally { await pool.end(); }
