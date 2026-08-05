# Turn 4 completion audit

No locally verifiable evidence establishes the previously documented Turn 1–3 SHAs as human-approved heads, so this document does not label them approved. The current remediation is based on the repository history recorded in the PR and must still be reviewed against GitHub issue and review history.

## Implemented behavior

- Production composition mounts the PostgreSQL repository and requires authentication/audience, organization context, canonical permission, Owner Ceiling, Tenant Activation, ABAC, and current runtime authorization.
- Exact reviewed state binds policies, selector sets, snapshots, evaluations, conflicts, unresolved conditions, reviews, dimension configuration, registry hashes, projections, and published base.
- Publication is a PostgreSQL transaction protected by an organization advisory lock and uses the shared `integration_outbox_events` foundation.
- Published models are immutable and retain full model/reviewed-state provenance. Rollback creates and publishes a new version through the normal path.
- The primary Scope Tree contains hierarchy-axis nodes only; reusable facets and cross-cutting overlays remain graph nodes outside the tree. Invalid, cross-tenant, inactive, cyclic, unknown, and orphan relationships fail closed.
- Reconciliation compares versions and emits non-grant work for removed nodes/edges, changed canonical bindings/provenance/status, and changed dimension configuration. It never mutates `authorization_scope_assignments`.
- No organization preset, `organizationType`, automatic assignment, wildcard access, or organization-wide fallback exists.

## Evidence boundary

Local unit and contract evidence is recorded in `issue-318-completion-matrix.md`. Live PostgreSQL clean-install, upgrade, concurrency, transaction-failure, and tenant-FK tests remain mandatory before technical acceptance; absent execution is not reported as a pass.

Issue #319 production UI remains out of scope.
