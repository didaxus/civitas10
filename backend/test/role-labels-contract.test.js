"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createInMemoryRoleLabelRepository, createRoleLabelResolver, createRoleLabelService, validateRoleAlias } = require("../domain/role-labels");
const { evaluateOrganizationEntitlement } = require("../authorization/entitlements/entitlementEvaluator");
const { createInMemoryEntitlementRepository } = require("../authorization/entitlements/entitlementRepository");

function fixture() {
  const repository = createInMemoryRoleLabelRepository();
  const roles = new Map([
    ["logto-role-admin", { canonicalRoleId: "logto-role-admin", canonicalKey: "organization_admin", defaultName: "Organization admin" }],
    ["logto-role-member", { canonicalRoleId: "logto-role-member", canonicalKey: "organization_member", defaultName: "Organization member" }],
  ]);
  const canonicalRoleCatalog = { async getById({ canonicalRoleId }) { return roles.get(canonicalRoleId) || null; } };
  const resolver = createRoleLabelResolver({ repository, canonicalRoleCatalog });
  return { repository, resolver, service: createRoleLabelService({ repository, resolver, canonicalRoleCatalog }) };
}

test("resolver is consistent across surfaces and cache keys include the tenant", async () => {
  const f = fixture();
  await f.service.update({ organizationId: "org-a", canonicalRoleId: "logto-role-admin", alias: "Directora", expectedEtag: '"role-alias-v0"', actorLogtoUserId: "actor-1" });
  const owner = await f.resolver.resolve({ organizationId: "org-a", canonicalRoleId: "logto-role-admin" });
  const tenant = await f.resolver.resolve({ organizationId: "org-a", canonicalRoleId: "logto-role-admin" });
  const otherTenant = await f.resolver.resolve({ organizationId: "org-b", canonicalRoleId: "logto-role-admin" });
  assert.deepEqual(owner, tenant);
  assert.equal(owner.effectiveAlias, "Directora");
  assert.equal(owner.provenance.source, "organization_alias");
  assert.equal(otherTenant.effectiveAlias, "Organization admin");
  assert.equal(otherTenant.provenance.source, "canonical_default");
});

test("commands reject XSS, controls and bidi formatting", () => {
  for (const unsafe of ["<img src=x onerror=alert(1)>", "Admin&#x202e;", "Admin\u0000", "Admin\u202euser"]) assert.throws(() => validateRoleAlias(unsafe), /Role alias/);
  assert.equal(validateRoleAlias("  Dirección académica  "), "Dirección académica");
  assert.throws(() => validateRoleAlias("x".repeat(81)), /between 1 and 80/);
});

test("ETag conflicts, tenant alias uniqueness, reset and redacted audit/outbox are enforced", async () => {
  const f = fixture();
  const first = await f.service.update({ organizationId: "org-a", canonicalRoleId: "logto-role-admin", alias: "Administración", expectedEtag: '"role-alias-v0"', actorLogtoUserId: "actor-1" });
  assert.equal(first.etag, '"role-alias-v1"');
  await assert.rejects(() => f.service.update({ organizationId: "org-a", canonicalRoleId: "logto-role-admin", alias: "Otro", expectedEtag: '"role-alias-v0"' }), (error) => error.code === "role_alias_etag_conflict");
  await assert.rejects(() => f.service.update({ organizationId: "org-a", canonicalRoleId: "logto-role-member", alias: "administración", expectedEtag: '"role-alias-v0"' }), (error) => error.code === "role_alias_not_unique");
  await f.service.update({ organizationId: "org-b", canonicalRoleId: "logto-role-member", alias: "administración", expectedEtag: '"role-alias-v0"' });
  const reset = await f.service.reset({ organizationId: "org-a", canonicalRoleId: "logto-role-admin", expectedEtag: first.etag, actorLogtoUserId: "actor-2" });
  assert.equal(reset.effectiveAlias, "Organization admin");
  assert.equal(reset.provenance.version, 2);
  assert.equal(f.repository.audits[0].before, null);
  assert.deepEqual(f.repository.audits[0].after, { alias: "[REDACTED]", version: 1 });
  const resetEvent = f.repository.outbox.find((event) => event.type === "role_alias.reset");
  assert.equal(resetEvent.payload.after.alias, null);
  assert.equal(f.repository.audits.find((event) => event.action === "role_alias.reset").actorLogtoUserId, "actor-2");
});

test("changing a presentation alias cannot change permission eligibility", async () => {
  const f = fixture();
  const repository = createInMemoryEntitlementRepository();
  const input = { organizationId: "org-a", subject: "user-1", tokenScopes: ["org.documents.create"], rolePaths: [{ logtoRoleId: "logto-role-admin", roleNameCache: "organization_admin", tokenScopePresent: true }], permission: "org.documents.create", policyVersion: 1, repository, roleIdToName: { "logto-role-admin": "organization_admin" } };
  const before = await evaluateOrganizationEntitlement(input);
  await f.service.update({ organizationId: "org-a", canonicalRoleId: "logto-role-admin", alias: "No soy admin", expectedEtag: '"role-alias-v0"', actorLogtoUserId: "actor" });
  const after = await evaluateOrganizationEntitlement(input);
  assert.equal(after.allowed, before.allowed);
  assert.equal(after.reasonCode, before.reasonCode);
  assert.equal(JSON.stringify(after).includes("No soy admin"), false);
});
