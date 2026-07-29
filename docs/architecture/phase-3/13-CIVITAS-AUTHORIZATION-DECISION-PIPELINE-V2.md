# CIVITAS Authorization Decision Pipeline v2

**Contract version:** `civitas-authorization-decision/v2`  
**Status:** `normative`

## 1. Single evaluator

All delivery surfaces call one authorization service. Modules must not implement local role checks, local permission aliases or custom tenant bypasses.

## 2. Pipeline

```text
1. Verify request/transport and tenant context
2. Build and validate principal
3. Resolve canonical permission and surface
4. Verify permission active and contract versions compatible
5. Resolve module/capability availability
6. Build membership-bound role paths
7. For each path:
     role potential
     Owner Ceiling
     Tenant Activation
     required PBAC policies
     Data Scope strategy/assignments
     resource ownership assertion
8. OR complete passing paths
9. Emit allow/deny, reason code, constraints and provenance
10. Audit and publish invalidation/operation events as required
```

## 3. Inputs

```ts
AuthorizationDecisionRequest = {
  principal,
  tenantContext,
  permissionId,
  capabilityId,
  operationId,
  surface,
  moduleId,
  resourceDescriptor,
  requestContext,
  expectedVersions
}
```

No input field supplied by a browser, prompt or external directory becomes authority without trusted reconciliation.

## 4. Output

```ts
AuthorizationDecision = {
  allowed,
  reasonCode,
  decisionId,
  evaluatedRolePathId,
  queryConstraint,
  resourceAssertions,
  policyResults,
  versions,
  expiresAt,
  auditMetadata
}
```

Sensitive facts are redacted from user-facing errors.

## 5. Data Scope integration

The policy `authorization-data-scope-valid` and the evaluator consume the same `DataScopeEvaluationRequest`. The request includes the full principal and capability. A reduced `{subject, operation, resource}` shape is invalid for v2.

An integration test must traverse:

```text
authorize()
-> policy registry
-> Data Scope evaluator
-> query constraint
-> repository filtering
-> resource assertion
```

with two tenants and multiple roles.

## 6. Reason codes

Minimum categories:

```text
permission_unknown
permission_inactive
surface_mismatch
principal_invalid
membership_binding_missing
membership_stale
role_path_missing
role_permission_missing
owner_ceiling_denied
tenant_activation_denied
module_unavailable
policy_failed
data_scope_strategy_unknown
data_scope_assignment_missing
data_scope_snapshot_stale
resource_wrong_tenant
resource_forbidden
registry_contract_mismatch
authorization_snapshot_stale
```

## 7. Tenant enforcement

- Portal requests reconcile host, BFF session, principal, route and resource.
- Core Manager operations reauthorize the selected organization.
- Workers and MCP use authenticated/signed tenant execution context.
- Tenant mismatch is denied before revealing resource existence.

## 8. Caching and invalidation

### 8.1 Final-decision cache safety rule

An `allow` or `deny` decision is cacheable only when the cache key, together with targeted invalidation, covers **every** input that can change that decision. The coverage is conjunctive: omitting any dimension makes the final decision non-cacheable. The key must use immutable identifiers or trusted canonical hashes and must cover:

- organization;
- subject and principal type;
- membership identity, state and version;
- the complete role path, including every role, inheritance edge, ceiling and activation;
- delivery surface, capability and operation;
- application service ID;
- canonical permission and its state/version;
- every evaluated policy and policy version;
- Data Scope strategy, template and assignment versions;
- module identity, availability and availability version;
- resource ownership, relationship and other evaluated assertion values/versions;
- session and hostname binding;
- the complete tenant context, including selected tenant and trusted execution-context version;
- the complete delegation chain, constraints, state and version;
- **all** contract versions consulted by the evaluator and its registries, not only the authorization-decision contract; and
- the authorization snapshot version.

Both positive and negative decisions follow this rule. Implementations must not treat `deny` as intrinsically safe to cache. If complete key and invalidation coverage cannot be demonstrated, the final `allow`/`deny` result **must not be cached**. In that case, caching is limited to independently validated, versioned intermediate snapshots (for example, membership, role graph, policy bundle or Data Scope snapshots); the evaluator must reassemble those snapshots and recompute the final decision for every request.

