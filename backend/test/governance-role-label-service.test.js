"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { RoleLabelService, canonicalRoles, resolveEffectiveRoleLabel, normalizeRoleLabel } = require("../governance/role-labels");
class Repo{constructor(){this.globals=new Map();this.aliases=new Map();this.gv=0;this.ov=new Map();this.auditEvents=[];this.queryCount=0;} async transaction(fn){return fn(this)} async getGlobalOverrides(){this.queryCount++;return [...this.globals.values()]} async getGlobalOverride(k){return this.globals.get(k)||null} async listOrganizationAliases(o){this.queryCount++;return [...(this.aliases.get(o)||new Map()).values()]} async getOrganizationAlias(o,k){return this.aliases.get(o)?.get(k)||null} async getGlobalVersion(){return String(this.gv)} async getOrganizationVersion(o){return String(this.ov.get(o)||0)} async incrementGlobalVersion(){this.gv++;return String(this.gv)} async incrementOrganizationVersion(o){this.ov.set(o,(this.ov.get(o)||0)+1);return String(this.ov.get(o))} async upsertGlobalOverride(x){this.globals.set(x.canonicalRoleKey,{...x});return x} async deleteGlobalOverride(k){this.globals.delete(k)} async upsertOrganizationAlias(x){if(!this.aliases.has(x.organizationId))this.aliases.set(x.organizationId,new Map());this.aliases.get(x.organizationId).set(x.canonicalRoleKey,{...x});return x} async deleteOrganizationAlias(o,k){this.aliases.get(o)?.delete(k)} async audit(e){this.auditEvents.push(e);return {id:String(this.auditEvents.length),createdAt:new Date().toISOString()}}}
const roles = canonicalRoles().map((r,i)=>({id:`logto-${i}`,name:r.canonicalRoleKey}));
test("all canonical roles expose baseline presentation labels",()=>{assert.equal(canonicalRoles().length,13); for(const role of canonicalRoles()) assert.match(role.canonicalBaselineLabel,/Organization /);});
test("resolver order is organization alias, Civitas default, baseline, key",()=>{assert.equal(resolveEffectiveRoleLabel({canonicalRoleKey:"organization_teacher",canonicalBaselineLabel:"Teacher",globalOverrides:[{canonicalRoleKey:"organization_teacher",displayName:"Instructor"}],organizationAliases:[{canonicalRoleKey:"organization_teacher",displayName:"Coach"}]}).effectiveLabel,"Coach");assert.equal(resolveEffectiveRoleLabel({canonicalRoleKey:"organization_teacher",canonicalBaselineLabel:"Teacher",globalOverrides:[{canonicalRoleKey:"organization_teacher",displayName:"Instructor"}],organizationAliases:[]}).source,"civitas_default");assert.equal(resolveEffectiveRoleLabel({canonicalRoleKey:"organization_teacher",canonicalBaselineLabel:"Teacher",globalOverrides:[],organizationAliases:[]}).effectiveLabel,"Teacher");assert.equal(resolveEffectiveRoleLabel({canonicalRoleKey:"organization_teacher",canonicalBaselineLabel:"",globalOverrides:[],organizationAliases:[]}).effectiveLabel,"organization_teacher");});
test("global defaults persist in repository and aliases override without changing Logto identity",async()=>{const repo=new Repo();const svc=new RoleLabelService({repository:repo});let model=await svc.buildReadModel({organizationId:"org-a",roles,surface:"owner"});await svc.updateGlobalLabel({canonicalRoleKey:"organization_teacher",displayName:"Instructor",expectedVersion:model.globalVersion,actorLogtoUserId:"owner",reason:"test"});model=await svc.buildReadModel({organizationId:"org-a",roles,surface:"tenant"});let row=model.rows.find(r=>r.canonicalRoleKey==="organization_teacher");assert.equal(row.effectiveLabel,"Instructor");assert.equal(row.logtoRoleId,"logto-5");assert.equal(row.logtoRoleName,"organization_teacher");await svc.updateOrganizationAlias({organizationId:"org-a",canonicalRoleKey:"organization_teacher",logtoRoleIdSnapshot:"logto-5",displayName:"Academic Coach",expectedVersion:model.organizationVersion,actorLogtoUserId:"admin",reason:"test"});const a=await svc.buildReadModel({organizationId:"org-a",roles,surface:"tenant"});const b=await svc.buildReadModel({organizationId:"org-b",roles,surface:"tenant"});assert.equal(a.rows.find(r=>r.canonicalRoleKey==="organization_teacher").effectiveLabel,"Academic Coach");assert.equal(b.rows.find(r=>r.canonicalRoleKey==="organization_teacher").effectiveLabel,"Instructor");assert.equal(repo.auditEvents.length,2);assert.ok(repo.queryCount<=20);});

