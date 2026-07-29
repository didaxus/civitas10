# CIVITAS REST Module Surfaces v1

**Contract version:** `civitas-rest-module-surfaces/v1`  
**Status:** `normative contract; operations planned by default`

## 1. Role of REST

REST is the canonical public synchronous API surface for Civitas modules. It is provider-neutral and exposes governed application services, not provider SDKs, database tables or role-specific endpoints.

```text
Client
-> Civitas REST gateway
-> tenant/principal/authz/availability
-> application service
-> local or federated port
```

## 2. Canonical modules

```text
analytics
community
crm
hr
lms
marketing
payments
planning
reports
scheduling
support
```

Provider names such as Moodle, Canvas, Stripe, HubSpot, Ágora or Plasma never become canonical path, permission, capability or operation identities.

## 3. Module terminology

For learning surfaces:

```text
Subject: discipline
Course: curricular definition
Class/CourseOffering: delivered instance
Group: operational membership grouping
Cohort: progression/admission grouping
```

Adapters may map provider-specific resources, but the public contract uses the canonical terms.

## 4. Operation metadata

Every OpenAPI operation declares:

```text
operationId
x-civitas-module
x-civitas-capability
x-civitas-application-service
x-civitas-permission
x-civitas-data-scope-strategy
x-civitas-surface
x-civitas-status
x-civitas-issue-refs
x-civitas-audit
x-civitas-idempotency
x-civitas-execution
```

The referenced identities must exist in their canonical registries.

## 5. Status rule

```text
OpenAPI documented
!= route mounted
!= permission active
!= module installed
!= production active
```

All module fragments in this package are `planned`. They are contract seeds and parity fixtures, not permission to mount routes.

## 6. Security and tenant rules

- server-side authorization is mandatory;
- query filtering occurs before pagination/count/export;
- resource ownership is asserted in service/repository layers;
- tenant IDs from body/query are never authority;
- Organization Portal uses host-bound BFF context;
- Core Manager uses explicit operation selection and reauthorization;
- errors are neutral across tenants;
- protected mutations require concurrency and idempotency contracts.

## 7. HTTP semantics

- `application/problem+json` follows RFC 9457 for REST errors;
- SCIM retains RFC 7644 error semantics on SCIM surfaces;
- GET/HEAD are non-mutating;
- create/command operations declare `Idempotency-Key` requirements;
- updates declare ETag/If-Match when stale writes are possible;
- async work returns an operation resource rather than pretending synchronous completion.

## 8. Application service ownership

The registry at `contracts/delivery/application-service-registry.yaml` is the bridge between authorization and delivery. Controllers remain thin and may not implement business authorization, provider calls or direct persistence logic.

## 9. Initial contract seeds

This package includes a small read-oriented operation set for all eleven modules and a bounded Planning example. It deliberately does not reproduce a 115-operation backlog as executable surface. Expansion occurs only after the reference vertical and parity gates pass.

## 10. Activation evidence

Per operation:

```text
canonical permission active
service implementation present
module availability executable
Data Scope reviewed
negative tests
real consumer
deployment
telemetry/SLO
rollback
same-SHA evidence
```

## 11. Rollback

Rollback disables route/contribution/tenant activation without deleting canonical data or audit history. Provider adapters may be detached independently from the public contract.
