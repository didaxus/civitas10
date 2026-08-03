"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync(require.resolve("../services/governanceRolesReadModel"), "utf8");
const index = fs.readFileSync(require.resolve("../index"), "utf8");
const repository = fs.readFileSync(require.resolve("../authorization/entitlements/postgresEntitlementRepository"), "utf8");
const readModel = fs.readFileSync(require.resolve("../services/governanceReadModel"), "utf8");

test("production composes PostgreSQL governance entitlements without mutable runtime fallbacks", () => {
  assert.match(index, /createPostgresEntitlementRepository/);
  assert.match(index, /createGovernanceRolesService/);
  assert.doesNotMatch(source, /createInMemoryEntitlementRepository|runtimeAuditEvents|runtimeOutboxEvents|runtimeCacheInvalidations/);
  assert.doesNotMatch(readModel, /governance\.owner\.read|governance\.tenant\.read|governance\.preview\.read|buildPermissionMatrix/);
  assert.match(repository, /begin/);
  assert.match(repository, /rollback/);
  assert.match(repository, /authorization_outbox_events/);
  assert.match(repository, /audit_logs/);
});

test("server read model owns presentation, availability, and control resolution", () => {
  for (const field of ["rolePotential", "identityProvisioned", "runtimeAvailable", "organizationAvailable", "ownerAllowed", "tenantEnabled", "effective", "enabled", "canChange", "controlState", "policyVersion"]) {
    assert.match(source, new RegExp(field));
  }
  assert.match(source, /permission\.presentation/);
  assert.doesNotMatch(source, /permission\.namespace === "org"/);
  assert.doesNotMatch(source, /split\("\."\).*display/);
});

test("permission policy read model exposes complete canonical role potential", async () => {
  const { createGovernanceRolesService } = require("../services/governanceRolesReadModel");
  const entitlementRepository = {
    kind: "postgres",
    async getPolicyVersion() { return 7; },
    async listLimits() { return [{ logtoRoleId: "role_teacher", permissionKey: "org.documents.read", allowed: true, locked: false }]; },
    async listActivations() { return [{ logtoRoleId: "role_teacher", permissionKey: "org.documents.read", enabled: true }]; },
  };
  const service = createGovernanceRolesService({ entitlementRepository });
  const result = await service.buildRolesGovernanceSlice({ organizationId: "org", surface: "owner", roles: [{ id: "role_teacher", name: "organization_teacher" }] });

  assert.equal(result.policyVersion, "7");
  assert.equal(result.permissionMatrix.length, 15);
  const row = result.permissionMatrix.find((item) => item.permissionId === "org.documents.read");
  assert.deepEqual(
    { label: row.label, description: row.description, groupLabel: row.groupLabel, rolePotential: row.rolePotential, identityProvisioned: row.identityProvisioned, ownerAllowed: row.ownerAllowed, enabled: row.enabled },
    { label: "View documents", description: "View organization documents.", groupLabel: "Organization", rolePotential: true, identityProvisioned: true, ownerAllowed: true, enabled: true },
  );
  const future = result.permissionMatrix.find((item) => item.permissionId === "lms.assignments.create");
  assert.equal(future.runtimeAvailable, false);
  assert.equal(future.effective, false);
  assert.equal(result.permissionMatrix.some((item) => item.permissionId.startsWith("owner.")), false);
});
