"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { permissionsByName } = require("../../core/authz");
const { ACTION_REGISTRY_VERSION, organizationMappingLifecycleActions } = require("../../core/organization-mapping/lifecycle-action-registry.cjs");

test("organization mapping lifecycle registry is unique, canonical, and shared", () => {
  assert.equal(ACTION_REGISTRY_VERSION, "2026-08-civitas-organization-mapping-actions-v1");
  assert.equal(organizationMappingLifecycleActions.length, 10);
  assert.equal(new Set(organizationMappingLifecycleActions.map((a) => a.actionId)).size, organizationMappingLifecycleActions.length);
  for (const action of organizationMappingLifecycleActions) {
    assert.ok(permissionsByName[action.requiredPermission], action.requiredPermission);
    assert.doesNotMatch(JSON.stringify(action), /organization_admin|owner_global/);
    assert.equal(action.ownerCeiling, "required");
    assert.equal(action.tenantActivation, "required");
    assert.match(action.abacBehavior, /fail-closed/);
    assert.ok(action.auditRequirement);
    assert.ok(action.reasonRequirement);
    assert.ok(action.idempotencyRequirement);
  }
});

test("frontend has no parallel organization mapping lifecycle registry", () => {
  const files = fs.readdirSync("frontend/src/authorization/registry").join("\n");
  assert.doesNotMatch(files, /organization.*mapping|lifecycle.*action/i);
});
