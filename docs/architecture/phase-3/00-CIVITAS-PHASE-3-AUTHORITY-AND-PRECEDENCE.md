# CIVITAS Phase 3 — Authority and Precedence

> **Historical legacy strings: explicitly marked.** Any `academic.section` or `academic.grade_level` below is retained only as historical/migration evidence; it is not an active alias.


**Contract version:** `civitas-phase3-authority/v1`  
**Repository:** `didaxus/civitas10`  
**Status:** `normative`  
**Production impact:** `NO_GO` until the Phase 3 Definition of Done passes

## 1. Purpose

This document defines which artifact is authoritative for each Phase 3 concept, how conflicts are resolved, and how documents, issues, pull requests, checkers and audit reconciliation relate to one another.

The audits agree that the direction of the architecture is valid but the repository still contains contract drift in token claims, Data Scope taxonomy, REST permission identity, tenant evidence and MCP materialization. Those gaps are treated as blockers, not as permission to invent local exceptions.

## 2. Precedence order

```text
Canonical document
  -> defines the normative contract and version

Machine-readable contract
  -> encodes identities, schemas and lifecycle

Issue
  -> implements a bounded part of the contract

Pull request
  -> contributes code, migrations and evidence

Checker
  -> proves static and repository consistency for one SHA

Audit reconciliation
  -> accepts, rejects, defers or blocks closure

Production evidence
  -> authorizes promotion to active/production
```

A lower layer cannot silently redefine a higher layer. An issue body, PR description or generated file does not override the canonical contract.

## 3. Authority map

| Concept | Canonical authority | Machine authority | Derived consumers |
|---|---|---|---|
| Repository identity | this document | manifest repository field | issues, checkers, links |
| Permission identity/lifecycle | `10` and existing permission catalog contract | `contracts/authorization/civitas-permission-catalog.yaml` | role model, OpenAPI, MCP, UI |
| Token custom claims | `11` | `token-claims.schema.json` | Logto plan, principal builder |
| Principal | `11` | `principal.schema.json` | REST, MCP, workers, BFF |
| Role path | `11` | `role-path.schema.json` | authorization evaluator |
| Data Scope dimensions | `12` | `data-scope-dimensions.yaml` | taxonomy, onboarding, SCIM, modules |
| Data Scope strategies | `12` | `data-scope-strategies.yaml` | evaluator, scope templates |
| Owner scope templates | `12` | `owner-scope-templates.yaml` | tenant configuration |
| Authorization pipeline | `13` | existing policy/evaluator contracts plus schemas | API, MCP, workers |
| Application service ownership | `22` | `application-service-registry.yaml` | REST, MCP, UI, workers |
| REST delivery | `20` | `contracts/openapi/modules/*.yaml` | gateway, clients, tests |
| MCP delivery | `21` | `contracts/mcp/modules/*.tools.yaml` | shared MCP runtime |
| Dependency order | `01` | issue traceability in manifest | Epic #200 |
| Activation/DoD | `31` | checker manifest and production evidence | issue closure, release |

## 4. Separation of authorities

```text
Logto
  identity, authentication, organizations, memberships,
  token issuance and materialized role IDs

Civitas Authorization
  canonical permissions, role potential, Owner Ceilings,
  Tenant Activations, PBAC, ABAC/Data Scope and final allow/deny

Application services
  governed business use cases and invariants

REST / MCP / UI / workers
  delivery adapters that call application services

Module runtimes and providers
  replaceable execution details behind ports/adapters
```

Logto is never the business PDP. OpenAPI is never the permission catalog. MCP descriptions are never policy. UI visibility is never authorization.

## 5. State dimensions

Every operation, permission, service, module and tool must keep these dimensions separate:

```text
targetStatus: proposed | planned | active | deprecated | removed
observedImplementation: absent | partial | present | verification_required
deploymentStatus: not_deployed | deployed | degraded | unavailable | retired
activationEligibility: blocked | eligible | active
```

A closed issue or merged PR may change `observedImplementation`; it does not automatically change `activationEligibility`.

## 6. Closed issues and v2 deltas

Issues `#161–#167` remain closed and are treated as the completed v1 foundation baseline. They are not reopened merely because v2 contracts exist.

Open issues version or extend that baseline:

- `#217` owns the token principal and membership-bound role path delta.
- `#218` owns Data Scope taxonomy v2 and migration.
- `#174` owns ADR-003 closure and module catalog decision.
- `#188` owns Planning activation evidence.
- `#194–#196` own MCP foundation, reads and writes.
- `#199` owns production readiness.
- `#200` reflects the dependency roadmap.

After #217/#218, the outputs of #161–#166 must be regenerated and revalidated. That is downstream verification, not reopening history.

## 7. Documents preserved

### Preserved as normative or executable baseline

- the canonical permission catalog and generated role model;
- the unified authorization evaluator and policy registry;
- module catalog v2 and runtime foundation;
- outbox/inbox/DLQ/operation ledgers;
- Planning contracts and parity gates, subject to evidence reconciliation;
- SCIM/Federation foundation, subject to production evidence;
- Tenant Resolution contracts, subject to runtime implementation.

### Preserved as non-normative evidence

The audit documents `40–47` and their manifest remain evidence tied to the audited SHA. They do not become runtime authority.

### Historical but superseded where they conflict

- issue prose that still references the superseded repository owner/path;
- v1 token claim allowlists missing membership binding;
- Data Scope v1 dimension lists and permanent aliases for `academic.grade_level` or `academic.section`;
- REST/MCP proposal lists that do not map to an application service and canonical permission.

## 8. Conflict resolution

When two sources disagree:

1. stop activation;
2. identify the higher-precedence contract;
3. record the conflict in the issue implementing the change;
4. migrate or deprecate the lower source explicitly;
5. regenerate derived artifacts;
6. run the composed checker on one ref/SHA;
7. attach evidence before closure.

No alias, permission, dimension, tenant or role path may be inferred to make a checker pass.

## 9. Required issue metadata

Each Phase 3 issue must contain:

```text
Canonical document:
Section:
Contract version:
Depends on:
Produces:
Validates with:
Activation impact:
Rollback:
```

The checker validates that referenced documents and sections exist.

## 10. Canonical invariants

1. Logto authenticates/materializes; Civitas authorizes.
2. A permission has one authored identity.
3. `planned` is not executable or provisionable.
4. Complete role paths are evaluated independently; no fragment composition.
5. Missing, stale or wrong-tenant scope denies.
6. Taxonomy dimensions never grant access by themselves.
7. Tenant context is never taken from untrusted body/query/header/prompt input.
8. REST, MCP, UI and workers reuse application services.
9. Provider names do not appear in canonical IDs.
10. MCP does not accept authority from prompts.
11. Promotion requires code, consumer, policy, tests, deployment, observability and rollback.
12. Evidence must belong to the same repository ref/SHA and contract versions.

## 11. Final rule

> Canonical documents define the contract, machine-readable files encode it, issues implement bounded parts, PRs contribute evidence, checkers verify one SHA, and audit reconciliation decides whether closure or activation is justified.
