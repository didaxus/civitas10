# PR #272 — Phase 3 closure readiness

## Root cause and correction

The API taxonomy loader and the canonical Data Scope dimension artifact had drifted. The loader required the `civitas.authorization.data-scope-dimensions` contract envelope while the artifact exposed only planning-era `schemaVersion` and `contractVersion` metadata. The artifact now exposes the runtime `contract` and `version`, its schema freezes both values, and runtime validation enforces the exact ten Phase 3 dimension IDs, uniqueness, and the absence of permission/role/assignment/scope semantics.

The artifact is the vocabulary authority. The authorization runtime enriches its IDs with execution metadata; it no longer maintains an independent ordered list. The layers remain separate:

```text
Taxonomy Dimension Registry
  -> Data Scope Strategy Registry
  -> Scope Template Registry
  -> Assignments / PBAC
```

A dimension is only a governable restriction axis. It grants no role or permission. `academic.section` and `academic.grade_level` remain migration evidence only and are not active aliases.

## Issue closure evidence

### #218 — ABAC Data Scope v2

**DONE**

- Canonical ten-dimension vocabulary is shared by taxonomy and Data Scope runtime.
- Contract envelope, unique IDs, legacy exclusions, restrictive-only behavior, strategies, templates, assignments, tenant boundaries, and migration SQL are covered by executable gates.
- API import no longer fails with `taxonomy_dimension_registry_invalid`.

**PENDING**

- Maintainer review and merge of PR #272.
- Production-equivalent verification of migration `0025` against the real dataset and confirmation of zero unresolved reconciliation rows.
- Same-SHA deployment evidence for API, worker, PostgreSQL, and Redis.

### #217 — claims/runtime contracts

**DONE**

- Organization principals and role paths remain membership-, tenant-, role-, permission-, transport-surface-, and snapshot-bound.
- Role paths include all fields required by `civitas-role-path/v2`, including restrictive fragments and token-scope evidence.
- The Logto authorization contract and local security gate pass.

**PENDING**

- Real Logto token/JWKS validation and custom-claims apply/idempotency/rollback evidence in the production-equivalent environment.
- Same-SHA revocation/freshness SLO evidence.

### #199 — production readiness

**DONE**

- Canonical contract, generated authorization artifacts, referential-integrity checks, root package manifest, and security inventory are internally consistent.
- API and worker progress beyond taxonomy contract import when supplied the required deployment configuration.

**PENDING**

- Runtime smoke against reachable PostgreSQL and Redis; the local audit environment has neither service.
- Confirm Coolify health endpoints, queue consumption, migration state, and image SHA after deployment of the merged commit.

### #200 — Phase 3 epic

**DONE**

- The taxonomy/Data Scope contractual blocker is removed and focused taxonomy, authorization, Data Scope, planning, and root test gates are green.
- Closure evidence is prepared without closing any issue automatically.

**PENDING**

- Close child issues only after maintainers validate the production-equivalent evidence above.
- Close the epic only after all child issue acceptance criteria and deployment checks are recorded on the merged SHA.

## Merge and deployment checklist

| Check | Status | Evidence / remaining action |
|---|---|---|
| Migrations applied | Deployment-reported; local verification pending | Coolify report says migrations succeed; verify migration table and reconciliation rows on the merged SHA. |
| Contracts consistent | Pass | Canonical registry, schema, runtime loader, Data Scope runtime, and referential-integrity gates agree. |
| Runtime starts | Code blocker resolved; infrastructure smoke pending | The taxonomy import succeeds. Local startup waits for unavailable PostgreSQL/Redis rather than raising `taxonomy_dimension_registry_invalid`. |
| Tests pass | Pass | Root `npm test` and focused taxonomy/Data Scope/planning checks pass. |
| Deployment ready | Conditional | Ready to deploy; merge readiness still requires maintainer review and post-deploy same-SHA health verification. |

Do not close #218, #217, #199, or #200 automatically. Attach the merged commit SHA and production-equivalent results before maintainers close them.
