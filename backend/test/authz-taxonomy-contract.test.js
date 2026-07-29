"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createInMemoryTaxonomyRepository, createTaxonomyService, createTaxonomyPublicationService, createTaxonomyImpactService, createTaxonomyPresetService, KNOWN_DIMENSIONS, TAXONOMY_REASON_CODES } = require("../taxonomy");
function runtime() { let policyVersion = 30; const events = []; return { events, async incrementPolicyVersion() { return ++policyVersion; }, async enqueueOutbox(e) { events.push(e); }, async audit(e) { events.push({ audit: true, ...e }); } }; }

test("taxonomy keeps platform definitions separate from tenant-owned values", async () => {
  const repo = createInMemoryTaxonomyRepository(); const rt = runtime(); const service = createTaxonomyService({ repository: repo, runtimeConsistencyPort: rt });
  await service.ensureDefinitions();
  assert.deepEqual(Object.keys(KNOWN_DIMENSIONS).sort(), ["academic.class","academic.cohort","academic.course","academic.period","academic.stage","academic.subject","administration.function","organization.campus","organization.department","organization.shift"].sort());
  const a = await service.createValue({ organizationId: "org_a", dimensionKey: "academic.subject", stableKey: "mathematics", displayName: "Mathematics", actorLogtoUserId: "user_a" });
  const b = await service.createValue({ organizationId: "org_b", dimensionKey: "academic.subject", stableKey: "mathematics", displayName: "Math", actorLogtoUserId: "user_b" });
  assert.notEqual(a.id, b.id);
  await assert.rejects(() => service.createValue({ organizationId: "org_a", dimensionKey: "school.x.custom_dimension", stableKey: "x", displayName: "X", actorLogtoUserId: "user_a" }), /taxonomy_dimension_unknown/);
});

test("publication activates drafts and #95 resolver only accepts active UUID values", async () => {
  const repo = createInMemoryTaxonomyRepository(); const rt = runtime(); const service = createTaxonomyService({ repository: repo, runtimeConsistencyPort: rt });
  const publication = createTaxonomyPublicationService({ repository: repo, runtimeConsistencyPort: rt });
  const value = await service.createValue({ organizationId: "org_a", dimensionKey: "academic.subject", stableKey: "mathematics", displayName: "Mathematics", actorLogtoUserId: "user_a" });
  assert.equal((await service.resolvePublishedDimensionValue({ organizationId: "org_a", dimensionKey: "academic.subject", valueId: value.id, capability: "lms" })).status, "draft");
  const release = await publication.publish({ organizationId: "org_a", actorLogtoUserId: "user_a", expectedTaxonomyCatalogVersion: 1 });
  assert.equal(release.publishedCount, 1);
  assert.equal((await service.resolvePublishedDimensionValue({ organizationId: "org_a", dimensionKey: "academic.subject", valueId: value.id, capability: "lms" })).status, "active");
  assert.equal((await service.resolvePublishedDimensionValue({ organizationId: "org_b", dimensionKey: "academic.subject", valueId: value.id, capability: "lms" })).reasonCode, TAXONOMY_REASON_CODES.VALUE_WRONG_ORGANIZATION);
  assert.equal((await service.resolvePublishedDimensionValue({ organizationId: "org_a", dimensionKey: "academic.subject", valueId: value.id, capability: "payments" })).status, "capability_not_supported");
});

test("stable keys are immutable after activation; rename is presentation-only", async () => {
  const repo = createInMemoryTaxonomyRepository(); const rt = runtime(); const service = createTaxonomyService({ repository: repo, runtimeConsistencyPort: rt }); const publication = createTaxonomyPublicationService({ repository: repo, runtimeConsistencyPort: rt });
  const value = await service.createValue({ organizationId: "org_a", dimensionKey: "academic.stage", stableKey: "primary", displayName: "Primary", actorLogtoUserId: "user_a" });
  await publication.publish({ organizationId: "org_a", actorLogtoUserId: "user_a" });
  await assert.rejects(() => service.updateValue({ organizationId: "org_a", dimensionKey: "academic.stage", valueId: value.id, patch: { stableKey: "elementary" }, actorLogtoUserId: "user_a" }), /taxonomy_stable_key_immutable/);
  const renamed = await service.updateValue({ organizationId: "org_a", dimensionKey: "academic.stage", valueId: value.id, patch: { displayName: "Elementary" }, actorLogtoUserId: "user_a" });
  assert.equal(renamed.id, value.id);
});

