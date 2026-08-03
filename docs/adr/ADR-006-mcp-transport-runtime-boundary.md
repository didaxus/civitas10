# ADR-006: MCP Transport/Runtime Boundary and Trust Architecture

## Status

Proposed

## Context

Civitas requires a canonical MCP runtime that integrates with existing authorization, audit, rate limiting, and application services without duplicating security boundaries or creating REST loopback patterns. Issues #144, #164, #166, and #180 identify the need for:

- Frozen transport/runtime/deployment boundaries
- Versioned principal, delegation/consent, and tool registry contracts
- Integrated authz, audit, rate/usage, and application service ports
- Organization reconciliation from principal context, not prompt authority
- Rejection of generic SQL/provider/URL tools and prompt-supplied authority

Early MCP designs risked turning AI transport into domain architecture, duplicating authorization/audit logic, and allowing dangerous capabilities like `execute_sql`, `call_provider`, arbitrary URL fetching, or wildcard tool exposure.

## Decision

### Runtime Architecture

The MCP runtime is an in-process adapter layer that terminates authenticated MCP connections and invokes application services through versioned ports. The architecture enforces:

```text
untrusted prompt / MCP client
          │ authenticated MCP transport (untrusted arguments)
          ▼
MCP ingress trust boundary
  client authentication + audience + replay checks
  principal/delegation/consent validation
  organization reconciliation from principal.tenantId
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

### Principal Types

Three principal types with mandatory fields:

**User Principal:**
- `type: "user"` where `subjectId === authenticatedClientId`
- Represents authenticated human users
- Delegation chain optional

**Agent Principal:**
- `type: "agent"` where `subjectId` identifies the agent, `authenticatedClientId` identifies the agent's credential
- Represents AI agents with delegated authority
- Delegation chain required for R1/R2 operations

**System Principal:**
- `type: "system"` for automated processes
- `authenticatedClientId` identifies the system identity
- No delegation chain permitted

All principals include:
- `schemaVersion: "civitas.mcp.principal/v1"`
- `tenantId` for organization reconciliation
- `delegation` chain (optional for user/system)

### Tool Contract

Tools are governed by a versioned manifest with strict lifecycle:

```json
{
  "schemaVersion": "civitas-mcp-tool-manifest/v1",
  "moduleId": "planning",
  "gateEvidence": {
    "applicationServices": ["planning.list", "planning.read"],
    "issue188": "evidence-ref",
    "issue194": "evidence-ref"
  },
  "confirmationPolicyVersion": "civitas.confirmation/v1",
  "tools": [
    {
      "toolId": "planning.list",
      "version": "1.0.0",
      "applicationServiceId": "planning.listPlans",
      "permissionId": "planning:read",
      "risk": "R0",
      "effect": "read",
      "idempotency": "forbidden",
      "ifMatch": "none",
      "makerChecker": false,
      "status": "active",
      "inputSchema": {...},
      "outputSchema": {...},
      "pagination": {"maxLimit": 100, "defaultLimit": 20},
      "outputLimits": {"maxSizeBytes": 65536}
    }
  ],
  "runtimeControls": {
    "timeoutMs": 5000,
    "maxConcurrentPerTenant": 100
  }
}
```

**Lifecycle States:**
- `draft` → `review` → `approved` → `planned` → `active` → `deprecated` → `removed`
- Only `active` tools are executable
- `approved` and `planned` require review evidence before activation
- Removal preserves audit history

**Risk Levels:**
- `R0`: Read-only, no consent required
- `R1`: Write operations, implicit consent via authorization
- `R2`: Destructive/approval operations, explicit consent with nonce

### Input Schema Constraints

- Schemas are closed/bounded at tool registration
- No arbitrary string patterns that could encode SQL, URLs, or provider commands
- Organization ID comes from `principal.tenantId`, never from input
- Pagination enforced with hard limits
- Output size bounded to prevent memory exhaustion

### Handler Execution Model

Handlers **must** call application service ports or remote ports:

```javascript
// CORRECT: Application service invocation
async function execute(request, context) {
  const result = await applicationServicePort.invoke(
    tool.applicationServiceId,
    normalizedInput,
    { principal: context.principal, decisionId: authz.decisionId }
  );
  return result;
}

// FORBIDDEN: REST loopback
async function execute(request, context) {
  // NEVER do this:
  return fetch(`http://localhost:${PORT}/api/v1/...`);
}

// FORBIDDEN: Direct database access
async function execute(request, context) {
  // NEVER do this:
  return pool.query('SELECT ...');
}

