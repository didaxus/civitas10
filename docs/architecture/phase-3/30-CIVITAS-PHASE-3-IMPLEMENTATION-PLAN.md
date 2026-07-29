# CIVITAS Phase 3 — Implementation Plan

**Contract version:** `civitas-phase3-implementation-plan/v1`  
**Status:** `normative delivery plan`

## 1. Objective

Convert the audit blockers into a staged implementation that preserves the substantial existing foundation and avoids a rewrite.

## 2. Workstream A — authority and traceability

Deliver:

- authority/precedence and dependency documents;
- issue metadata template;
- repository link normalization to `didaxus/civitas10`;
- source audit and contract manifests;
- static checkers.

Exit: authority and issue traceability gates pass.

## 3. Workstream B — #217 token principal

1. execute Logto capability probe against the deployed version;
2. choose Logto membership ID or durable Civitas binding;
3. update custom claim plan to exactly three claims when emitted;
4. implement principal and role-path builders;
5. add freshness/revocation and two-tenant tests;
6. regenerate authorization artifacts.

Exit: no organization authorization path accepts an unverifiable membership.

## 4. Workstream C — #218 Data Scope v2

1. author dimensions, strategies and templates v2;
2. inventory legacy values/assignments/consumers;
3. require explicit grade_level/section migration decisions;
4. migrate values and assignments;
5. unify DataScopeEvaluationRequest;
6. update onboarding/federation/LMS/Planning mappings;
7. run zero-reference, cross-tenant and list/count/export tests.

Exit: v2 registries active, no active legacy dimension references.

## 5. Workstream D — authorization revalidation

Re-run the closed foundation gates against v2 inputs:

```text
permission catalog
role model
PBAC/policies
Data Scope
Logto plan/drift
security contract gate
```

Record catalogHash, roleModelVersion and all v2 versions for one SHA.

## 6. Workstream E — Tenant Resolution and onboarding

- implement hostname registry and trusted ingress;
- BFF host-only session, CSRF, callback/handoff;
- enforce host/session/principal/route/resource equality;
- integrate onboarding and organization URL communication;
- E2E Owner, Organization Admin and two tenants.

Exit: Organization Portal security boundary passes.

## 7. Workstream F — module and Planning reconciliation

- close #174 ADR-003;
- preserve modules planned by default;
- audit #183–#188 against actual code;
- replace self-declared pass fields with linked evidence;
- run two-tenant Planning E2E, canary and rollback.

Exit: only verified Planning entries become active.

## 8. Workstream G — REST expansion

- use the application-service registry;
- resolve `lms.courses.read` and terminology;
- deliver waves A, B and C;
- add real consumers and module-specific Data Scope reviews;
- keep operations planned until promotion evidence passes.

## 9. Workstream H — MCP

1. #194 transport/runtime/service identity and registry;
2. principal/delegation/consent and kill switch;
3. Planning read tools only;
4. R1/R2 write protocol and confirmation;
5. expand curated tools per module after REST/service maturity.

No bulk generation from OpenAPI.

## 10. Workstream I — production readiness

Under #199:

- metrics/logs/traces and SLOs;
- backup/restore with tenant/version integrity;
- replay/DLQ/reconciliation drills;
- key and service-identity rotation;
- canary/rollback and remote UI rollback;
- decommission with zero-consumer evidence;
- standards control-to-test manifest.

## 11. PR slicing

Each PR should be bounded to one contract/version or migration step. Include:

```text
Canonical document + section
Issue
Input/output contract versions
Generated artifact hashes
Commands executed
Negative tests
Activation impact
Rollback
Known gaps
```

## 12. No-go rules

- no activation while #217/#218 blockers persist;
- no automatic legacy taxonomy alias;
- no local permission creation to satisfy OpenAPI;
- no tenant BFF release without E2E;
- no MCP runtime before #194 controls;
- no production claim before #199 evidence.
