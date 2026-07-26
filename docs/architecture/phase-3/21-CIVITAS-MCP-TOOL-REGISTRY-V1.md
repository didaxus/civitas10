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
arbitrary URL
SQL
provider token
service credential
```

Resource identifiers are allowed only when the server reconciles tenant ownership and Data Scope.

## 6. Principal, delegation and consent

The runtime receives the v2 principal. Agent/system principals carry authenticated client identity and a bounded delegation chain. Delegation cannot widen organization, role path, permission, capability, time window or risk allowance.

## 7. Risk classes

- `R0`: bounded read, no external side effect.
- `R1`: reversible or low-risk write with idempotency/concurrency controls.
- `R2`: critical, approval, irreversible or high-impact effect.

R2 requires a versioned confirmation/consent artifact bound to principal, tenant, tool version, normalized arguments, expiry and nonce. Confirmation is one-time and cannot be replayed across principals or tenants.

## 8. Handler boundary

Handlers are thin. They may not:

- query databases directly;
- execute SQL;
- call public REST loopback;
- forward user tokens;
- call providers directly;
- fetch arbitrary URLs;
- bypass the application-service registry.

A physically separate runtime may use a private service-to-service contract with service identity, audience, replay protection and no user-token forwarding.

## 9. Runtime controls

- allowlisted transport and clients;
- rate, concurrency and cost limits;
- bounded pagination/output;
- redaction and classification;
- kill switch by tool/version/tenant/module;
- audit with decision/correlation/delegation IDs;
- version compatibility and downgrade prevention;
- replay and idempotency protection.

## 10. Initial files

The files under `contracts/mcp/modules` are planned registry contributions. They demonstrate parity and provider neutrality. They are not proof that an MCP runtime exists or that a tool is active.

## 11. Required adversarial tests

- prompt-supplied organization/permission/scope rejected;
- tool shadowing/version downgrade rejected;
- R2 nonce replay rejected;
- confirmation from another principal rejected;
- kill switch enforced;
- direct DB/HTTP/provider access detected by CI;
- output/list limits enforced;
- service identity for module A rejected by module B;
- wrong-tenant resource denied before disclosure.