// FORBIDDEN: Provider SDK calls
async function execute(request, context) {
  // NEVER do this:
  return stripe.customers.create(...);
}
```

### Prohibited Capabilities

The following tool types are structurally rejected:

1. **SQL Execution**: `execute_sql`, `run_query`, `database_command`
2. **Provider Calls**: `call_provider`, `invoke_stripe`, `send_twilio`
3. **URL Fetching**: `fetch_url`, `http_request`, `webhook_call` (except registered webhooks)
4. **Wildcard Tools**: `any_operation`, `dynamic_action`, `prompt_defined_tool`
5. **Prompt Authority**: Any tool accepting organization/tenant from input

### Authorization Adapter

Authorization uses the same PBAC/data-scope engine as REST:

- Permission ID from tool manifest
- Risk level evaluated against delegation ceiling
- Data scope projected from principal's organization
- Decision includes `decisionId` for audit correlation

```javascript
const decision = await authorizationPort.authorize({
  principal,
  permissionId: tool.permissionId,
  toolId: tool.toolId,
  risk: tool.risk
});
if (!decision?.allowed) throw new Error('tool_authorization_denied');
```

### Audit Requirements

Every tool execution produces correlated audit records:

```javascript
await auditPort.record({
  eventType: 'mcp.tool.executed.v1',
  tenantId: principal.tenantId,
  toolId: tool.toolId,
  toolVersion: tool.version,
  principalId: principal.subjectId,
  decisionId: decision.decisionId,
  correlationId: context.correlationId,
  delegationId: principal.delegation.links.at(-1)?.delegationId || null,
  outcome: 'succeeded' | 'failed',
  startedAt: ...,
  completedAt: ...,
  errorCode: ... // if failed
});
```

### Rate Limiting and Usage

Rate limits are enforced per tenant/tool/principal:

```javascript
const quota = await usagePort.consume({
  tenantId: principal.tenantId,
  toolId: tool.toolId,
  principalId: principal.subjectId,
  units: 1,
  correlationId: context.correlationId
});
if (!quota?.allowed) throw new Error('rate_limit_exceeded');
```

Usage buckets are PostgreSQL control-plane state, not process memory.

### Kill Switch

Emergency disablement operates at three scopes:

- **Global**: All tenants, all tools
- **Tenant**: Specific tenant, all tools
- **Tool**: Specific tool/version across tenants

Kill switch state is authoritative PostgreSQL state checked before every execution:

```sql
SELECT 1 FROM mcp_kill_switches 
WHERE enabled = true 
  AND (scope = 'global' 
       OR (scope = 'tenant' AND tenant_id = $1) 
       OR (scope = 'tool' AND tool_id = $2 AND (tool_version IS NULL OR tool_version = $3)))
LIMIT 1;
```

### Deployment Models

**In-Process (Preferred):**
- MCP adapter runs within backend application
- No network boundary between MCP and application services
- Shared PostgreSQL connection pool
- Single deployment unit

**Separate MCP Ingress (Allowed with conditions):**
- Private service-to-service boundary only
- Workload identity with explicit audience (`civitas-mcp`)
- Short-lived credentials with replay protection
- Must NOT forward user or provider tokens
- Registry, rate/usage, audit remain in control plane

## Consequences

### Positive

- Business rules remain independent from AI transport
- REST, events, and MCP share authorization and validation boundaries
- Providers remain replaceable adapters
- Future AI clients do not redefine Civitas domains
- Kill switch provides emergency containment
- Correlated audit enables forensics across transport layers

### Negative

- MCP tools require additional contract discipline
- Application services become mandatory execution boundaries
- CI must structurally validate handler implementations
- Deployment complexity for separate MCP ingress

### Risks Mitigated

- **REST Loopback**: Structural rejection via port-based architecture
- **SQL Injection**: No SQL tools permitted; input schemas closed
- **Provider Lock-in**: Provider calls only through adapters
- **Prompt Injection**: Organization from principal, not input
- **Resource Exhaustion**: Output limits, timeouts, rate limits
- **Unauthorized Access**: Same authz as REST with delegation ceilings

## Compliance Rules

### CI Validation

CI must structurally parse handlers and reject:

1. Direct SQL/database access (`pool.query`, `drizzle.select`, etc.)
2. Provider credentials in handler scope
3. Arbitrary URL construction or fetching
4. REST loopback (HTTP calls to own endpoints)
5. Wildcard tool definitions
6. Missing application service binding

### Contract Versioning

- Principal schema: `civitas.mcp.principal/v1`
- Delegation chain: `civitas.mcp.delegation-chain/v1`
- Consent: `civitas.mcp.consent/v1`
- Tool manifest: `civitas-mcp-tool-manifest/v1`

Breaking changes require new major version and migration path.

### Evidence Requirements

Tool activation requires:

1. Registered application service
2. Registered permission
3. Review evidence (`reviewId`)
4. Rollback reference (`rollbackRef`)
5. Gate evidence for issues #188, #194

## Related Decisions

- ADR-001: MCP Boundary in Civitas
- ADR-002: REST API boundary for Civitas v1
- ADR-003: Module Catalog V2 Federated Runtime
- ADR-005: AI Artifact Data Governance

## References

- Issue #144: Transport/runtime boundary definition
- Issue #164: Principal and delegation contracts
- Issue #166: Tool registry and lifecycle
- Issue #180: Authorization adapter integration
