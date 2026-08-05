# Issue #318 completion matrix

This local remediation could not inspect remote PR #321 comments or workflow logs. Rows marked `blocked` require PostgreSQL or remote CI evidence not available in this container.

| Requirement | Status | Implementation | Tests / command | Result | Remaining risk |
|---|---|---|---|---|---|
| Restore released migration 0025 | complete-local | `backend/db/migrations/0025_data_scope_taxonomy_v2.sql`; v3 moved to `0039_data_scope_taxonomy_v3.sql` | `git diff acdb236 -- backend/db/migrations/0025_data_scope_taxonomy_v2.sql` | no local diff expected after commit | Base branch must confirm `acdb236` is PR base |
| Machine-readable registries contain definitions | complete-local | `core/organization-mapping/*registry*.cjs`, `contracts/organization-mapping/*.json` | `node --test backend/test/organization-mapping-registry-integrity.test.js` | pass | Human review of classifications |
| Formal MATCH/NO_MATCH/UNRESOLVED truth tables | complete-local | `core/organization-mapping/mapping-engine.cjs` | `node --test backend/test/organization-mapping-tristate-truth-table.test.js` | pass | Needs expanded PostgreSQL-backed policy tests |
| No mapping grants access | complete-local | outcome registry, engine validation, publication work-items | org mapping tests | pass | Human security review |
| PostgreSQL migration execution | blocked | SQL migrations | not run | unavailable | No live PostgreSQL service verified |
| PostgreSQL tri-state, tenant-bound FKs and row mappers | complete-local / execution-blocked | `0040_organization_mapping_security_hardening.sql`; `backend/organization-mapping/repository.js` | `node --test backend/test/organization-mapping-hardening.test.js` | pass (contract); PostgreSQL unavailable | Requires clean-install, upgrade and cross-tenant FK execution against PostgreSQL |
| Production route mounting and full auth pipeline | complete-local | `backend/index.js`; `backend/organization-mapping/routes.js` | `node --test backend/test/organization-mapping-hardening.test.js` | pass (composition contract) | Requires deployed integration test with real principals and authorization providers |
| Request-bound idempotency | complete-local / execution-blocked | `backend/organization-mapping/service.js`; repository; migration `0040` | organization-mapping service tests | pass in memory | Requires PostgreSQL replay/conflict/rollback execution |
| Atomic concurrent publication | complete-local / execution-blocked | PostgreSQL transaction + organization advisory lock + exact base/draft/impact checks | organization-mapping publication tests | pass in memory | Requires two-session PostgreSQL concurrency and failure-injection evidence |
| Evidence audience filtering | partial | evidence registry + redaction | unit tests | pass | Needs API/audit/outbox leak tests |
| Validated graph and primary tree | complete-local | `backend/organization-mapping/projections.js` | `node --test backend/test/organization-mapping-hardening.test.js` | pass | Human approval of root and hierarchy semantics |
| Reconciliation real impact diff | partial | previous/new node and relationship removals create non-grant items | unit tests | pass | Changed bindings, source provenance and assignment-reference lookup remain unimplemented |
| Complete governed API surface | blocked | draft/evaluate/review/preview/publish/rollback/audit routes | route tests | partial | Policy/selector-set CRUD, evidence, histories, reconciliation and exact projection reads remain absent |
