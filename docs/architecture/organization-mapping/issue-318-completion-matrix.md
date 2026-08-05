# Issue #318 completion matrix

This local remediation could not inspect remote PR #321 comments or workflow logs. Rows marked `blocked` require PostgreSQL or remote CI evidence not available in this container.

| Requirement | Status | Implementation | Tests / command | Result | Remaining risk |
|---|---|---|---|---|---|
| Restore released migration 0025 | complete-local | `backend/db/migrations/0025_data_scope_taxonomy_v2.sql`; v3 moved to `0039_data_scope_taxonomy_v3.sql` | `git diff acdb236 -- backend/db/migrations/0025_data_scope_taxonomy_v2.sql` | no local diff expected after commit | Base branch must confirm `acdb236` is PR base |
| Machine-readable registries contain definitions | complete-local | `core/organization-mapping/*registry*.cjs`, `contracts/organization-mapping/*.json` | `node --test backend/test/organization-mapping-registry-integrity.test.js` | pass | Human review of classifications |
| Formal MATCH/NO_MATCH/UNRESOLVED truth tables | complete-local | `core/organization-mapping/mapping-engine.cjs` | `node --test backend/test/organization-mapping-tristate-truth-table.test.js` | pass | Needs expanded PostgreSQL-backed policy tests |
| No mapping grants access | complete-local | outcome registry, engine validation, publication work-items | org mapping tests | pass | Human security review |
| PostgreSQL migration execution | blocked | SQL migrations | not run | unavailable | No live PostgreSQL service verified |
| Production route mounting and full auth pipeline | blocked | current router exports | not complete | unavailable | Requires composition refactor |
| Atomic concurrent publication | blocked | service/repository transaction support partial | not complete | unavailable | Needs DB locks and concurrent PG tests |
| Evidence audience filtering | partial | evidence registry + redaction | unit tests | pass | Needs API/audit/outbox leak tests |
| Reconciliation real impact diff | partial | non-grant work items | unit tests | pass | Needs previous/new diff implementation |
