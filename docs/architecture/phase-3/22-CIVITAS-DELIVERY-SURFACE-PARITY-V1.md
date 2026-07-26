# CIVITAS Delivery Surface Parity v1

**Contract version:** `civitas-delivery-surface-parity/v1`  
**Status:** `normative`

## 1. Purpose

Prevent REST, MCP, UI, workers, permissions and application services from evolving as independent authorities.

## 2. Registry row

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

## 3. Canonical responsibilities

- permission catalog owns permission identity and lifecycle;
- application-service registry owns use-case identity and business boundary;
- OpenAPI owns HTTP representation;
- MCP registry owns curated agent exposure;
- UI route/action registry owns consumer navigation, not access decisions;
- module manifest owns installation/runtime boundary;
- authorization registries own policies and Data Scope.

## 4. Compatibility rules

```text
REST/MCP permission -> must exist in permission catalog
service permission -> exact match with delivery surface
service capability/module -> must exist and share ownership
Data Scope strategy -> must exist and be capability-compatible
planned service -> no active adapter
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
