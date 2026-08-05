# Issue #318 completion matrix

This local remediation could not authenticate to GitHub or execute live PostgreSQL. `complete-local` means executable unit/contract evidence exists; it does not substitute for PostgreSQL, deployed authorization, concurrency, or remote CI evidence.

| Requirement | Status | Implementation | Exact command/result | Remaining risk / approval |
|---|---|---|---|---|
| Released migration 0025 unchanged; v3 forward migration | complete-local | `0025`, `0039` | `git diff acdb236 --exit-code -- backend/db/migrations/0025_data_scope_taxonomy_v2.sql` — pass | Confirm remote PR base |
| Formal tri-state and truth tables | complete-local | mapping engine | `node --test backend/test/organization-mapping-*.test.js` — pass | Human truth-table review |
| Higher-authority Exclude and exact refinement | complete-local | engine + policy schema | gap-closure tests — pass | Human authority-order review |
| Immutable exact selector sets | complete-local | migration `0041`, repository/service/API | gap-closure tests — pass | PostgreSQL FK/immutability execution |
| Complete reviewed-state preview binding | complete-local | service + preview schema | drift test — pass | PostgreSQL race execution |
| Tenant-bound schema and row mappers | complete-local / execution-blocked | migrations `0040`–`0041`, repository | hardening tests — pass | Clean/upgrade/cross-tenant PostgreSQL tests unavailable |
| Production PostgreSQL composition and authorization pipeline | complete-local | `backend/index.js`, routes | composition contract — pass | Deployed actor/provider scenarios required |
| Governed API reads, versions, policies, selector sets, trace, evidence, reviews, reconciliation, graph/tree | complete-local | routes/service | API surface contract — pass | HTTP integration scenarios required |
| Evidence classification and audience omission | complete-local | adapter, filter, evidence endpoint | evidence leak test — pass | Search/export/pagination integration review |
| Review versioning and request-bound idempotency | complete-local | service/repository/schema | review replay/conflict test — pass | Concurrent PostgreSQL review test |
| Transactional publication and organization lock | complete-local / execution-blocked | service/repository | in-memory atomic contracts — pass | Two-session PostgreSQL and failure injection unavailable |
| Shared integration outbox only | complete-local | repository + migration `0041` | organization mapping shared-outbox test — pass | Repository-wide gate has unrelated existing findings |
| Rollback source publication provenance | complete-local | service/publication FK | rollback republish test — pass | Current-source incompatibility PostgreSQL scenario |
| Cross-cutting graph and hierarchy-only Scope Tree | complete-local | projections | overlay/cycle/orphan tests — pass | Human graph semantics review |
| Reconciliation actual differences and assignment references | complete-local / execution-blocked | projection diff + read-only assignment reference query | reconciliation tests — pass | PostgreSQL reference-query execution required; assignments are never mutated |
| No access grant / exactly-one-target preserved | complete-local | outcomes, service, migrations | organization mapping + Data Scope contracts — pass | Human security review |
| Live PostgreSQL clean install/upgrade/FK/concurrency | blocked | postgres gate exists | `npm run authz:data-scope-v2:postgres-check` — unavailable without `DATABASE_URL` | Mandatory before acceptance |
| Remote workflows and reviews | blocked | GitHub | `gh auth status` — unauthenticated | Required checks and human review must be green |
