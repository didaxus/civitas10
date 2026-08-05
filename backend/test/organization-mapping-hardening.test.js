"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {mapPreview,mapPublication,mapEvaluation,mapSelectorSet}=require("../organization-mapping/repository");
const {buildOrganizationGraph,buildPrimaryScopeTree,buildReconciliationWorkItems}=require("../organization-mapping/projections");

test("PostgreSQL rows map to camelCase domain objects",()=>{
  assert.equal(mapPreview({id:"p",organization_id:"o",draft_id:"d",draft_version:2,preview_digest:"pd",impact_digest:"id",graph_json:{},scope_tree_json:{},facets_json:[],created_at:"now"}).previewDigest,"pd");
  assert.equal(mapPublication({id:"p",organization_id:"o",model_hash:"mh",impact_digest:"ih",graph_json:{},scope_tree_json:{},facets_json:[],model_json:{nodes:[]},published_version:3}).publishedVersion,3);
  assert.equal(mapEvaluation({id:"e",organization_id:"o",outcome:"UNRESOLVED",reason_code:"mapping_condition_unresolved",trace_json:{}}).reasonCode,"mapping_condition_unresolved");
  assert.equal(mapSelectorSet({organization_id:"o",selector_set_id:"id",stable_key:"set",version:2,content_hash:"hash",conditions:[]}).contentHash,"hash");
});

test("projections reject invalid hierarchy while retaining cross-cutting overlays",()=>{
  assert.throws(()=>buildOrganizationGraph({nodes:[{id:"a"}],edges:[{from:"a",to:"missing",relationship:"parent_of"}]}),/mapping_structure_orphan_edge/);
  assert.throws(()=>buildOrganizationGraph({nodes:[{id:"a"},{id:"b"}],edges:[{from:"a",to:"b",relationship:"contains"}]}),/mapping_structure_relationship_unknown/);
  assert.throws(()=>buildPrimaryScopeTree({nodes:[{id:"a"},{id:"b"}],edges:[{from:"a",to:"b",relationship:"parent_of"},{from:"b",to:"a",relationship:"parent_of"}]}),/mapping_structure_root_count_invalid/);
  const tree=buildPrimaryScopeTree({nodes:[{id:"org",kind:"organization"},{id:"campus"},{id:"shift"}],edges:[{from:"org",to:"campus",relationship:"parent_of"},{from:"shift",to:"campus",relationship:"applies_to"}]});
  assert.deepEqual(tree.overlayNodeIds,["shift"]);
  assert.throws(()=>buildPrimaryScopeTree({nodes:[{id:"org",kind:"organization",status:"inactive"}],edges:[]},{forPublication:true}),/mapping_structure_inactive_target/);
});

test("reconciliation emits only actual removals and never grants access",()=>{
  const previousGraph={nodes:[{id:"a"},{id:"b"}],edges:[{from:"a",to:"b",relationship:"parent_of"}]};
  const newGraph={nodes:[{id:"a"}],edges:[]};
  const items=buildReconciliationWorkItems({organizationId:"o",publicationId:"p",previousGraph,newGraph});
  assert.deepEqual(items.map((item)=>item.targetType),["organization_model_node","organization_model_relationship"]);
  assert.ok(items.every((item)=>item.grantsAccess===false));
});

test("forward hardening migration binds tenants and formal tri-state without touching assignments",()=>{
  const sql=fs.readFileSync("backend/db/migrations/0040_organization_mapping_security_hardening.sql","utf8");
  assert.match(sql,/FOREIGN KEY \(organization_id, draft_id\)/);
  assert.match(sql,/outcome IN \('MATCH','NO_MATCH','UNRESOLVED'\)/);
  assert.match(sql,/subject_id TEXT NOT NULL/);
  assert.doesNotMatch(sql,/(INSERT INTO|UPDATE|ALTER TABLE) authorization_scope_assignments/i);
});

test("production composition mounts PostgreSQL-backed router with canonical authorization pipeline",()=>{
  const source=fs.readFileSync("backend/index.js","utf8");
  assert.match(source,/createPostgresOrganizationMappingRepository/);
  assert.match(source,/app\.use\("\/api\/v1", organizationMappingRouter\)/);
  assert.match(source,/requireOrganizationAccess[\s\S]*requireOrg[\s\S]*requirePermission\(permission\)[\s\S]*requireAuthorization/);
  assert.doesNotMatch(source,/createInMemoryOrganizationMappingRepository/);
});
