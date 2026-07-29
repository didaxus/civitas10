"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createInMemoryDataScopeRepository, createDataScopeAssignmentService } = require("../authorization/data-scope");

function fixture() {
  const repository = createInMemoryDataScopeRepository();
  const template = { id:"head-lms", version:"2", lifecycle:"published", capability:"lms", strategyId:"dimensions", allowedTargetKinds:["dimension"], allowedDimensionKeys:["academic.subject"], allowedRelationshipKeys:[], allowedRoleKeys:["organization_headteacher"] };
  const bindings = new Map([["tenant-a:m-a",{organizationId:"tenant-a",membershipId:"m-a",canonicalRoleId:"organization_headteacher",userId:"same-user",status:"active"}],["tenant-b:m-b",{organizationId:"tenant-b",membershipId:"m-b",canonicalRoleId:"organization_headteacher",userId:"same-user",status:"active"}]]);
  const service = createDataScopeAssignmentService({ repository, templateRegistry:{ getTemplate(){return template;},isAvailable(){return true;},getTenantConfiguration(){return{enabled:true};} }, membershipPort:{ async getMembershipRoleBinding(input){return bindings.get(`${input.organizationId}:${input.membershipId}`)||null;} }, taxonomyPort:{ async resolvePublishedDimensionValue({organizationId,valueId}){return {status:"active",value:{logtoOrganizationId:organizationId,id:valueId}};} } });
  const input=(organizationId,membershipId,valueId)=>({organizationId,userId:"same-user",membershipId,canonicalRoleId:"organization_headteacher",logtoRoleId:"logto-head",roleKey:"organization_headteacher",scopeTemplateId:template.id,scopeTemplateVersion:template.version,strategyId:template.strategyId,capability:"lms",scopeKind:"dimension",dimensionKey:"academic.subject",dimensionValueId:valueId,actorLogtoUserId:"admin"});
  return {repository,service,input};
}

test("postconditions isolate identical users by tenant and membership role path", async () => {
  const f=fixture(); await f.service.createAssignment(f.input("tenant-a","m-a","math")); await f.service.createAssignment(f.input("tenant-b","m-b","science"));
  assert.deepEqual((await f.repository.listAssignments({organizationId:"tenant-a",membershipId:"m-a",canonicalRoleId:"organization_headteacher"})).map(x=>x.dimensionValueId),["math"]);
  assert.equal((await f.repository.listAssignments({organizationId:"tenant-a",membershipId:"m-b",canonicalRoleId:"organization_headteacher"})).length,0);
  await assert.rejects(()=>f.service.createAssignment(f.input("tenant-a","missing","science")),/data_scope_membership_not_found/);
});

test("stale CAS and a failed outbox roll back assignment, version, and audit atomically", async () => {
  const f=fixture(); await assert.rejects(()=>f.service.createAssignment({...f.input("tenant-a","m-a","math"),expectedPolicyVersion:99}),/authorization_policy_version_conflict/);
  const original=f.repository.recordOutbox; f.repository.recordOutbox=async()=>{throw new Error("outbox unavailable");};
  await assert.rejects(()=>f.service.createAssignment(f.input("tenant-a","m-a","science")),/outbox unavailable/);
  assert.equal((await f.repository.listAssignments({organizationId:"tenant-a"})).length,0); assert.equal(await f.repository.getPolicyVersion("tenant-a"),1); assert.equal(f.repository.audits.length,0);
  f.repository.recordOutbox=original;
});

test("list is binding-validated and exposes cursor plus policy ETag", async () => {
  const f=fixture(); await f.service.createAssignment(f.input("tenant-a","m-a","math"));
  const page=await f.service.listAssignments({organizationId:"tenant-a",userId:"same-user",membershipId:"m-a",canonicalRoleId:"organization_headteacher",limit:1});
  assert.equal(page.assignments.length,1); assert.equal(page.etag,`\"${page.policyVersion}\"`); assert.equal(page.nextCursor,null);
  await assert.rejects(()=>f.service.listAssignments({organizationId:"tenant-a",userId:"same-user",membershipId:"missing",canonicalRoleId:"organization_headteacher"}),/data_scope_membership_not_found/);
});
