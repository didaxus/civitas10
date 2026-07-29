# ADR-001: MCP Boundary in Civitas

## Status

Accepted

## Context

Civitas integrates external systems and future AI agents. Early designs treated MCP connectors as the primary integration architecture. This creates a risk where AI transport becomes coupled to business domains.

## Decision

MCP is an integration and AI exposure layer, not the Civitas domain architecture.

The canonical transport is an authenticated MCP connection terminated by the shared server adapter. The adapter authenticates the client for the `civitas-mcp` audience, constructs a versioned `user`, `agent`, or `system` principal, reconciles its tenant and delegation chain, and invokes an application service through a port. Tool handlers never call Civitas REST endpoints (including loopback), databases, SQL, providers, or arbitrary URLs. A separately deployed MCP process may cross only a private service-to-service boundary with workload identity, an explicit audience, short-lived credentials and replay protection; it must not forward a user or provider token.

The ownership model is:

```text
Module
  |
  Capability
  |
  Application Service
  |
  Adapter
  |
  Provider

MCP
  |
  Tool exposure of approved operations
```

### Deployment and trust boundaries

```text
untrusted prompt / MCP client
          │ authenticated MCP transport (untrusted arguments)
          ▼
MCP ingress trust boundary
  client authentication + audience + replay checks
  principal/delegation/consent validation
          │ trusted principal; still-untrusted tool input
          ▼
governed registry and authorization boundary
  lifecycle + tenant enablement + kill switches
  PBAC/Data Scope + rate/usage + closed schemas
          │ authorized, normalized command
          ▼
application service / ports ── provider adapter ── external provider
          │
          └── correlated audit and usage persistence
```

The preferred deployment is in-process with the backend application-service registry, because it introduces no network authority shortcut. A separate horizontally scaled MCP ingress is allowed only when the private boundary above is implemented. Registry, rate/usage buckets, correlated audit, nonce/idempotency records, and global/tenant/tool kill switches are durable PostgreSQL control-plane state; process memory is never authoritative.

### Governance contracts

Principal, delegation-chain, and consent payloads have independent schema versions. Agent and system principals always identify their authenticated client. Delegation links are ordered, contiguous, expiring and narrowing. R2 consent is bound to principal, tenant, exact tool version, normalized-argument digest, expiry, and a one-use nonce.

Tool lifecycle is strictly `draft → review → approved → planned → active → deprecated → removed`. Transitions are audited. Activation additionally requires a registered application service and permission plus review and rollback evidence. `approved` and `planned` are non-executable; removal does not erase history. Emergency disablement is independent of lifecycle and fails closed at global, tenant, and tool/version scopes.

## Consequences

Positive:

- business rules remain independent from AI transport;
- REST, events, and MCP share authorization and validation boundaries;
- providers remain replaceable adapters;
- future AI clients do not redefine Civitas domains.

Negative:

- MCP tools require additional contract discipline;
- application services become mandatory execution boundaries.

## Rules

- MCP tools must not contain business logic.
- MCP tools must not bypass authorization.
- MCP schemas must map to approved Civitas operations.
- Provider-specific MCP servers may exist behind adapters when required.
- CI structurally parses handlers and rejects direct SQL/database access, provider credentials, arbitrary URLs, REST loopback and wildcard tools.

## Scope

This ADR applies to all Civitas modules:

- lms
- crm
- marketing
- community
- payments
- hr
- scheduling
- support
- analytics
- reports

Ágora and Plasma integration details are defined separately in their own technical documents.
