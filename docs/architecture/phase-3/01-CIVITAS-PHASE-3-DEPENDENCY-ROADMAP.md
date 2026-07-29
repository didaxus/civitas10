# CIVITAS Phase 3 — Dependency Roadmap

**Contract version:** `civitas-phase3-roadmap/v1`  
**Epic:** `#200`  
**Status:** `normative dependency order`

## 1. Baseline

Issues `#161–#167` are closed/completed and form the authorization v1 baseline. They are inputs to Phase 3 v2, not pending work to repeat.

## 2. Critical path

```text
Gate 0 — Authority freeze
  00 Authority and precedence
  01 Dependency roadmap
  issue metadata and repository links

Gate 1A — #217 Token principal v2
  Logto capability probe
  membership binding authority
  exactly three minimal custom claims when emitted
  principal and role-path schemas
  freshness and revocation

Gate 1B — #218 Data Scope taxonomy v2
  dimension registry v2
  explicit migration from grade_level/section
  strategy/template v2
  external mapping review

Gate 1C — Authorization revalidation
  regenerate permission/role artifacts
  re-run #161–#166 gates
  unify DataScopeEvaluationRequest
  validate complete-path OR

Gate 2 — Tenant and identity boundary
  Tenant Resolution runtime
  Organization Portal BFF/session/CSRF
  onboarding integration
  federation/SCIM/seat lifecycle

Gate 3 — Module governance
  close #174 ADR-003
  reconcile module catalog, ownership and lifecycle
  preserve all modules planned until complete evidence

Gate 4 — Planning reference vertical
  reconcile #183–#188 implementation and evidence
  two-tenant E2E
  canary, rollback, observability

Gate 5 — REST expansion
  application-service registry
  exact permission/service/OpenAPI parity
  module-by-module delivery

Gate 6 — MCP foundation and curated exposure
  #194 shared runtime
  #195 Planning reads
  #196 governed writes

Gate 7 — Privacy and assistance
  #197 privacy/retention/provenance
  #198 governed sources and human curation

Gate 8 — #199 Production readiness
  SLO, telemetry, backup/restore, DR,
  rotation, replay, decommission and closure evidence
```

## 3. Parallelism rules

Allowed in parallel:

- contract authoring, discovery and domain modeling;
- non-executable module OpenAPI fragments;
- provider adapter discovery;
- UI prototypes behind disabled contributions;
- threat modeling and test fixture development.

Not allowed in parallel before dependencies pass:

- activating operations before #217/#218 revalidation;
- exposing tenant portal sessions before Tenant Resolution E2E;
- registering MCP tools before #194 principal/delegation/runtime;
- promoting Planning based only on self-declared evidence JSON;
- using external group names as canonical roles.

## 4. Issue mapping

| Contract | Primary issue(s) | Closure impact |
|---|---|---|
| `11` Token principal | #217 | blocks organization authorization v2 |
| `12` Data Scope taxonomy | #218 | blocks scope migration and sensitive modules |
| `13` Decision pipeline | #217, #218 and revalidation of #161–#166 | blocks REST/MCP activation |
| `20` REST surfaces | module implementation issues | progressive, per operation |
| `21` MCP registry | #194, #195, #196 | shared runtime then curated tools |
| `22` Delivery parity | #200 and module issues | blocks drift and orphan operations |
| Planning activation | #188 | evidence, canary and rollback |
| Production DoD | #199 | final production gate |

## 5. Module expansion waves

After the Planning reference vertical:

```text
Wave A: LMS + Analytics + Reports
Wave B: Community + Scheduling + Support
Wave C: CRM + Marketing + Payments + HR
```

Each wave follows:

```text
contract
-> domain/persistence
-> application service
-> authorization and scope
-> REST adapter
-> real consumer
-> observability/rollback
-> optional curated MCP exposure
```

## 6. Promotion policy

An item remains `planned` until all are true:

- canonical identity exists;
- owner and bounded context are explicit;
- permission is active and surface-compatible;
- application service exists;
- Data Scope is explicit and not overbroad;
- tenant/module availability is enforced;
- negative and cross-tenant tests pass;
- deployment and telemetry exist;
- rollback is executable;
- evidence is bound to the tested SHA.

## 7. Roadmap status

```text
Authorization v1 baseline: closed/completed
#217: open/blocking
#218: open/blocking
Tenant Resolution runtime: not evidenced
Module catalog foundation: substantial, ADR closure pending
Planning vertical: partial implementation, evidence reconciliation pending
REST expansion: planned
MCP: planned/not implemented
Production: NO_GO
```
