"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createAuthorizationUiDecision } = require("../organization-mapping/authorization-ui-decision");

test("authorization UI envelope preserves backend decision identity and fails closed without a snapshot", () => {
  const ready = createAuthorizationUiDecision({ decision: { allowed: true, decisionId: "decision-1", reasonCode: "authorization_allowed", authorizationSnapshotVersion: "snapshot-7", policyVersion: "policy-3" }, subjectId: "user-1", organizationId: "org-1", actionId: "organizationModel.readPublished" });
  assert.equal(ready.status, "ready"); assert.equal(ready.finalDecision, "allow"); assert.equal(ready.decisionId, "decision-1");
  const unavailable = createAuthorizationUiDecision({ decision: { allowed: true, decisionId: "decision-2", reasonCode: "authorization_allowed" }, subjectId: "user-1", organizationId: "org-1", actionId: "organizationModel.readPublished" });
  assert.equal(unavailable.status, "unavailable"); assert.equal(unavailable.finalDecision, "unresolved"); assert.equal(unavailable.treatment, "block");
});

test("authorization UI envelope deterministically hides absent RBAC potential", () => {
  const denied = createAuthorizationUiDecision({ decision: { allowed: false, decisionId: "decision-3", reasonCode: "role_permission_missing", authorizationSnapshotVersion: "snapshot-7" }, subjectId: "user-1", organizationId: "org-1", actionId: "organizationModel.readDraft" });
  assert.equal(denied.status, "ready"); assert.equal(denied.finalDecision, "deny"); assert.equal(denied.terminalStage, "rbac"); assert.equal(denied.treatment, "hide");
});

test("authorization UI stages preserve canonical policy results without role-name inference",()=>{const decision=createAuthorizationUiDecision({decision:{allowed:true,decisionId:"decision-stages",reasonCode:"authorization_allowed",authorizationSnapshotVersion:"snapshot-9",policyVersion:"policy-4",evaluatedRolePaths:[{rolePotentialDecision:{allowed:true,reasonCode:"authorization_allowed"},entitlementDecision:{allowed:true},dataScopeDecision:{allowed:true,reasonCode:"authorization_allowed",scopeAppliedByBackend:true,scopeVersion:"scope-2"},policyResults:[{policyId:"org-role-entitlement-enabled",outcome:"allow",reasonCode:"authorization_allowed"},{policyId:"authorization-data-scope-valid",outcome:"allow",reasonCode:"authorization_allowed"},{policyId:"authorization-snapshot-current",outcome:"allow",reasonCode:"authorization_allowed"}]}]},subjectId:"subject-1",organizationId:"org-1",actionId:"organizationModel.readDraft"});assert.equal(decision.treatment,"filter");assert.equal(decision.dataAccessMode,"scoped");assert.equal(decision.scopeAppliedByBackend,true);assert.ok(decision.evaluatedStages.some(stage=>stage.stage==="rbac"&&stage.result==="passed"));assert.ok(decision.evaluatedStages.some(stage=>stage.stage==="abac"&&stage.result==="passed"));assert.equal(JSON.stringify(decision).includes("organization_admin"),false);});

test("diagnostic explanations require the canonical audit action while ordinary decisions omit stages",()=>{const fs=require("node:fs"),source=fs.readFileSync("backend/organization-mapping/routes.js","utf8");assert.match(source,/authorization-explanations\/:actionId"[\s\S]*guard\("organizationModel\.inspectAuditHistory"\)/);assert.match(source,/publicAuthorizationDecision[\s\S]*evaluatedStages:\[\]/);assert.match(source,/resource_not_found_or_not_accessible/);});
