# PR #250 — Operational validation for #217 and #218

## 1. Executive verdict

```text
#217: BLOCKED_BY_ENVIRONMENT
#218: BLOCKED_BY_CODE
PR #250 operational status: BLOCKED_BY_CODE
```

This audit does **not** recommend closing either issue. It validated the exact current GitHub PR head, `4b19a866f6eb6ff46c9d21d3d4eab6fd21aa999f`, rather than the auditor branch HEAD. The required real Logto, PostgreSQL, Redis, deployed backend, workers, image digest, and deployment access were unavailable. No production or non-production mutations were attempted.

The mandatory `organization-structure:data-scope-integration-check` fails at the PR head: three reconciliation scenarios terminate with `scope_template_not_found`. GitHub also reported the Canonical authorization security gate as failed for this SHA at collection time. A local security-gate rerun passed only after installing backend dependencies; the root-level mandatory `npm ci` itself fails because the repository has no root lockfile.

## 2. Environment

| Field | Observed value |
|---|---|
| Repository | `didaxus/civitas10` |
| PR | `#250` |
| PR head branch | `codex/congelar-claims-minimos-de-token-personalizado` |
| PR head SHA | `4b19a866f6eb6ff46c9d21d3d4eab6fd21aa999f` |
| PR base branch | `agent/freeze-phase-3-governance-contract-v2` |
| PR base SHA | `7308efa06ceda89f70e0bdc6c6b2f7ae6c3493df` |
| `main` SHA / merge base | `f3028659280f32260fdcde8ca900f97b84820114` |
| PR #249 | Open; head `7308efa06ceda89f70e0bdc6c6b2f7ae6c3493df`; base `main` |
| Stacking | Confirmed: PR #249 head is an ancestor of PR #250 head and is PR #250 base |
| Node.js | `v24.15.0` |
| npm | `11.4.2` |
| Logto version | Not observable — no endpoint or credentials |
| PostgreSQL version | Not observable — no database endpoint/credentials and no `psql` client |
| Redis version | Not observable — no endpoint/credentials and no `redis-cli` client |
| Backend deployment ID | Not available |
| Container image digest | Not available |
| Validation environment | Detached worktree at the exact PR head; code/CI preflight only |
| Evidence timestamp | Recorded in each JSON artifact in UTC |

GitHub checks observed for the exact SHA:

- Canonical authorization security gate: **failure**.
- Module control plane PostgreSQL persistence gate: **failure**.
- Vercel Preview Comments: success, but explicitly not accepted as operational evidence.
- Commit statuses: CodeRabbit success; Vercel success, neither proves authorization operation.

If the remote PR head changes, all evidence in this audit is invalid and must be regenerated.

## 3. Requirements matrix

