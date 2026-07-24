"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeExternalIdentity, createGroupRoleMappingService, planFederatedIdentityReconciliation } = require("../identity-federation");

const runtime = Object.freeze({
  dataScopes: { organization_teacher: true, organization_member: true },
  ownerCeilings: { organization_teacher: true, organization_member: true },
  tenantActivations: { organization_teacher: true, organization_member: true },
  logtoMaterializationPlan: { roles: ["organization_teacher", "organization_member"] },
});

function service(extra = []) {
  return createGroupRoleMappingService({ activeVersion: "v2", mappings: [
    { tenantId: "tenant-a", external_group_id: "a-teachers", canonical_role_key: "organization_teacher", version: "v2", governanceApproved: true, status: "active" },
    { tenantId: "tenant-b", external_group_id: "b-members", canonical_role_key: "organization_member", version: "v2", governanceApproved: true, status: "active" },
    ...extra,
  ] });
}

test("normalizer redacts profile and keeps two tenant group IDs isolated", () => {
  const a = normalizeExternalIdentity({ provider: "logto", profile: { sub: "u-a", tenant_id: "tenant-a", email: "a@example.test", groups: ["a-teachers"] } });
  const b = normalizeExternalIdentity({ provider: "logto", profile: { sub: "u-b", tenant_id: "tenant-b", email: "b@example.test", groups: ["b-members"] } });
  assert.equal(a.claimsComplete, true);
  assert.equal(b.claimsComplete, true);
  assert.deepEqual(service().resolveCandidates({ tenantId: a.tenantId, externalGroupIds: a.externalGroupIds, expectedVersion: "v2" }).candidates.map((c) => c.canonical_role_key), ["organization_teacher"]);
  assert.deepEqual(service().resolveCandidates({ tenantId: b.tenantId, externalGroupIds: b.externalGroupIds, expectedVersion: "v2" }).candidates.map((c) => c.canonical_role_key), ["organization_member"]);
  assert.equal(a.redactedProfile.email, "[redacted]");
});

test("overage and incomplete claims are not safe and block destructive removals", () => {
  const identity = normalizeExternalIdentity({ provider: "logto", profile: { sub: "u-a", tenant_id: "tenant-a", groups_overage: true } });
  const mapping = service().resolveCandidates({ tenantId: "tenant-a", externalGroupIds: ["a-teachers"], expectedVersion: "v2" });
  const plan = planFederatedIdentityReconciliation({ identity, mappingResult: mapping, currentRoleKeys: ["organization_member"], runtime });
  assert.equal(identity.claimsComplete, false);
  assert.equal(identity.incompletenessReason, "overage");
  assert.equal(plan.safeToApply, false);
  assert.deepEqual(plan.desiredRemoves, []);
  assert.deepEqual(plan.blockedRemoves, ["organization_member"]);
});

test("required claims missing makes the plan non-authoritative", () => {
  const identity = normalizeExternalIdentity({ provider: "logto", profile: { tenant_id: "tenant-a", groups: ["a-teachers"] } });
  const mapping = service().resolveCandidates({ tenantId: "tenant-a", externalGroupIds: identity.externalGroupIds, expectedVersion: "v2" });
  const plan = planFederatedIdentityReconciliation({ identity, mappingResult: mapping, currentRoleKeys: ["organization_member"], runtime });
  assert.equal(identity.incompletenessReason, "required_claims_missing");
  assert.equal(plan.safeToApply, false);
  assert.equal(plan.blocks[0].reasonCode, "identity_required_claims_missing");
});

test("owner ceiling, tenant activation, data scope and Logto materialization facts are required", () => {
  const identity = normalizeExternalIdentity({ provider: "logto", profile: { sub: "u-a", tenant_id: "tenant-a", groups: ["a-teachers"] } });
  const mapping = service().resolveCandidates({ tenantId: "tenant-a", externalGroupIds: identity.externalGroupIds, expectedVersion: "v2" });
  const plan = planFederatedIdentityReconciliation({ identity, mappingResult: mapping, currentRoleKeys: [], runtime: { ...runtime, ownerCeilings: {} } });
  assert.equal(plan.safeToApply, false);
  assert.equal(plan.blocks.at(-1).reasonCode, "identity_required_governance_fact_missing");
  assert.deepEqual(plan.desiredAdds, []);
});

test("stale mapping versions and direct claim-to-role conversion are rejected", () => {
  const mappings = service([{ tenantId: "tenant-a", external_group_id: "old", canonical_role_key: "organization_teacher", version: "v1", governanceApproved: true, status: "active" }]);
  const result = mappings.resolveCandidates({ tenantId: "tenant-a", externalGroupIds: ["old"], expectedVersion: "v2" });
  assert.deepEqual(result.candidates, []);
  assert.equal(result.rejected[0].reasonCode, "identity_mapping_version_stale");
  assert.throws(() => mappings.rejectDirectClaimToRole("admin"), /external_claim_to_role_conversion_forbidden/);
});

test("external admin mappings need governance and owner_global is always rejected", () => {
  const mappings = service([
    { tenantId: "tenant-a", external_group_id: "admins", canonical_role_key: "organization_admin", version: "v2", governanceApproved: false, status: "active" },
    { tenantId: "tenant-a", external_group_id: "owners", canonical_role_key: "owner_global", version: "v2", governanceApproved: true, status: "active" },
  ]);
  const result = mappings.resolveCandidates({ tenantId: "tenant-a", externalGroupIds: ["admins", "owners"], expectedVersion: "v2" });
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.rejected.map((r) => r.reasonCode), ["external_role_requires_governance", "external_role_requires_governance"]);
});
