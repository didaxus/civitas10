# Exact publication and rollback

Preview canonicalization binds organization and draft IDs, exact draft version/hash, current published base ID/version/hash, all registry versions/hashes, exact policy and selector-set versions/hashes, source connections and snapshot versions/hashes/freshness, evaluation outcomes/hashes, conflicts, unresolved evaluations, review versions/decisions, dimension configurations, graph/tree/facet hashes, and reconciliation impact.

Publish requires the preview ID, expected draft version, expected published version, expected impact digest, reason, and subject/action/request-bound idempotency key. In one PostgreSQL transaction it acquires an organization advisory lock, reloads and hashes the complete reviewed state, rejects drift or unresolved/conflicting/stale state, writes the immutable model and projections, creates actual-difference reconciliation work, records safe audit, appends to the shared integration outbox, and completes idempotency. Any failure rolls back all writes.

Rollback copies the complete immutable historical model into a new draft, records the historical publication and current base, and then uses the same evaluation, review, preview, and publication path. The resulting publication stores `source_publication_id`; history is never modified and identical historical content may receive a new publication version.