test("archive is blocked when impact is unknown and archived values never authorize", async () => {
  const repo = createInMemoryTaxonomyRepository(); const rt = runtime(); const service = createTaxonomyService({ repository: repo, runtimeConsistencyPort: rt, impactService: createTaxonomyImpactService() }); const publication = createTaxonomyPublicationService({ repository: repo, runtimeConsistencyPort: rt });
  const value = await service.createValue({ organizationId: "org_a", dimensionKey: "organization.department", stableKey: "billing", displayName: "Billing", actorLogtoUserId: "user_a" });
  await publication.publish({ organizationId: "org_a", actorLogtoUserId: "user_a" });
  await assert.rejects(() => service.archiveValue({ organizationId: "org_a", dimensionKey: "organization.department", valueId: value.id, actorLogtoUserId: "user_a" }), /taxonomy_impact_unknown/);
  const safeService = createTaxonomyService({ repository: repo, runtimeConsistencyPort: rt, impactService: createTaxonomyImpactService({ providers: { assignments: { preview: async () => ({ status: "safe" }) } } }) });
  await safeService.archiveValue({ organizationId: "org_a", dimensionKey: "organization.department", valueId: value.id, actorLogtoUserId: "user_a" });
  assert.equal((await safeService.resolvePublishedDimensionValue({ organizationId: "org_a", dimensionKey: "organization.department", valueId: value.id, capability: "support" })).reasonCode, TAXONOMY_REASON_CODES.VALUE_ARCHIVED);
});

test("hierarchy rejects cross tenant parents and detects cycles", async () => {
  const repo = createInMemoryTaxonomyRepository(); const service = createTaxonomyService({ repository: repo, runtimeConsistencyPort: runtime() });
  const a = await service.createValue({ organizationId: "org_a", dimensionKey: "academic.stage", stableKey: "primary", displayName: "Primary", actorLogtoUserId: "user_a" });
  const b = await service.createValue({ organizationId: "org_a", dimensionKey: "academic.stage", stableKey: "grade_1", displayName: "Grade 1", actorLogtoUserId: "user_a", parentValueId: a.id });
  await assert.rejects(() => service.createValue({ organizationId: "org_b", dimensionKey: "academic.stage", stableKey: "other", displayName: "Other", actorLogtoUserId: "user_b", parentValueId: a.id }), /taxonomy_parent_cross_tenant/);
  const { assertParentAllowed } = require("../taxonomy");
  assert.throws(() => assertParentAllowed({ definition: { hierarchyAllowed: true }, child: a, parent: b, ancestorLoader: () => [a] }), /taxonomy_cycle_detected/);
});

test("presets are idempotent drafts and do not create roles or scopes", async () => {
  const repo = createInMemoryTaxonomyRepository(); const service = createTaxonomyService({ repository: repo, runtimeConsistencyPort: runtime() }); const presets = createTaxonomyPresetService({ taxonomyService: service, repository: repo });
  const first = await presets.applyPreset({ organizationId: "org_a", presetKey: "school_k12", actorLogtoUserId: "user_a", idempotencyKey: "idem-1" });
  const second = await presets.applyPreset({ organizationId: "org_a", presetKey: "school_k12", actorLogtoUserId: "user_a", idempotencyKey: "idem-1" });
  assert.deepEqual(second, first);
  assert.ok(first.created.every(v => !v.stableKey.includes("scope") && !v.stableKey.includes("role")));
});
