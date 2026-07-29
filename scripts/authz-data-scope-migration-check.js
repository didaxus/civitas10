"use strict";
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const migration0016 = fs.readFileSync(path.join(root, "backend/db/migrations/0016_authorization_scope_assignments_contract.sql"), "utf8");
const migration0010to0016 = ["0010_authz_data_scopes.sql", "0013_membership_role_bound_scope_subject.sql", "0014_scope_templates.sql", "0016_authorization_scope_assignments_contract.sql"].map((f) => fs.readFileSync(path.join(root, "backend/db/migrations", f), "utf8")).join("\n");
const checks = [/status in \('scheduled','active','expired','revoked','invalidated'\)/i, /add column if not exists membership_id/i, /add column if not exists canonical_role_id/i, /authorization_scope_assignments_exactly_one_target_ck/i, /authorization_scope_assignments_membership_role_idx/i, /where scope_kind = 'resource' and status in \('scheduled','active'\)/i];
for (const check of checks) if (!check.test(migration0010to0016)) { console.error(`data scope migration check failed: ${check}`); process.exit(1); }
for (const bad of [/create table if not exists authorization_scope_assignments/i, /where state = 'active'/i, /\bstate\s+text\b/i]) if (bad.test(migration0016)) { console.error(`0016 contains forbidden incompatible schema pattern: ${bad}`); process.exit(1); }

