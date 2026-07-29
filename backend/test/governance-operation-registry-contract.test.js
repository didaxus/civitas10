"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { permissionsByName } = require("../../core/authz");
const { governanceOperationRegistry, moduleInventory } = require("../../core/governance/operation-registry.cjs");

function assertCanonicalActivePermission(permission) {
  assert.equal(typeof permission, "string");
  assert.equal(permission.includes("|"), false, "composite permission strings are forbidden");
  const definition = permissionsByName[permission];
  assert.ok(definition, `unknown permission ${permission}`);
  assert.equal(definition.status, "active", `permission ${permission} must be active`);
}

function validateOperationRegistry(operations = governanceOperationRegistry) {
  for (const operation of operations) {
    assert.ok(operation.operationId, "operationId is required");
    if (["active", "read-only", "preview"].includes(operation.status)) assertCanonicalActivePermission(operation.permission);
    if (operation.status === "active") {
      assert.equal(operation.authoritativeEndpoint, true);
      assert.equal(operation.backendAuthorization, true);
      assert.equal(operation.durableRepository, true);
    }
    if (operation.status === "planned") assert.equal(operation.fetcher || operation.action || operation.mountedHandler, undefined, "planned operations cannot mount fetch/action handlers");
  }
}

function validateModuleInventory(modules = moduleInventory) {
  for (const module of modules) {
    if (module.status !== "active") continue;
    assertCanonicalActivePermission(module.permission);
    if (module.permissionRequirement) {
      assert.ok(["all", "any"].includes(module.permissionRequirement.mode));
      assert.ok(Array.isArray(module.permissionRequirement.permissions));
      for (const permission of module.permissionRequirement.permissions) assertCanonicalActivePermission(permission);
    }
  }
}

test("active governance operations and modules reference only active canonical permissions", () => {
  validateOperationRegistry();
  validateModuleInventory();
});

test("governance registry rejects unknown, planned, and composite active permissions", () => {
  assert.throws(() => validateOperationRegistry([{ operationId: "bad.unknown", status: "active", permission: "org.unknown.read" }]), /unknown permission/);
  assert.throws(() => validateOperationRegistry([{ operationId: "bad.planned", status: "active", permission: "org.members.read" }]), /must be active/);
  assert.throws(() => validateOperationRegistry([{ operationId: "bad.composite", status: "active", permission: ["owner.profile.read", "org.documents.read"].join("|") }]), /composite permission strings/);
});

test("planned governance operations do not expose fetches or actions", () => {
  assert.throws(() => validateOperationRegistry([{ operationId: "bad.planned.fetch", status: "planned", permission: "org.members.read", fetcher: "/o/org/lms" }]), /planned operations cannot mount/);
  validateOperationRegistry([{ operationId: "ok.planned", status: "planned", permission: "org.members.read" }]);
});
