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

Cache keys include tenant, principal/membership binding, role path, permission, policy, scope and module versions. Events for membership, roles, ceilings, activations, dimensions, assignments, relationships, module availability and hostname/session changes invalidate affected snapshots.

A cache miss may recompute. An unavailable authority must not use an unbounded stale fallback for protected mutations.

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
