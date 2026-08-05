"use strict";
const test=require("node:test"); const assert=require("node:assert/strict"); const fs=require("node:fs");
const om=require("../../core/organization-mapping/index.cjs");
test("organization mapping registries are complete, hashed, and exported with definitions",()=>{
 for(const name of ["selectorRegistry","operatorRegistry","evidenceClassificationRegistry","outcomeRegistry","authorityRegistry","relationshipRegistry","structureBehaviorRegistry","reconciliationImpactRegistry"]){const r=om[name]; assert.ok(r.hash,name); assert.equal(new Set(r.entries.map(e=>e.key)).size,r.entries.length); assert.doesNotThrow(()=>r.assertUnique()); assert.ok(r.entries.every(e=>e.status));}
 for(const key of ["oidc.claim","saml.attribute","scim.user_attribute","scim.group","scim.group_membership","ldap.attribute","ldap.distinguished_name","ldap.organizational_unit","canonical.dimension_value","canonical.structure_node","canonical.mapping_state","source.connection"]) om.selectorRegistry.assert(key);
 for(const key of ["equals","not_equals","in","not_in","contains","contains_any","contains_all","starts_with","ends_with","exists","not_exists","before","after","between","is_descendant_of"]) om.operatorRegistry.assert(key);
 for(const bad of ["allow","assign_role","assign_permission","create_membership","modify_owner_ceiling","modify_tenant_activation","create_authorization_scope_assignment","grant_organization_wide_access","authorize_resource"]) assert.throws(()=>om.outcomeRegistry.assert(bad));
});
test("contract artifacts contain actual definitions, not placeholders",()=>{
 for(const file of fs.readdirSync("contracts/organization-mapping").filter(f=>f.endsWith(".json"))){const json=JSON.parse(fs.readFileSync(`contracts/organization-mapping/${file}`,"utf8")); assert.ok(Array.isArray(json.entries),file); assert.ok(json.entries.length,file); assert.ok(json.hash,file);}
});