| Issue | Requirement | Code present | Deployed | Operational test | Evidence | Result | Blocker | Owner |
|---|---|---:|---:|---:|---|---|---|---|
| #217 | Real Logto custom-claim context exposes durable membership binding | Yes, probe code | No | No | `artifacts/phase3/217/logto-custom-token-context-capability.json` | BLOCKED | Logto endpoint/version/M2M and tenant unavailable | Identity/Platform |
| #217 | Real remote plan/drift/apply/idempotency/rollback | Partial client code | No | No | `artifacts/phase3/217/logto-custom-claims-*.json` | BLOCKED | No validation Logto or approval | Identity/SRE |
| #217 | Cryptographically verified real organization token | Parser code only | No | No | `artifacts/phase3/217/real-token-validation.json` | BLOCKED | No real token flow or credentials | Identity |
| #217 | Schema-valid deployed principal and role paths | Yes | No | No | `artifacts/phase3/217/principal-runtime-matrix.json` | BLOCKED | No deployed backend/real token | Backend/Authz |
| #217 | Revocation/freshness within SLO | Primitive present | No | No | `artifacts/phase3/217/revocation-and-freshness-evidence.json` | BLOCKED | No Logto/backend/Redis environment or defined observed SLO | SRE/Authz |
| #217 | Executable delegated session DoD | Service primitive present | No | No | `artifacts/phase3/authorization-resilience-matrix.json` | BLOCKED | No deployed session integration/audit store | Backend/Authz |
| #218 | Complete real legacy inventory | Static scanner only | No | No | `artifacts/phase3/218/legacy-reference-inventory.json` | BLOCKED | No PostgreSQL/Redis/deployment access | DBA/Data owner |
| #218 | Reviewed reconciliation of ambiguous rows | Schema/table present | No | No | `artifacts/phase3/218/taxonomy-v2-reconciliation-plan.json` | BLOCKED | No inventory or human mappings | DBA/Product data owner |
| #218 | Migration apply/rollback/idempotency | SQL present | No | No | `artifacts/phase3/218/migration-*.json` | BLOCKED | No real restored snapshot | DBA/SRE |
| #218 | Mandatory membership/template/strategy enforcement | Code present | No | Unit only | `artifacts/phase3/218/assignment-enforcement-matrix.json` | NOT OPERATIONAL | No PostgreSQL-backed service | Backend/Authz |
| #218 | Organization-structure reconciliation remains functional | Code present | No | Yes, code gate | `artifacts/phase3/preflight-code-and-ci.json` | **FAIL** | `scope_template_not_found` regression | Backend/Authz |
| #218 | PostgreSQL assignment round trip | Schema/migration present | No | No | `artifacts/phase3/218/postgres-assignment-roundtrip.json` | BLOCKED | No PostgreSQL | DBA/Backend |
| #218 | Two-tenant operation-family enforcement | Adapters partial | No | No | `artifacts/phase3/218/multi-tenant-operation-matrix.json` | BLOCKED | No deployed two-tenant environment | SRE/Authz |

## 4. Test matrix

All commands below ran in a detached worktree at PR head `4b19a866f6eb6ff46c9d21d3d4eab6fd21aa999f`.

| Command | Exit | Result | Classification |
|---|---:|---|---|
| `npm ci` (repository root) | 1 | FAIL: no root `package-lock.json` | Dependency installation failure |
| `npm ci` (`backend/`) | 0 | PASS; reported four moderate audit findings | Environment preparation |
| `npm run authz:data-scope-v2:check` | 0 | PASS, code/unit only | Code gate |
| `npm run taxonomy:contract-check` | 0 | PASS, code/unit only | Code gate |
| `npm run taxonomy:migration-check` | 0 | PASS, static; no DB | Code gate |
| `npm run authz:data-scope-contract-check` | 0 | PASS, in-memory/unit only | Code gate |
| `npm run authz:data-scope-migration-check` | 0 | PASS, static; no DB | Code gate |
| `npm run organization-structure:data-scope-integration-check` | 1 | FAIL: 3 of 6 tests fail with `scope_template_not_found` | **PR #250 regression / real authorization integration failure** |
| `npm run logto:authz:contract-check` | 0 | PASS, mocks/static only | Code gate, not Logto evidence |
| `npm run logto:custom-claims:check` | 0 | PASS, desired local plan only | Code gate, not remote evidence |
| `npm run authz:permission-catalog:check` | 0 | PASS | Code gate |
| `npm run authz:role-model:check` | 0 | PASS | Code gate |
| `npm run authz:policy-contract-check` | 0 | PASS | Code gate |
| `npm run authz:security-gate:check` before backend install | 1 | FAIL: missing `jose` | Dependency installation failure |
| `npm run authz:security-gate:check` after `backend/npm ci` | 0 | PASS | Code gate; remote GitHub check remained red at observation time |
| `npm run authz:runtime-consistency-check` | 0 | PASS, unit/in-memory only | Code gate |

Machine-readable command evidence is in `artifacts/phase3/preflight-code-and-ci.json`.

## 5. Security findings

### P0

1. **Mandatory downstream authorization integration is broken.** Scope projection reconciliation creates assignments without the newly mandatory governed template inputs, producing `scope_template_not_found`. This blocks PR merge and #218 closure.
2. **No operational identity evidence exists.** No real Logto context, script read/apply/rollback, token, membership binding, or deployed principal was observed. #217 cannot close.
3. **No operational PostgreSQL evidence exists.** Migration safety, persistence round trip, tenant ownership, rollback, restart recovery, and inventory are unproven. #218 cannot close.

