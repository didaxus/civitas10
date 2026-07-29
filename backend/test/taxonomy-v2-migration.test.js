"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createTaxonomyV2MigrationService } = require("../taxonomy/taxonomyV2MigrationService");
function repository(seed) {
  let values = structuredClone(seed.values), assignments = structuredClone(seed.assignments || []); const evidence = new Map();
  const clone = x => structuredClone(x);
  const repo = {
    async listValues({ organizationId }) { return clone(values.filter(v => v.logtoOrganizationId === organizationId)); },
    async listAssignments({ organizationId }) { return clone(assignments.filter(v => v.logtoOrganizationId === organizationId)); },
    async transaction(fn) { return fn(repo); },
    async updateValue(id, patch) { const i=values.findIndex(v=>v.id===id); values[i]={...values[i],...clone(patch)}; return clone(values[i]); },
    async insertValue(row) { const saved={id:`new-${values.length}`,...clone(row)}; values.push(saved); return clone(saved); },
    async updateAssignment(id, patch) { const i=assignments.findIndex(v=>v.id===id); assignments[i]={...assignments[i],...clone(patch)}; return clone(assignments[i]); },
    async snapshotTenant(organizationId) { return { values: clone(values.filter(v=>v.logtoOrganizationId===organizationId)), assignments: clone(assignments.filter(v=>v.logtoOrganizationId===organizationId)) }; },
    async restoreTenant(organizationId, snapshot) { values=values.filter(v=>v.logtoOrganizationId!==organizationId).concat(clone(snapshot.values)); assignments=assignments.filter(v=>v.logtoOrganizationId!==organizationId).concat(clone(snapshot.assignments)); },
    async saveMigrationEvidence(row) { evidence.set(`${row.organizationId}:${row.migrationId}`,clone(row)); },
    async getMigrationEvidence(org,id) { return clone(evidence.get(`${org}:${id}`)); },
    dump() { return { values: clone(values), assignments: clone(assignments) }; }
  }; return repo;
}
const legacy=(org,id,key="primary",name="Primary")=>({id,logtoOrganizationId:org,dimensionKeyCache:"academic.section",stableKey:key,displayName:name,status:"active",metadata:{}});
test("dry-run requires explicit mappings and reports collisions without mutation", async()=>{const repo=repository({values:[legacy("a","v1"),{...legacy("a","v2","primary","Different"),dimensionKeyCache:"academic.stage"}]}); const service=createTaxonomyV2MigrationService({repository:repo}); const missing=await service.migrate({organizationId:"a",decisions:{}}); assert.equal(missing.status,"migration_required"); const collision=await service.migrate({organizationId:"a",decisions:{v1:{targetDimensionKey:"academic.stage"}}}); assert.equal(collision.status,"collision"); assert.equal(repo.dump().values[0].status,"active");});
test("apply is tenant-isolated, migrates assignments, is idempotent, and rollback restores evidence snapshot",async()=>{const repo=repository({values:[legacy("a","v1"),legacy("b","v-other")],assignments:[{id:"asg",logtoOrganizationId:"a",dimensionKey:"academic.section",dimensionValueId:"v1",metadata:{}},{id:"other",logtoOrganizationId:"b",dimensionKey:"academic.section",dimensionValueId:"v-other",metadata:{}}]}); const service=createTaxonomyV2MigrationService({repository:repo,clock:()=>"2026-07-29T00:00:00Z"}); const input={organizationId:"a",migrationId:"run-1",dryRun:false,decisions:{v1:{targetDimensionKey:"academic.stage"}}}; const applied=await service.migrate(input); assert.equal(applied.status,"applied"); assert.equal(repo.dump().values.find(v=>v.id==="v1").status,"archived"); assert.equal(repo.dump().assignments.find(a=>a.id==="asg").dimensionKey,"academic.stage"); assert.equal(repo.dump().values.find(v=>v.id==="v-other").status,"active"); assert.equal((await service.migrate(input)).idempotentReplay,true); const rolled=await service.rollback({organizationId:"a",migrationId:"run-1"}); assert.equal(rolled.status,"rolled_back"); assert.equal(repo.dump().values.find(v=>v.id==="v1").status,"active"); assert.equal(repo.dump().assignments.find(a=>a.id==="asg").dimensionKey,"academic.section");});
