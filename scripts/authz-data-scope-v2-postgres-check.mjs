#!/usr/bin/env node
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
if(!process.env.DATABASE_URL){console.error('DATABASE_URL is required for authz:data-scope-v2:postgres-check; this check never falls back to mocks.');process.exit(1);}
const {getPool,closeDatabase}=require('../backend/lib/db');
const {runSqlMigrations}=require('../backend/runtime/migrations');
const pool=getPool();
try{
  await runSqlMigrations({pool,logger:{log(){}}});
  const dimensions=await pool.query("select stable_key from taxonomy_dimensions where stable_key = any($1::text[]) order by stable_key",[['academic.grade_level','academic.school_year','academic.term','academic.term_type']]);
  if(dimensions.rowCount!==4)throw new Error('canonical v3 dimensions were not installed');
  const outcome=await pool.query("select pg_get_constraintdef(oid) definition from pg_constraint where conname='organization_mapping_evaluations_outcome_check'");
  if(!outcome.rows[0]?.definition.includes('UNRESOLVED'))throw new Error('formal tri-state persistence constraint missing');
  const fk=await pool.query("select 1 from pg_constraint where conname='organization_mapping_evaluations_tenant_snapshot_fk'");
  if(!fk.rowCount)throw new Error('tenant-bound evaluation snapshot FK missing');
  const reviewed=await pool.query("select to_regclass('organization_mapping_selector_set_versions') selector_sets,to_regclass('integration_outbox_events') shared_outbox,to_regclass('organization_mapping_outbox_events') parallel_outbox");
  if(!reviewed.rows[0].selector_sets||!reviewed.rows[0].shared_outbox||reviewed.rows[0].parallel_outbox)throw new Error('reviewed-state persistence or shared-outbox convergence missing');
  console.log('PostgreSQL organization-mapping migration check passed.');
}finally{await closeDatabase();}
