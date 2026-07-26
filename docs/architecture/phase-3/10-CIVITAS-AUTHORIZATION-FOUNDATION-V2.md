# CIVITAS Authorization Foundation v2

**Contract version:** `civitas-authorization-foundation/v2`  
**Extends:** closed foundation #161–#166  
**Status:** `normative`

## 1. Purpose

Authorization v2 preserves the existing catalog, role-model, PBAC, ABAC and CI foundation while replacing two unstable edges: the token principal/membership boundary and the Data Scope taxonomy.

## 2. Effective authorization formula

```text
verified tenant and principal
AND canonical permission exists and is active
AND surface matches
AND one complete membership-bound role path contains role potential
AND Owner Ceiling allows
AND Tenant Activation enables
AND module/capability is installed, compatible and available
AND required PBAC policies pass
AND Data Scope strategy resolves a tenant-safe constraint
AND resource ownership passes
AND authorization snapshot is current
= allow
```

Every other state denies with a machine-readable reason code.

## 3. Role potential is not a grant

The thirteen organization roles and their bundles define potential only. A role assignment does not automatically activate every candidate permission. Bundle keys, namespaces and wildcards are never emitted as scopes or accepted by runtime guards.

## 4. Complete-path OR

For a principal with multiple roles:

```text
path A = membership + role A + permission + ceiling + activation + policy + scope
path B = membership + role B + permission + ceiling + activation + policy + scope

allow when A passes OR B passes
```

It is forbidden to borrow permission potential from one role and Data Scope from another.

## 5. Owner and tenant boundaries

- Owner Ceiling defines the maximum capability that can ever be offered.
- Tenant Activation selects an allowed subset.
- A tenant cannot unlock, widen or replace a ceiling.
- Critical changes require actor, reason, version, audit and rollback metadata.
- Account/self capabilities are not converted into organization-role grants.
- Owner/platform capabilities never enter organization role scopes.

## 6. Versioned outputs

Authorization decisions record:

```text
permissionCatalogVersion
catalogHash
roleModelVersion
authzContractVersion
principalContractVersion
dataScopeDimensionVersion
dataScopeStrategyVersion
scopeTemplateVersion
policySnapshotVersion
moduleAvailabilityVersion
```

A stale or incompatible snapshot denies.

## 7. Existing foundation preserved

The v1 permission catalog, role model generator, authorization evaluator, Logto plan/apply workflow, security gate, module availability resolver and audit/outbox patterns are preserved. v2 requires them to consume the new principal and Data Scope contracts and to regenerate their outputs.

## 8. Required v2 deltas

1. exactly three minimal custom claims when the trusted issuance path supports them;
2. approved server-controlled membership binding when it does not;
3. principal and role-path schemas;
4. Data Scope dimension, strategy and template registries v2;
5. unified `DataScopeEvaluationRequest`;
6. exact REST/MCP/application-service parity;
7. issue and evidence traceability;
8. tenant-context enforcement for portal, Core Manager, workers and MCP.

## 9. No shortcuts

Forbidden:

- authorizing directly from JWT role strings;
- defaulting missing Data Scope to organization-wide;
- local permission IDs in controllers or tools;
- hidden UI as a security control;
- external group -> canonical role direct materialization;
- using an `organizationId` supplied by a prompt or browser as authority;
- marking `active` because an issue is closed.

## 10. Revalidation gates

```text
authz:permission-catalog:check
authz:role-model:check
logto:authz:contract-check
authz:policy-contract-check
authz:data-scope-contract-check
authz:security-gate:check
phase3:authorization-contract:check
phase3:data-scope-taxonomy:check
phase3:rest-mcp-parity:check
```