`expiresAt` and cache TTL are retention and cleanup mechanisms only. TTL is **not** a security boundary, does not compensate for a missing key dimension or invalidation event, and does not authorize stale use until expiry. A cache miss may recompute. An unavailable authority must not use an unbounded stale fallback for protected mutations.

### 8.2 Required invalidation coverage

Producers must publish versioned invalidation events after a committed change, and consumers must evict or make unreachable every final decision and intermediate snapshot affected by that change. Events must carry enough canonical identifiers and old/new versions to target the following dimensions:

| Changed dimension | Required invalidation trigger and affected data |
| --- | --- |
| Organization or tenant context | Organization lifecycle, tenant selection or trusted execution-context change invalidates organization/tenant-bound entries. |
| Subject or principal | Subject state, principal type or trusted principal reconciliation change invalidates subject-bound entries. |
| Membership | Membership grant, revoke, suspend, attribute or version change invalidates membership, derived role paths and their decisions. |
| Complete role path | Role grant/revoke, inheritance edge, ceiling or tenant activation change invalidates the role graph, every derived complete path and their decisions. |
| Surface, capability, operation or application service | Registry mapping, activation or version change invalidates entries referencing the old delivery/service tuple. |
| Permission | Permission definition, alias, state or version change invalidates entries that resolved to it. |
| Policy | Policy definition, bundle, required-policy mapping or version change invalidates evaluated policy snapshots and dependent decisions. |
| Strategy, template or assignment | Data Scope strategy, dimension, template, assignment or relationship change invalidates the corresponding scope snapshots, constraints, assertions and decisions. |
| Module availability | Module enablement, entitlement, availability or version change invalidates module-bound entries. |
| Ownership and assertions | Ownership, resource relationship or assertion value/version change invalidates assertion snapshots and resource-bound decisions. |
| Session or hostname binding | Session creation, rotation, revocation, reauthentication, hostname mapping or binding change invalidates entries for the old binding. |
| Delegation | Delegation creation, acceptance, constraint, chain, expiry, revocation or version change invalidates delegated principal/path snapshots and decisions. |
| Contract versions | Any consulted contract or registry schema/version activation or compatibility change invalidates entries carrying the old version set. |
| Authorization snapshot | Snapshot publication, supersession or revocation invalidates entries carrying the old snapshot version. |

Invalidation is part of the authorization contract, not a best-effort optimization. Consumers must reject an event whose version or identity cannot be reconciled safely and fail closed for affected final-decision cache reads until authoritative state is rebuilt.

### 8.3 Required invalidation tests

Automated integration tests must first warm both an allowed and a denied path where applicable, commit the change, deliver its invalidation event, and prove that the old decision is not returned. They must then recompute against authoritative state and assert the new outcome, constraints, provenance and versions. At minimum, separate tests are required after changes to:

1. membership grant, suspension and revocation;
2. role grants/revocations, inheritance, ceilings and activations;
3. Data Scope strategy/template/assignment, dimension or relationship scope;
4. policy content, required-policy mapping and policy version;
5. module enablement, entitlement or availability;
6. session rotation/revocation and hostname binding;
7. delegation constraints, expiry and revocation; and
8. resource ownership, relationships and evaluated assertions.

The suite must exercise targeted and broad invalidation, out-of-order and duplicate events, old/new version transitions, and two-tenant isolation. Advancing TTL alone must never be the action that makes a stale authorization result safe.

## 9. Delivery parity

REST, MCP, UI actions and workers reference an application service ID. The service registry links that ID to the canonical permission, capability, Data Scope strategy and issue provenance.

## 10. Audit

Record:

```text
decisionId, correlationId, opaque organization reference,
principal type, operation/service ID, permission, reason,
role path reference, contract versions, outcome, latency
```

Do not record tokens, cookies, prompts, secrets, raw sensitive scope facts or resource payloads.

## 11. Activation rule

A delivery adapter cannot be active when the referenced service, permission, strategy, module availability or version is missing, planned, incompatible or stale.