async function runRealPostgresCheck() {
  const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) { console.log("data scope migration check passed (static); set TEST_DATABASE_URL for real PostgreSQL checks"); return; }
  const { Client } = require("pg"); const client = new Client({ connectionString: url }); await client.connect();
  const migrationDir = path.join(root, "backend/db/migrations");
  const files = ["0008_authz_taxonomy.sql","0009_authz_units.sql","0010_authz_data_scopes.sql","0013_membership_role_bound_scope_subject.sql","0014_scope_templates.sql","0016_authorization_scope_assignments_contract.sql","0024_data_scope_taxonomy_reconciliation_plan.sql","0025_data_scope_taxonomy_v2.sql","0026_data_scope_assignment_governance.sql","0027_authorization_delegation_contexts.sql"];
  const apply = async (names) => { for (const file of names) await client.query(fs.readFileSync(path.join(migrationDir,file),"utf8")); };
  const reset = async () => client.query("drop schema if exists authz_scope_migration_check cascade; create schema authz_scope_migration_check; set search_path to authz_scope_migration_check, public; create extension if not exists pgcrypto");
  try {
    await reset(); await apply(files); await assertContract(client,"empty schema -> v2");
    await reset(); await apply(files.slice(0,6));
    await seedV1UpgradeFixture(client);
    await apply(files.slice(6,8));
    let blocked=false; try { await client.query(fs.readFileSync(path.join(migrationDir,files[8]),"utf8")); } catch(error) { blocked=/data_scope_assignment_v2_reconciliation_required/.test(error.message); }
    if(!blocked) throw new Error("v1 assignment without template mapping did not block migration");
    await client.query("delete from authorization_scope_assignments where membership_id='unmapped-membership'");
    await apply(files.slice(8)); await assertContract(client,"v1 governed assignment -> v2");
    await apply(files.slice(6)); await assertContract(client,"second execution is idempotent");
    await client.query("begin"); await client.query("update authorization_scope_assignments set reason='rollback-probe' where membership_id='mapped-membership'"); await client.query("rollback");
    const rollback=await client.query("select reason from authorization_scope_assignments where membership_id='mapped-membership'"); if(rollback.rows[0]?.reason==='rollback-probe')throw new Error("rollback did not restore assignment");
  } finally { await client.query("drop schema if exists authz_scope_migration_check cascade").catch(()=>{}); await client.end(); }
}
async function seedV1UpgradeFixture(client) {
  await client.query("insert into taxonomy_dimension_definitions(id,dimension_key,display_name,value_kind,contract_version) values('00000000-0000-0000-0000-000000000001','organization.campus','Campus','enumeration','v1') on conflict do nothing");
  await client.query("insert into organization_dimension_values(id,logto_organization_id,dimension_definition_id,dimension_key_cache,stable_key,display_name,status,created_by_logto_user_id,updated_by_logto_user_id) values('00000000-0000-0000-0000-000000000101','org1','00000000-0000-0000-0000-000000000001','organization.campus','campus','Campus','active','admin','admin')");
  await client.query("insert into owner_scope_templates(id,version,capability,strategy,allowed_target_kinds,allowed_dimension_keys,allowed_relationship_keys,allowed_role_keys,lifecycle,data_scope_semantics_version) values('test-template','v2','lms','organization','[\"dimension\"]','[\"organization.campus\"]','[]','[\"cr1\"]','published','v2')");
  const cols="logto_organization_id,logto_user_id,membership_id,logto_role_id,canonical_role_id,scope_template_id,scope_template_version,capability,scope_kind,dimension_key,dimension_value_id,source_type,source_version,status,assigned_by_logto_user_id,reason,valid_from";
  await client.query(`insert into authorization_scope_assignments(${cols}) values ('org1','u1','mapped-membership','r1','cr1','test-template','v2','lms','dimension','organization.campus','00000000-0000-0000-0000-000000000101','explicit','v1','active','admin','mapped',now()),('org1','u2','unmapped-membership','r1','cr1',null,null,'lms','dimension','organization.campus','00000000-0000-0000-0000-000000000101','explicit','v1','active','admin','unmapped',now())`);
}
async function assertContract(client, label) {
  await client.query("delete from authorization_scope_assignments where membership_id in ('m1','m2','m3','m4','m5')");
  const columns = await client.query("select column_name from information_schema.columns where table_schema='authz_scope_migration_check' and table_name='authorization_scope_assignments'");
  const names = new Set(columns.rows.map((r) => r.column_name));
  for (const col of ["status", "membership_id", "canonical_role_id", "scope_template_id", "scope_template_version", "strategy_id", "target", "provenance", "snapshot_version"]) if (!names.has(col)) throw new Error(`${label}: missing ${col}`);
  const indexes = await client.query("select indexdef from pg_indexes where schemaname='authz_scope_migration_check' and tablename='authorization_scope_assignments'");
  if (!indexes.rows.some((r) => /status IN \('scheduled', 'active'\)|status = ANY/i.test(r.indexdef))) throw new Error(`${label}: indexes do not use status`);
  await client.query("insert into taxonomy_dimension_definitions(id, dimension_key, display_name, value_kind, contract_version) values ('00000000-0000-0000-0000-000000000001','organization.campus','Campus','stable_id','2026-07-civitas-data-scope-dimensions-v2') on conflict do nothing");
  await client.query("insert into organization_dimension_values(id, logto_organization_id, dimension_definition_id, dimension_key_cache, stable_key, display_name, status, created_by_logto_user_id, updated_by_logto_user_id) values ('00000000-0000-0000-0000-000000000101','org1',(select id from taxonomy_dimension_definitions where dimension_key='organization.campus'),'organization.campus','c1','Campus','active','admin','admin') on conflict do nothing");
  await client.query("insert into owner_scope_templates(id,version,capability,strategy,allowed_target_kinds,allowed_dimension_keys,allowed_relationship_keys,allowed_role_keys,lifecycle,data_scope_semantics_version) values ('test-template','v2','lms','organization','[\"dimension\"]','[\"organization.campus\"]','[]','[\"cr1\"]','published','v2') on conflict do nothing");
  const base = "logto_organization_id, logto_user_id, membership_id, logto_role_id, canonical_role_id, scope_template_id, scope_template_version, strategy_id, target, provenance, snapshot_version, capability, scope_kind, dimension_key, dimension_value_id, source_type, source_version, status, assigned_by_logto_user_id, reason, valid_from";
  const assignmentValues = (user, membership, status, validFrom = "now()") => `('org1','${user}','${membership}','r1','cr1','test-template','v2','organization','{"kind":"dimension"}','{"sourceType":"explicit"}',1,'lms','dimension','organization.campus','00000000-0000-0000-0000-000000000101','explicit','v1','${status}','admin','test',${validFrom})`;
  await client.query(`insert into authorization_scope_assignments(${base}) values ${assignmentValues("u1","m1","scheduled","now()+interval '1 day'")}`);
  await client.query(`insert into authorization_scope_assignments(${base}) values ${assignmentValues("u1","m2","active")}`);
  await client.query(`insert into authorization_scope_assignments(${base}) values ${assignmentValues("u1","m3","revoked")}`);
  await client.query(`insert into authorization_scope_assignments(${base}) values ${assignmentValues("u1","m4","expired")}`);
  await client.query(`insert into authorization_scope_assignments(${base}) values ${assignmentValues("u2","m5","active")}`);
  await client.query(`insert into authorization_scope_assignments(${base}) values ${assignmentValues("u2","m5","revoked")}`);
  const roundTrip = await client.query("select strategy_id,target,provenance,snapshot_version from authorization_scope_assignments where membership_id='m2'");
  if (roundTrip.rows[0]?.strategy_id !== "organization" || roundTrip.rows[0]?.target?.kind !== "dimension" || roundTrip.rows[0]?.provenance?.sourceType !== "explicit" || Number(roundTrip.rows[0]?.snapshot_version) !== 1) throw new Error(`${label}: governed assignment round-trip failed`);
  let rejected = false; try { await client.query(`insert into authorization_scope_assignments(${base}) values ${assignmentValues("u2","m5","scheduled")}`); } catch { rejected = true; }
  if (!rejected) throw new Error(`${label}: duplicate active/scheduled assignment was accepted`);
  const { createPostgresDelegationContextRepository } = require("../backend/authorization/delegation/delegationContextRepository");
  const delegationRepository = createPostgresDelegationContextRepository({ queryPostgres: (sql, params) => client.query(sql, params) });
  await delegationRepository.insert({ decisionId: "delegation-check", actorSubject: "actor", actorSurface: "owner", clientId: "client", targetOrganizationId: "org1", reason: "ticket", issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now()+300000).toISOString(), allowedCapabilities: ["lms.groups"], deniedEffects: ["write"], confirmationPolicy: "confirm-sensitive" }).catch((error) => { if (error.code !== "23505") throw error; });
  const delegation = await delegationRepository.get("delegation-check");
  if (delegation?.status !== "active" || delegation?.allowedCapabilities?.[0] !== "lms.groups" || delegation?.deniedEffects?.[0] !== "write") throw new Error(`${label}: delegation context repository round-trip failed`);
}
runRealPostgresCheck().catch((e) => { console.error(e); process.exit(1); });
