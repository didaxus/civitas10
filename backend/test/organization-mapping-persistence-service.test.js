"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { createInMemoryOrganizationMappingRepository, createOrganizationMappingService, createOrganizationMappingRouter, normalizeSourceFacts } = require("../organization-mapping");

test("service persists draft, immutable policy version, source snapshot, evaluation trace, audit, outbox, and idempotency", async () => {
  const repository = createInMemoryOrganizationMappingRepository();
  const service = createOrganizationMappingService({ repository });
  const draftResponse = await service.createDraft({ organizationId: "org_a", model: { dimensions: [] }, actorLogtoUserId: "user_a", idempotencyKey: "draft-1" });
  await assert.rejects(()=>service.createDraft({ organizationId: "org_a", model: { dimensions: ["changed"] }, actorLogtoUserId: "user_a", idempotencyKey: "draft-1" }),/organization_mapping_idempotency_conflict/);
  const evalResponse = await service.evaluate({ organizationId: "org_a", draftId: draftResponse.draft.id, actorLogtoUserId: "user_a", idempotencyKey: "eval-1", sourceFacts: { provider: "oidc", subject: "subj", tenantId: "org_a", profile: { groups: ["g1"], email: "a@example.test" } }, policy: { rules: [{ ruleId: "r1", conditions: [{ selectorId: "scim.group", operator: "equals", value: "g1" }], target: { dimensionId: "academic.stage", valueStableKey: "secondary" } }] } });
  assert.equal(evalResponse.outcome, "MATCH");
  assert.equal(evalResponse.mutatedAuthorization, false);
  assert.equal(Object.hasOwn(evalResponse.evidence, "email"), false);
  assert.ok(repository.audits.length >= 2);
  assert.ok(repository.outbox.length >= 2);
});

test("service rejects cross-tenant source facts and requires optimistic concurrency", async () => {
  const service = createOrganizationMappingService({ repository: createInMemoryOrganizationMappingRepository() });
  const draft = (await service.createDraft({ organizationId: "org_a", model: {}, actorLogtoUserId: "user_a" })).draft;
  await assert.rejects(() => service.updateDraft({ organizationId: "org_a", draftId: draft.id, model: {}, expectedVersion: 9, actorLogtoUserId: "user_a" }), /organization_mapping_version_conflict/);
  await assert.rejects(() => service.evaluate({ organizationId: "org_a", draftId: draft.id, sourceFacts: { provider: "oidc", subject: "s", tenantId: "org_b", profile: { groups: [] } }, policy: { rules: [] }, actorLogtoUserId: "user_a" }), /organization_mapping_cross_tenant_source_fact/);
});

test("normalized source facts redact sensitive evidence", () => {
  const facts = normalizeSourceFacts({ provider: "saml", subject: "sub", tenantId: "org_a", profile: { groups: ["g"], token: "secret", email: "e@example.test" } });
  assert.equal(Object.hasOwn(facts.evidence, "token"), false);
  assert.equal(Object.hasOwn(facts.evidence, "email"), false);
});

test("router declares lifecycle action permissions without direct role-name authorization", () => {
  const router = createOrganizationMappingRouter({ service: createOrganizationMappingService({ repository: createInMemoryOrganizationMappingRepository() }), authorizeAction:()=>[(_req,_res,next)=>next()] });
  assert.ok(router.stack.length >= 5);
  const source = fs.readFileSync("backend/organization-mapping/routes.js", "utf8");
  assert.doesNotMatch(source, /organization_admin|owner_global/);
  assert.match(source, /organizationModel\.evaluateMappingPolicies/);
});