test("directRoleUserCount counts unique direct RBAC users only", async () => { const repo = new Repo(); const svc = new RoleLabelService({ repository: repo }); const users = [{ id: "u1", email: "u1@example.test" }, { id: "u2", email: "u2@example.test" }]; const teacher = roles.find((role) => role.name === "organization_teacher"); const model = await svc.buildReadModel({ organizationId: "org-a", roles, members: users, memberRolesByUserId: new Map([["u1", [teacher, teacher]], ["u2", []]]), surface: "tenant" }); const row = model.rows.find((item) => item.canonicalRoleKey === "organization_teacher"); assert.equal(row.directRoleUserCount, 1); assert.equal(row.assignedMemberCount, 1); });
test("stale versions and duplicate labels are rejected",async()=>{const repo=new Repo();const svc=new RoleLabelService({repository:repo});await svc.updateGlobalLabel({canonicalRoleKey:"organization_teacher",displayName:"Instructor",expectedVersion:"0"});await assert.rejects(()=>svc.updateGlobalLabel({canonicalRoleKey:"organization_student",displayName:"Learner",expectedVersion:"0"}),/changed by another administrator/);await svc.updateGlobalLabel({canonicalRoleKey:"organization_student",displayName:"Learner",expectedVersion:"1"});await assert.rejects(()=>svc.updateGlobalLabel({canonicalRoleKey:"organization_parent",displayName:"learner",expectedVersion:"2"}),/already uses/);});
test("control and bidi characters are rejected",()=>{assert.throws(()=>normalizeRoleLabel("Bad\u202ename"),/control/);assert.throws(()=>normalizeRoleLabel("!!!"),/letters or numbers/);});
test("role label service does not call Logto role rename/update APIs",()=>{const files=["roleLabelService.js","postgresRoleLabelRepository.js","effectiveRoleLabelResolver.js"].map(f=>fs.readFileSync(path.join(__dirname,"../governance/role-labels",f),"utf8")).join("\n");assert.doesNotMatch(files,/updateOrganizationRole|updateRole|rename|patchOrganizationRole|Logto Management API/i);});

test("role-name edit capabilities come from verified actor authorization context", async () => {
  const svc = new RoleLabelService({ repository: new Repo() });
  const ownerAllowed = await svc.buildReadModel({ organizationId: "org-a", roles, surface: "owner", actorAuthorizationContext: { globalRoles: ["owner_global"], permissions: ["owner.role_labels.manage"] } });
  assert.equal(ownerAllowed.rows[0].canEditGlobalDefault, true);
  assert.equal(ownerAllowed.rows[0].canEditOrganizationAlias, false);
  const ownerDenied = await svc.buildReadModel({ organizationId: "org-a", roles, surface: "owner", actorAuthorizationContext: { globalRoles: ["owner_global"], permissions: [] } });
  assert.equal(ownerDenied.rows[0].canEditGlobalDefault, false);
  const tenantAllowed = await svc.buildReadModel({ organizationId: "org-a", roles, surface: "tenant", actorAuthorizationContext: { verifiedOrganizationId: "org-a", organizationRoles: ["organization_admin"], permissions: ["org.role_aliases.manage"] } });
  assert.equal(tenantAllowed.rows[0].canEditOrganizationAlias, true);
  assert.equal(tenantAllowed.rows[0].canEditGlobalDefault, false);
  const tenantDenied = await svc.buildReadModel({ organizationId: "org-a", roles, surface: "tenant", actorAuthorizationContext: { verifiedOrganizationId: "org-a", organizationRoles: ["organization_admin"], permissions: [] } });
  assert.equal(tenantDenied.rows[0].canEditOrganizationAlias, false);
});

test("Logto read-only plan maps role-label permissions to the intended roles", () => {
  const plan = fs.readFileSync(path.join(__dirname, "../../artifacts/logto-authz-plan.json"), "utf8");
  const bundles = fs.readFileSync(path.join(__dirname, "../../contracts/authorization/civitas-role-bundles.json"), "utf8");
  const globalRoles = fs.readFileSync(path.join(__dirname, "../../core/authz/roles/global-role-permissions.js"), "utf8");
  const activeScopes = fs.readFileSync(path.join(__dirname, "../../artifacts/authorization/active-role-scopes.json"), "utf8");
  assert.match(plan, /owner\.role_labels\.manage/);
  assert.match(plan, /org\.role_aliases\.manage/);
  assert.match(plan, /owner_global/);
  assert.match(plan, /organization_admin/);
  assert.match(globalRoles, /owner_global[\s\S]*owner\.role_labels\.manage/);
  assert.match(bundles, /"organization_admin"[\s\S]*"org_governance_admin"/);
  assert.match(activeScopes, /"organization_admin"[\s\S]*"org\.role_aliases\.manage"/);
});
