# Turn 4 completion audit and evidence matrix

Approved Turn 1 base: `3928de1618c280392fbb438cc336899088ed62e0`.
Approved Turn 2 head: `2b46f8b38f428de527bcfd1a9f1f9306f65406e0`.
Approved Turn 3 head: `c07e1c3c5daecad13b4cc79904770e6ee030608b`.

## Code audit

- Draft lifecycle exists through Turn 3 services and now supports deterministic preview and exact-version publication.
- Published-model lifecycle is append-only: migration trigger rejects updates/deletes of published versions.
- Transaction boundaries are repository-provided; publication writes publication, reconciliation work items, audit, outbox, and idempotency through service sequencing. Production deployments should wrap service calls in repository transactions.
- Organization-scoped locking is represented by exact `(organization_id, draft_id, draft_version, preview_digest)` binding; no last-write-wins publication path is introduced.
- Canonical serialization uses sorted-object canonicalization before digesting preview, impact, and model hashes.
- Audit/outbox/idempotency remain tenant scoped and are emitted for preview, publish, and rollback draft creation.
- Structure/unit projection is deterministic graph and primary scope-tree output; it is not an authorization allow decision.
- Downstream Data Scope reconciliation is represented as non-grant work items only; no automatic assignments are created.
- Raw source evidence remains server-filtered by Turn 3 redaction.
- No new route uses role-name comparison or implicit organization context.

## Completion evidence

- Exact preview: implemented with `previewDigest` over draft id/version, graph, tree, facets, and impact digest.
- Impact digest: implemented with canonical graph/tree/facets plus `authorizationMutation: false`.
- Preview-to-publish TOCTOU protection: publish requires matching draft version, preview id, and preview digest.
- Immutable published versions: database trigger rejects update/delete.
- Rollback: creates a new draft from a publication and records that history is not mutated.
- Projections: deterministic organization graph, primary scope tree, reusable facets, and reconciliation work items are generated.

## Deferred outside #318

Issue #319 production UI and automatic user/group access assignment remain out of scope.
