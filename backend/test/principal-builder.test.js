"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildAuthorizationPrincipal, buildPrincipalForWorker, buildPrincipalForMcp, MEMBERSHIP_CLAIM, ROLES_CLAIM, CONTRACT_CLAIM } = require("../authorization/principalBuilder");

const now = new Date("2026-07-29T12:00:00.000Z");
function fixture() {
  const claims = { sub: "user-1", iss: "https://identity.example/oidc", aud: "https://api.example", iat: 1785326100, exp: 1785330000, scope: "lms.groups.read", organization_id: "org-1", [MEMBERSHIP_CLAIM]: "membership-1", [ROLES_CLAIM]: ["role-teacher"], [CONTRACT_CLAIM]: "civitas-authorization-foundation/v2", authz_snapshot_version: 7 };
  const binding = { serverTrusted: true, subject: "user-1", organizationId: "org-1", membershipBindingId: "membership-1", membershipState: "active", checkedAt: now.toISOString(), bindingRecordVersion: "membership/v3", rolePotentialVersion: "roles/v5", snapshotVersion: 7, roleAssignments: [{ rolePathId: "path-1", logtoRoleId: "role-teacher", canonicalRoleId: "organization_teacher", state: "active", fragments: [{ fragmentId: "base", version: "1", surface: "rest", permissions: ["lms.groups.read"] }, { fragmentId: "worker", version: "1", surface: "worker", permissions: ["lms.groups.read"] }] }] };
  return { validatedToken: { validated: true, claims }, binding, organizationId: "org-1", permissionId: "lms.groups.read", surface: "rest", now };
}
const denied = async (mutate, code) => { const input = fixture(); mutate(input); await assert.rejects(() => buildAuthorizationPrincipal(input), (error) => error.code === code); };

test("builds only complete membership-bound role paths and composes matching fragments", async () => { const principal = await buildAuthorizationPrincipal(fixture()); assert.equal(principal.membershipBindingId, "membership-1"); assert.deepEqual(principal.rolePaths[0].fragments, [{ fragmentId: "base", version: "1" }]); });
test("rejects wrong membership", () => denied((x) => { x.binding.membershipBindingId = "membership-2"; }, "membership_mismatch"));
test("rejects wrong tenant", () => denied((x) => { x.organizationId = "org-2"; }, "organization_mismatch"));
test("rejects stale membership", () => denied((x) => { x.binding.checkedAt = "2026-07-29T11:00:00Z"; }, "membership_stale"));
test("rejects revoked membership", () => denied((x) => { x.binding.membershipState = "revoked"; }, "membership_revoked"));
test("rejects role surface mismatch without borrowing a fragment", () => denied((x) => { x.surface = "mcp"; }, "role_surface_mismatch"));
test("rejects missing membership", () => denied((x) => { delete x.validatedToken.claims[MEMBERSHIP_CLAIM]; }, "membership_required"));
test("workers and MCP expose the same builder boundary", async () => { const input = fixture(); input.surface = "worker"; const context = { validatedToken: input.validatedToken, trustedMembershipBinding: input.binding }; const worker = await buildPrincipalForWorker(context, { organizationId: input.organizationId, permissionId: input.permissionId, surface: "worker", now }); assert.equal(worker.rolePaths[0].fragments[0].fragmentId, "worker"); assert.equal(buildPrincipalForMcp, buildPrincipalForWorker); });
