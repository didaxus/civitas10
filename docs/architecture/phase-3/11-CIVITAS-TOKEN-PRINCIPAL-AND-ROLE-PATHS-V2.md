# CIVITAS Token Principal and Role Paths v2

**Contract version:** `civitas-token-principal/v2`  
**Implements:** issue #217  
**Status:** `normative / blocking`

## 1. Minimal custom claims

The target organization token contains exactly these Civitas custom claims:

```text
https://civitas.didaxus.com/claims/organization_membership_id
https://civitas.didaxus.com/claims/organization_role_ids
https://civitas.didaxus.com/claims/authz_contract_version
```

Standard OIDC/Logto claims such as `sub`, `iss`, `aud`, `exp`, `iat` and `organization_id` are not counted as Civitas custom claims.

Never include Data Scope assignments, resource IDs, groups, courses, students, policies, ceilings or tenant activations in the token.

## 2. Membership authority decision

Only two sources are allowed:

### A. Logto-issued membership ID

Allowed when the deployed Logto version and custom token context expose a real, stable organization membership identifier and the probe evidence is attached to #217.

### B. Civitas server-controlled binding

When Logto cannot emit the real ID, the browser token is insufficient for organization authorization. A trusted BFF/gateway resolves a durable binding using:

```text
issuer + subject + organization_id + connection context
```

and creates a principal with `membershipBindingSource = civitas_server_binding`.

The fallback is not a synthetic claim fabricated from subject, role or organization. It is a durable, versioned record with lifecycle, provenance, revocation and audit.

## 3. Principal

A principal contains:

```text
principalId
principalType: user | agent | system
subject
issuer
audiences
organizationId
membershipBindingId
membershipBindingSource
organizationRoleIds
contractVersion
authenticatedClientId
delegationChain
issuedAt / expiresAt
snapshotVersion
```

The principal builder validates issuer, audience, token type, time, organization, membership binding and role assignments before authorization.

## 4. Role path

Each role path is membership-bound:

```text
membershipBindingId
organizationId
logtoRoleId
canonicalRoleId
permissionId
rolePotentialVersion
membershipState
roleAssignmentState
snapshotVersion
```

A path is unusable when membership or role assignment is revoked, expired, stale, wrong-tenant or unknown.

## 5. Freshness and revocation

- Tokens are short-lived and not the sole freshness mechanism.
- Membership and role state are revalidated by bounded snapshot/cache rules.
- Revocation events invalidate authorization snapshots.
- If freshness cannot be established for a protected operation, deny.
- Hostname/session bindings are also revalidated for Organization Portal traffic.

## 6. Tenant context by surface

```text
Organization Portal:
  host == BFF session == token/principal == route == resource

Core Manager:
  selected organization is explicit per operation and reauthorized

Workers/events:
  signed TenantExecutionContext + resource ownership

MCP:
  authenticated principal + delegation + tenant context;
  never prompt-supplied organization authority
```

## 7. Complete-path behavior

Role paths are independently evaluated. The evaluator may OR complete allowed paths, but may not merge their permission, scope or policy fragments.

## 8. Required tests

- exactly three custom claims;
- unknown custom claim rejected;
- missing membership binding denied;
- revoked membership denied before resource lookup;
- role from another membership denied;
- stale role assignment denied;
- owner role in organization token rejected;
- wrong audience/resource rejected;
- two-tenant host/session/token mismatch denied;
- agent delegation cannot change organization;
- Logto probe evidence records deployed version and context fields without secrets.

## 9. Activation impact

Until this contract passes, new organization operations, tenant portal sessions and MCP tools remain `planned` or blocked.

## 10. Rollback

Rollback may restore the previous token consumer only for existing v1 surfaces behind a compatibility flag. It must never accept a token without a verifiable membership binding for a v2 operation.
