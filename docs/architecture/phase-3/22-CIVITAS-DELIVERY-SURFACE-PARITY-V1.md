# CIVITAS Delivery Surface Parity v1

**Contract version:** `civitas-delivery-parity/v1`  
**Status:** `normative`

## 1. Purpose

Prevent orphan REST operations, invented permissions, MCP wrappers without governance and duplicated business logic.

## 2. Bridge registry

`contracts/delivery/application-service-registry.yaml` is the composed registry for delivery ownership. It does not replace the permission catalog or OpenAPI; it references them.

Each row contains:

```text
moduleId
capabilityId
applicationServiceId
permissionId
dataScopeStrategyId
operation kind/effect
REST operation references
MCP exposure and tool references
issue provenance
status
activation/rollback metadata
```

## 3. Parity directions

### REST -> service

Every OpenAPI operation must reference exactly one registered application service with matching module, capability, permission, strategy and status.

### MCP -> service

Every MCP tool must reference exactly one registered service whose MCP exposure is `curated`. Tool risk/effect cannot be weaker than the service effect.

### Service -> permission/scope

Every service references a canonical permission and registered Data Scope strategy. Repository integration fails when the permission is absent from the canonical catalog.

### Service -> adapters

A service may have:

- one or more REST operations;
- zero or more curated MCP tools;
- UI/worker consumers.

REST existence does not require MCP exposure.

## 4. Status compatibility

```text
service planned -> REST/MCP cannot be active
permission planned/absent -> service cannot be active
module unavailable -> adapter cannot execute
MCP tool active -> service and permission active, tool tenant-enabled
```

## 5. Example

```yaml
moduleId: lms
capabilityId: lms.courses
applicationServiceId: lmsListCourses
permissionId: lms.courses.read
dataScopeStrategyId: teaching_assignments
restOperationIds: [lmsCoursesList]
mcpExposure: curated
mcpToolIds: [civitas.lms.list-courses]
status: planned
```

The current repository audit found `lms.courses.read` in OpenAPI without catalog evidence. This row therefore remains planned and repository integration must fail until the permission identity is resolved explicitly.

## 6. Provider neutrality

The checker rejects provider-shaped canonical IDs and live endpoints/secrets in registries. Provider information belongs only in adapter configuration or diagnostics.

## 7. Controller/handler constraints

Static checks should flag direct DB/SQL/provider/network imports in REST controllers and MCP handlers. Business logic belongs to application services and ports.

## 8. Generated evidence

The composed checker emits:

```text
service count
REST operation count
MCP tool count
orphan references
status incompatibilities
provider-neutrality result
contract hashes
repository integration status
```

## 9. Activation impact

Any parity failure blocks the affected operation/tool and prevents broad module activation. It does not require disabling unrelated verified services.
