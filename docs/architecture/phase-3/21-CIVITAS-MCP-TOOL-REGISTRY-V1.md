# CIVITAS MCP Tool Registry v1

**Contract version:** `civitas-mcp-tool-registry/v1`  
**Primary issues:** `#194`, `#195`, `#196`  
**Status:** `planned / runtime not authorized by this document`

## 1. Boundary

Civitas has one shared governed MCP runtime. Modules contribute curated tools. A module does not create its own policy engine, identity system or independent MCP server by default.

```text
MCP transport
-> authenticated client/principal
-> organization and delegation reconciliation
-> tool registry
-> authorization pipeline
-> application service
-> audit/rate/output controls
```

## 2. Tool lifecycle

```text
draft -> review -> approved -> planned -> active -> deprecated -> removed
```

- `approved` means design approval, not runtime availability.
- `planned` is registered but non-executable.
- `active` requires full evidence and tenant enablement.
- rollback returns the tool to non-executable without deleting audit history.

## 3. Curated exposure

REST parity does not imply tool generation. The application-service registry explicitly declares whether MCP exposure is `none` or `curated`.

The first executable tools must be bounded Planning reads after #194. Broad multi-module catalogs remain planned.

## 4. Tool contract

Each tool declares:

```text
toolId and version
moduleId / capabilityId
applicationServiceId
permissionId / policies / Data Scope strategy
risk: R0 | R1 | R2
effect: read | write | approval | destructive
closed input schema
bounded output schema/limits
status and tenant enablement
issue provenance and rollback
```

## 5. Authority exclusion

Tool inputs must not contain:

```text
organizationId as authority
permission
role
scopeOverride
authorityOverride
provider credentials
arbitrary URL
raw SQL
```

Organization, permission and scope come from authenticated principal, registry and authorization evaluation.

## 6. Handler boundary

Handlers call application services or private runtime ports. They do not:

- call public REST loopback;
- forward user tokens to module runtimes;
- query databases directly;
- call provider SDKs directly;
- construct local authorization decisions.

For physically separate deployments, a private service-to-service contract with service identity may be used.

## 7. Risk

```text
R0: bounded read, no material side effect
R1: reversible or low-risk write
R2: high-impact, approval, publication, destructive or external handoff
```

R2 requires confirmation/consent evidence bound to principal, organization, tool/version, normalized arguments, expiry and nonce. Replays and cross-principal confirmations deny.

## 8. Controls

- per-client/principal/org/tool rate and usage limits;
- maximum list page and aggregate output size;
- redaction and classification;
- audit correlation;
- kill switch by tool/version/module/tenant;
- service identity scoped to module/capability;
- version downgrade and tool-shadowing protection.

## 9. Initial contributions

The `contracts/mcp/modules/*.tools.yaml` files are planned contributions. Their presence does not register runtime tools. The parity gate validates service and permission references while preserving non-executability.

## 10. Required adversarial tests

- alternate organization input;
- prompt permission/scope escalation;
- replay and confirmation swap;
- SSRF/arbitrary URL;
- list/output exfiltration;
- tool version downgrade/shadowing;
- direct DB/provider import;
- REST loopback/user token forwarding;
- kill-switch bypass;
- cross-tenant service identity.

## 11. Rollout

```text
#194 shared foundation
-> #195 Planning bounded reads
-> #196 selected writes with R1/R2
-> module-by-module curated expansion
```

No automatic conversion of every REST operation into an MCP tool.