### P1

1. Root `npm ci` cannot run because there is no root lockfile, so the prescribed reproducible preflight fails.
2. GitHub's Canonical authorization security check was red for the exact SHA when collected. A later local rerun does not replace the required remote same-SHA check.
3. Delegation and freshness were only exercised as isolated/in-memory tests, which the validation policy explicitly excludes as operational evidence.
4. Full cross-tenant, operation-family, resilience, and attack matrices were not executable without a deployed environment.

### P2

1. `backend/npm ci` reports four moderate dependency vulnerabilities; triage is required even though it did not block test execution.
2. The custom-JWT Management API path is deployment-version configuration. Its correctness against the production-equivalent Logto version remains unverified.

### P3

None classified; missing evidence affecting closure is not downgraded to P3.

## 6. Migration findings

No database was contacted. Therefore no claim is made about row counts, locks, foreign keys, runtime duration, cross-tenant mappings, rollback, or data preservation. The code includes a reviewed reconciliation-plan table and subsequent migration gates, but only a real pre-migration inventory can determine whether ambiguous rows are fully classified. The static migration gates passed; that is not a dry-run.

Verdict for #218 remains `BLOCKED_BY_CODE` because a mandatory integration gate is already red, independently of the environment blocker. Once the code regression is fixed, absence of a restored PostgreSQL snapshot would still yield `BLOCKED_BY_ENVIRONMENT` or `BLOCKED_BY_MIGRATION` depending on unresolved rows.

## 7. Logto findings

No `LOGTO_ENDPOINT`, production-equivalent Logto version, M2M credentials, custom-JWT Management API path, validation application credentials, synthetic users, or approval were available. The audit did not create a JavaScript context or synthetic JWT and did not treat mocks as evidence. Remote script hash, backup, apply, noop, stale-plan handling, duplicate idempotency behavior, rollback, JWKS validation, and membership correspondence all remain unverified.

Verdict for #217 is `BLOCKED_BY_ENVIRONMENT`, not PASS and not a capability finding: without the deployed Logto probe, the audit cannot determine whether the required durable membership ID exists. If the real probe shows it does not, the verdict must change to `BLOCKED_BY_LOGTO_CAPABILITY`.

## 8. Multi-tenant findings

No backend from the PR SHA was deployed and no two-organization validation dataset existed. Consequently, no operational tenant-isolation claim is made for get/list/count/search/export/bulk/mutation/create/update/delete/approval/job/federated paths. Static and unit gates that passed are recorded only as code evidence.

## 9. Residual risks

- PR head may change; evidence then becomes stale.
- Both GitHub authorization/security and PostgreSQL persistence jobs were red at final observation time.
- Logto custom-JWT endpoint/version capability is unknown.
- Migration may encounter ambiguous rows, unexpected JSON/text references, lock contention, or rollback incompatibility.
- Redis/cache and event propagation under outage, duplication, delay, or reordering are untested.
- Audit correlation/redaction on actual deployed allow/deny paths is untested.
- Backward application rollback after v2 migrations is untested.

## 10. Closure recommendation

- **Do not merge PR #250.** Fix and rerun the failing organization-structure/Data Scope integration gate first.
- **Do not close #217.** Real Logto capability, controlled apply/rollback, a real validated token, deployed principal schemas, revocation SLO, delegation integration, and same-SHA evidence are absent.
- **Do not close #218.** Real legacy inventory, reviewed mappings, PostgreSQL dry-run/apply/rollback/idempotency, persistence round trip, zero deployed legacy references, and full multi-tenant operation coverage are absent; additionally, a mandatory integration gate fails.

The next validation must use an isolated production-equivalent environment and start only after a new PR SHA has green mandatory CI. It must regenerate every artifact because the current manifest intentionally declares `sameShaEvidenceComplete: false`.
