"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { createInMemoryOrganizationMappingRepository, createOrganizationMappingService } = require("../organization-mapping");
const { buildOrganizationGraph, buildPrimaryScopeTree, buildReusableFacets } = require("../organization-mapping/projections");

const model = { nodes: [{ id: "class_b", kind: "class", label: "B" }, { id: "campus_a", kind: "campus", label: "A" }], edges: [{ from: "campus_a", to: "class_b", relationship: "contains" }], facets: [{ key: "modality", value: "hybrid" }] };

test("preview is deterministic and projections are canonical", async () => {
  const service = createOrganizationMappingService({ repository: createInMemoryOrganizationMappingRepository() });
  const draft = (await service.createDraft({ organizationId: "org_a", model, actorLogtoUserId: "user_a" })).draft;
  const a = await service.preview({ organizationId: "org_a", draftId: draft.id, actorLogtoUserId: "user_a" });
  const b = await service.preview({ organizationId: "org_a", draftId: draft.id, actorLogtoUserId: "user_a" });
  assert.equal(a.previewDigest, b.previewDigest);
  assert.deepEqual(a.graph, buildOrganizationGraph(model));
  assert.deepEqual(a.scopeTree, buildPrimaryScopeTree(model));
  assert.deepEqual(a.facets, buildReusableFacets(model));
  assert.equal(a.mutatedAuthorization, false);
});

test("publication binds exact preview to draft version and creates non-grant reconciliation work items", async () => {
  const repository = createInMemoryOrganizationMappingRepository();
  const service = createOrganizationMappingService({ repository });
  const draft = (await service.createDraft({ organizationId: "org_a", model, actorLogtoUserId: "user_a" })).draft;
  const preview = await service.preview({ organizationId: "org_a", draftId: draft.id, actorLogtoUserId: "user_a" });
  await assert.rejects(() => service.publish({ organizationId: "org_a", draftId: draft.id, expectedDraftVersion: draft.version + 1, previewId: preview.previewId, expectedPreviewDigest: preview.previewDigest, reason: "test", actorLogtoUserId: "user_a" }), /organization_mapping_preview_stale/);
  const publication = await service.publish({ organizationId: "org_a", draftId: draft.id, expectedDraftVersion: draft.version, previewId: preview.previewId, expectedPreviewDigest: preview.previewDigest, reason: "approved", actorLogtoUserId: "user_a" });
  assert.equal(publication.immutable, true);
  assert.equal(publication.mutatedAuthorization, false);
  assert.ok(publication.reconciliationWorkItems.length);
  assert.equal(publication.reconciliationWorkItems.every((item) => item.grantsAccess === false), true);
});

test("rollback creates a new draft without mutating historical publication", async () => {
  const service = createOrganizationMappingService({ repository: createInMemoryOrganizationMappingRepository() });
  const draft = (await service.createDraft({ organizationId: "org_a", model, actorLogtoUserId: "user_a" })).draft;
  const preview = await service.preview({ organizationId: "org_a", draftId: draft.id, actorLogtoUserId: "user_a" });
  const publication = await service.publish({ organizationId: "org_a", draftId: draft.id, expectedDraftVersion: draft.version, previewId: preview.previewId, expectedPreviewDigest: preview.previewDigest, reason: "approved", actorLogtoUserId: "user_a" });
  const rollback = await service.createRollbackDraft({ organizationId: "org_a", publicationId: publication.publicationId, reason: "rollback requested", actorLogtoUserId: "user_a" });
  assert.notEqual(rollback.draft.id, draft.id);
  assert.equal(rollback.sourcePublicationId, publication.publicationId);
  assert.equal(rollback.rollbackMutatesHistory, false);
});

test("publication migration enforces immutability and does not touch authorization assignments", () => {
  const sql = fs.readFileSync("backend/db/migrations/0038_organization_mapping_publication_projection.sql", "utf8");
  assert.match(sql, /organization_mapping_published_versions_immutable/);
  assert.match(sql, /BEFORE UPDATE OR DELETE ON organization_mapping_published_versions/);
  assert.match(sql, /grants_access BOOLEAN NOT NULL DEFAULT FALSE CHECK \(grants_access = FALSE\)/);
  assert.doesNotMatch(sql, /INSERT\s+INTO\s+authorization_scope_assignments/i);
  assert.doesNotMatch(sql, /UPDATE\s+authorization_scope_assignments/i);
  assert.doesNotMatch(sql, /ALTER\s+TABLE\s+authorization_scope_assignments/i);
});
