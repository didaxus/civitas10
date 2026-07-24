"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createScimGroupRoleMappingService, assertExternalGroupIdImmutable, SOURCE_KIND } = require("../scim");

const runtime = Object.freeze({
  activeRoleKeys: ["organization_teacher", "organization_member", "organization_admin"],
  ownerCeilings: { organization_teacher: true, organization_member: true, organization_admin: true },
  tenantActivations: { organization_teacher: true, organization_member: true, organization_admin: true },
});

function service(extra = [], overrides = {}) {
  return createScimGroupRoleMappingService({
    ...runtime,
    ...overrides,
    mappings: [
      { id: "map-1", connection_id: "conn-1", external_group_id: "group-immutable-1", mapping_version: 7, canonical_role_key: "organization_teacher", status: "active", approval_status: "approved", approval_id: "approval-1" },
      ...extra,
    ],
  });
}

test("SCIM mapping resolves by connection, immutable external group id, mapping version, and approved canonical role", () => {
  const result = service().resolveAssignments({ connection_id: "conn-1", external_group_ids: ["group-immutable-1"], mapping_version: 7, user_id: "user-1", tenant_id: "tenant-1" });
  assert.equal(result.rejected.length, 0);
  assert.deepEqual(result.assignments[0], {
    user_id: "user-1",
    canonical_role_key: "organization_teacher",
    provenance: {
      source_kind: SOURCE_KIND,
      connection_id: "conn-1",
      external_group_id: "group-immutable-1",
      mapping_id: "map-1",
      mapping_version: 7,
      canonical_role_key: "organization_teacher",
      tenant_id: "tenant-1",
      approval_id: "approval-1",
      approved_by: null,
      approved_at: null,
    },
  });
  assertExternalGroupIdImmutable({ external_group_id: "group-immutable-1" }, { external_group_id: "group-immutable-1" });
  assert.throws(() => assertExternalGroupIdImmutable({ external_group_id: "group-immutable-1" }, { external_group_id: "renamed-display-derived" }), /scim_external_group_id_immutable/);
});

test("SCIM mapping rejects owner global, display-name derived, inactive roles, owner ceiling and tenant activation gaps", () => {
  const result = service([
    { connection_id: "conn-1", external_group_id: "owners", mapping_version: 7, canonical_role_key: "owner_global", status: "active", approval_status: "approved" },
    { connection_id: "conn-1", external_group_id: "display", mapping_version: 7, canonical_role_key: "organization_teacher", status: "active", approval_status: "approved", source_attribute: "displayName" },
    { connection_id: "conn-1", external_group_id: "inactive-role", mapping_version: 7, canonical_role_key: "organization_secretary", status: "active", approval_status: "approved" },
    { connection_id: "conn-1", external_group_id: "inactive-mapping", mapping_version: 7, canonical_role_key: "organization_teacher", status: "draft", approval_status: "approved" },
    { connection_id: "conn-1", external_group_id: "admin", mapping_version: 7, canonical_role_key: "organization_admin", status: "active", approval_status: "approved" },
    { connection_id: "conn-1", external_group_id: "member", mapping_version: 7, canonical_role_key: "organization_member", status: "active", approval_status: "approved" },
  ], { ownerCeilings: { organization_teacher: true, organization_member: true }, tenantActivations: { organization_teacher: true, organization_admin: true } }).resolveAssignments({ connection_id: "conn-1", external_group_ids: ["owners", "display", "inactive-role", "inactive-mapping", "admin", "member"], mapping_version: 7 });
  assert.deepEqual(result.assignments, []);
  assert.deepEqual(result.rejected.map((r) => r.reasonCode), [
    "scim_owner_global_forbidden",
    "scim_display_name_mapping_forbidden",
    "scim_mapping_role_inactive",
    "scim_mapping_inactive",
    "scim_mapping_above_owner_ceiling",
    "scim_mapping_tenant_activation_missing",
  ]);
});

test("SCIM privileged mappings require approval", () => {
  const result = service([{ connection_id: "conn-1", external_group_id: "admin", mapping_version: 7, canonical_role_key: "organization_admin", status: "active" }]).resolveAssignments({ connection_id: "conn-1", external_group_ids: ["admin"], mapping_version: 7 });
  assert.equal(result.rejected[0].reasonCode, "scim_privileged_mapping_approval_missing");
});
