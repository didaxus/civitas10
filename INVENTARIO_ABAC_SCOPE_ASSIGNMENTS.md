# Inventario ABAC - Data Scope Assignments

## Ruta del Menú
```
/governance/access-policy/scope-assignments
```

## Descripción General
Módulo de gestión de asignaciones de alcance de datos (Data Scopes) para el modelo ABAC (Attribute-Based Access Control) en Civitas10. Este módulo permite configurar y revisar los targets ABAC para una combinación específica de membership + canonical role path.

---

## 1. FRONTEND

### 1.1 Ruta de Navegación
**Archivo:** `/workspace/frontend/src/navigation/routes.ts`

```typescript
// Definición de ruta
const ownerOrganizationGovernanceDataScopesRoute = defineRoute(
  "/owner/organizations/:organizationId/governance/access-policy/scope-assignments"
);

// Registro en appRoutes
ownerOrganizationGovernanceDataScopes: appRoute(
  ownerOrganizationGovernanceDataScopesRoute, 
  "Data Scopes", 
  "dataScopes", 
  "Data-scope assignments for the selected organization."
)
```

**Metadata:**
- **Label:** Data Scopes
- **Icon Key:** dataScopes (IconDatabase)
- **Parent Path:** /owner/organizations/:organizationId/governance
- **Descripción:** Data-scope assignments for the selected organization

### 1.2 Módulo Principal
**Archivo:** `/workspace/frontend/src/features/governance/modules/data-scope/DataScopeModule.tsx`

**Componente:** `DataScopeModule`

**Props:**
```typescript
{
  assignments: readonly GovernanceDataScopeAssignment[];
  roles?: readonly GovernanceRoleSummary[];
}
```

**Funcionalidades:**
1. **Filtrado y Búsqueda:**
   - Filtro por Role path
   - Filtro por Scope template
   - Búsqueda textual en assignments

2. **Métricas:**
   - Total de Assignments
   - Membership paths únicos
   - Unresolved assignments (inválidos, stale o unavailable)

3. **Visualización de Assignments:**
   - Subject (Membership role path)
   - Template / strategy
   - Target (dimension, unit, resource, relationship)
   - Source (explicit o derivado)
   - Status (Effective / Unavailable)
   - Version
   - Changed (actor y timestamp)
   - Remove action (actualmente disabled)

4. **Draft de Nuevos Targets:**
   - Selector de tipo de target (dimension, unit, relationship, resource)
   - Input para stable ID del target
   - Preview sin persistencia (solo servidor puede aprobar)

### 1.3 Contratos y Tipos
**Archivo:** `/workspace/frontend/src/features/governance/contracts.ts`

**Tipo:** `GovernanceDataScopeAssignment`
```typescript
{
  id?: string;
  principalId: string;
  membershipId?: string | null;
  roleId?: string | null;
  canonicalRoleId?: string | null;
  scopeTemplateId?: string;
  scopeTemplateVersion?: string;
  strategy?: string;
  targetKind?: "dimension" | "unit" | "resource" | "relationship";
  dimensionValueId?: string | null;
  unitId?: string | null;
  relationshipKey?: string | null;
  capability: string;
  action?: string;
  scopeType?: string;
  taxonomyIds: string[];
  unitIds: string[];
  resourceSummary: string;
  effective: boolean;
  source?: string;
  reason: string;
  unresolvedReason?: string | null;
  sourceVersion?: string;
  changedBy?: string;
  changedAt?: string;
}
```

**Module Key:** `"data-scope"`

**Operation Key:** `"governance.dataScopes"`

### 1.4 Integración en GovernanceStudioPage
**Archivo:** `/workspace/frontend/src/features/governance/GovernanceStudioPage.tsx`

```typescript
// Detección de ruta
if (pathname.endsWith("/scope-assignments")) return "scope-assignments";

// Renderizado del módulo
else if (moduleKey === "data-scope") 
  content = <DataScopeModule assignments={model.dataScopes} roles={model.roles || []} />;
```

### 1.5 Workspace Contract
**Archivo:** `/workspace/frontend/src/features/governance/governance-workspace-contract.ts`

```typescript
{
  id: "scope-assignments",
  label: "Data Scopes",
  routeKey: "ownerOrganizationGovernanceDataScopes",
  tenantTab: "scope-assignments",
  moduleKey: "data-scope",
  ownerPermissionRequirement: { 
    mode: "all", 
    permissions: ["owner.runtime.operations.execute"] 
  },
  tenantPermissionRequirement: { 
    mode: "all", 
    permissions: ["org.documents.create"] 
  },
  actionId: "governance.scopeAssignments.view",
  entity: "authorization_scope_assignments",
  endpoint: "/governance/read-model",
  sourceOfTruth: "authorization_scope_assignments",
  icon: IconDatabase
}
```

---

## 2. BACKEND

### 2.1 Esquema de Base de Datos
**Archivo:** `/workspace/backend/db/schema/authz-data-scopes.js`

**Tabla:** `authorization_scope_assignments`

**Columnas:**
```javascript
{
  id: uuid (PK),
  logtoOrganizationId: varchar(128),
  logtoUserId: varchar(128),
  membershipId: varchar(128),
  logtoRoleId: varchar(128),
  canonicalRoleId: varchar(128),
  scopeTemplateId: varchar(160),
  scopeTemplateVersion: varchar(80),
  strategyId: varchar(80),
  target: jsonb,
  provenance: jsonb,
  snapshotVersion: bigint,
  capability: varchar(80),
  scopeKind: varchar(40), // dimension | unit | resource | relationship
  dimensionKey: varchar(100),
  relationshipKey: varchar(100),
  dimensionValueId: uuid (FK -> organizationDimensionValues.id),
  unitId: uuid (FK -> organizationUnits.id),
  resourceRef: varchar(180),
  sourceType: varchar(60),
  sourceRef: varchar(180),
  sourceVersion: varchar(80),
  status: varchar(32), // scheduled | active | revoked
  assignedByLogtoUserId: varchar(128),
  reason: text,
  validFrom: timestamp with timezone,
  validUntil: timestamp with timezone,
  revokedAt: timestamp with timezone,
  revokedByLogtoUserId: varchar(128),
  metadata: jsonb,
  createdAt: timestamp with timezone,
  updatedAt: timestamp with timezone
}
```

**Índices:**
- `authorization_scope_assignments_org_user_idx`: (logtoOrganizationId, logtoUserId, status)
- `authorization_scope_assignments_org_role_idx`: (logtoOrganizationId, logtoRoleId, capability)
- `authorization_scope_assignments_membership_role_idx`: (logtoOrganizationId, membershipId, canonicalRoleId, capability)
- `authorization_scope_assignments_template_idx`: (scopeTemplateId, scopeTemplateVersion)
- `authorization_scope_assignments_source_idx`: (sourceType, sourceRef)
- `authorization_scope_assignments_dimension_idx`: (logtoOrganizationId, dimensionKey, dimensionValueId)
- `authorization_scope_assignments_unit_idx`: (logtoOrganizationId, unitId)
- `authorization_scope_assignments_resource_idx`: (logtoOrganizationId, resourceRef)

### 2.2 Servicio de Asignaciones
**Archivo:** `/workspace/backend/authorization/data-scope/dataScopeAssignmentService.js`

**Función:** `createDataScopeAssignmentService`

**Métodos:**

#### `isEffectiveAssignment(assignment, now)`
Valida si un assignment está efectivo basado en status y fechas de validez.

#### `validateTarget(input)`
Valida que exactamente un target esté presente:
- dimensionValueId para scopeKind="dimension"
- unitId para scopeKind="unit"  
- resourceRef para scopeKind="resource"

#### `validateAssignmentInput(input)`
Validaciones completas:
1. Target validation
2. Membership binding validation
3. Dimension assignment validation (si aplica)
4. Relationship key validation (si aplica)
5. Scope template validation
6. Unit existence and status (si aplica)
7. Resource existence and status (si aplica)

#### `previewAssignment(input)`
Preview de asignación sin persistir. Retorna:
```javascript
{
  valid: true,
  wouldGrant: { ... },
  warnings: [],
  mutated: false,
  policyVersion: number
}
```

#### `createAssignment(input)`
Crea una nueva asignación con:
- Validación completa del input
- Check de expectedPolicyVersion (optimistic locking)
- Inserción en repository
- Emisión de evento de auditoría
- Invalidación de freshness del authorization snapshot

#### `revokeAssignment({ organizationId, assignmentId, actorLogtoUserId, reason })`
Revoca una asignación existente:
- Verifica existencia y pertenencia a organización
- Actualiza status a "revoked"
- Registra timestamp y actor de revocación
- Emite evento de auditoría

### 2.3 Política ABAC
**Archivo:** `/workspace/backend/authorization/policies/extensions/data-scope/authorizationDataScopeValid.js`

**Policy ID:** `authorization-data-scope-valid`

**Versión:** `2026-07-v1`

**Facts Requeridos:** `["dataScopeProvider"]`

**Superficies Soportadas:** `["organization"]`

**Lógica de Evaluación:**
```javascript
async evaluate(context) {
  const provider = context.providers?.dataScopeProvider;
  if (!provider?.evaluate) 
    return deny(POLICY_ID, POLICY_REASON_CODES.POLICY_PROVIDER_MISSING);
  
  const result = await provider.evaluate({
    organizationId: context.principal.organizationId,
    subject: context.principal.subject,
    principal: context.principal,
    rolePaths: context.rolePaths,
    permission: context.authorization.permission,
    capability: context.target?.capability,
    operation: context.request.operation,
    resource: context.resource
  });
  
  if (result.allowed === true || result.status === "valid")
    return allow(POLICY_ID, POLICY_REASON_CODES.AUTHORIZATION_ALLOWED, { strategy: result.strategy });
  
  if (result.status === "stale")
    return deny(POLICY_ID, POLICY_REASON_CODES.AUTHORIZATION_SNAPSHOT_STALE);
  
  return deny(POLICY_ID, POLICY_REASON_CODES.RESOURCE_NOT_FOUND_OR_NOT_ACCESSIBLE);
}
```

### 2.4 Componentes del Data Scope Module
**Directorio:** `/workspace/backend/authorization/data-scope/`

**Archivos:**
- `dataScopeAssignmentService.js` - Servicio principal de asignaciones
- `dataScopeAudit.js` - Auditoría de eventos
- `dataScopeConstraint.js` - Restricciones de scope
- `dataScopeConstraintComposer.js` - Composición de restricciones
- `dataScopeEvaluator.js` - Evaluador de scopes
- `dataScopePolicyRegistry.js` - Registry de políticas
- `dataScopeReasonCodes.js` - Códigos de razón
- `dataScopeRegistry.js` - Registry principal
- `dataScopeRepository.js` - Repositorio de datos
- `dataScopeRuntimePort.js` - Puerto de runtime
- `dataScopeStrategyRegistry.js` - Registry de estrategias
- `scopeTemplateRegistry.js` - Registry de templates
- `rolePathResolver.js` - Resolvedor de role paths
- `scopeCandidateAdapter.js` - Adaptador de candidatos
- `relationshipScopeAdapter.js` - Adaptador para relationships
- `resourceScopeAdapter.js` - Adaptador para resources
- `taxonomyDimensionsRegistry.js` - Registry de dimensiones
- `taxonomyScopeAdapter.js` - Adaptador para taxonomy

### 2.5 Razones y Códigos de Error
**Archivo:** `/workspace/backend/authorization/data-scope/dataScopeReasonCodes.js`

**Códigos Principales:**
- `DATA_SCOPE_REASON_CODES.DIMENSION_UNKNOWN`
- `DATA_SCOPE_REASON_CODES.UNIT_UNKNOWN`
- `DATA_SCOPE_REASON_CODES.RESOURCE_UNKNOWN`
- `DATA_SCOPE_REASON_CODES.MEMBERSHIP_NOT_FOUND`
- `DATA_SCOPE_REASON_CODES.ROLE_MISMATCH`
- `DATA_SCOPE_REASON_CODES.RESOLVER_UNAVAILABLE`
- `DATA_SCOPE_REASON_CODES.UNIT_INACTIVE`
- `DATA_SCOPE_REASON_CODES.RESOURCE_FORBIDDEN`
- `DATA_SCOPE_REASON_CODES.TEMPLATE_UNKNOWN`
- `DATA_SCOPE_REASON_CODES.POLICY_VERSION_CONFLICT`
- `DATA_SCOPE_REASON_CODES.ASSIGNMENT_MISSING`

---

## 3. FLUJO DE AUTORIZACIÓN ABAC

### 3.1 Proceso de Evaluación
1. **Request llega al authorize()**
2. **Deriva canonical policy plan** server-side
3. **Valida catalog permission** activo
4. **Verifica token materialization**
5. **Valida canonical role potential**
6. **Chequea module availability**
7. **Evalúa políticas PBAC/ABAC**
8. **Verifica provenance**
9. **Decide allow/deny**

### 3.2 Data Scope Provider
El provider evalúa:
- Organization ID del principal
- Subject y role paths
- Permission solicitada
- Capability del target
- Operación request
- Recurso específico

Retorna:
```javascript
{
  allowed: boolean,
  status: "valid" | "stale" | "invalid",
  strategy: string
}
```

---

## 4. ESTADOS Y DECISIONES

### 4.1 Estados de Assignment
- **scheduled**: Válido pero con validFrom futuro
- **active**: Vigente y efectivo
- **revoked**: Revocado explícitamente

### 4.2 Decision States en UI
- **allowed**: Todos los assignments son efectivos
- **denied**: Hay assignments no efectivos con razón conocida
- **limited**: Algunos assignments tienen limitaciones
- **pending**: No hay assignments retornados

### 4.3 Códigos de Razón Visuales
- `data_scope_role_path_bound`: Assignments están bound por role path
- `data_scope_assignment_missing`: No hay assignments
- `scope_assignment_write_unavailable`: Escritura no disponible (solo preview)

---

## 5. RESTRICCIONES IMPORTANTES

### 5.1 Lo que NO hace este módulo
- ❌ Nunca crea fallback access a nivel de organización
- ❌ Nunca borra scope across roles
- ❌ La UI no persiste cambios (solo preview)
- ❌ No valida cross-tenant targets
- ❌ No chequea stale relationships

### 5.2 Lo que SÍ hace el backend
- ✅ Valida templates aprobados por servidor
- ✅ Valida same-tenant targets
- ✅ Chequea stale relationships
- ✅ Invalida políticas cuando corresponde
- ✅ Es la autoridad para disponibilidad de templates
- ✅ Aprueba persistencia de assignments

---

## 6. AUDITORÍA Y VERSIONADO

### 6.1 Eventos de Auditoría
- `authz.data_scope_assignment.created`
- `authz.data_scope_assignment.revoked`

### 6.2 Versiones de Contrato
- **Read Model Contract:** `2026-07-civitas10-governance-read-model-v1`
- **Operation Registry:** `2026-07-civitas10-governance-operations-v1`
- **Policy Version:** Incremental por organización

### 6.3 Metadata de Cambios
- `changedBy`: Usuario que realizó el cambio
- `changedAt`: Timestamp del cambio
- `sourceVersion`: Versión del origen (ej: "manual-v1")
- `snapshotVersion`: Versión del policy snapshot

---

## 7. PERMISOS REQUERIDOS

### Owner Surface
```typescript
{
  mode: "all",
  permissions: ["owner.runtime.operations.execute"]
}
```

### Tenant Surface
```typescript
{
  mode: "all", 
  permissions: ["org.documents.create"]
}
```

### Action ID
- `governance.scopeAssignments.view`

---

## 8. DIAGNÓSTICOS COMUNES

### Asignaciones No Efectivas
1. **Template no disponible:** El scope template no está registrado
2. **Target inválido:** El dimension/unit/resource no existe
3. **Membership no encontrado:** El binding user-role no existe
4. **Stale snapshot:** El policy version está desactualizado
5. **Cross-tenant:** El target pertenece a otro tenant
6. **Unit inactive:** La unidad organizacional no está activa
7. **Resource forbidden:** El recurso tiene estado no permitido

### Resolución
- Verificar logs de auditoría
- Revisar `unresolvedReason` en el assignment
- Validar versiones de contrato
- Chequear estado de dependencias (units, dimensions, resources)

---

## 9. ARCHIVOS RELACIONADOS

### Frontend
- `/workspace/frontend/src/navigation/routes.ts`
- `/workspace/frontend/src/navigation/icon-registry.ts`
- `/workspace/frontend/src/features/governance/contracts.ts`
- `/workspace/frontend/src/features/governance/GovernanceStudioPage.tsx`
- `/workspace/frontend/src/features/governance/governance-workspace-contract.ts`
- `/workspace/frontend/src/features/governance/governance-capabilities.ts`
- `/workspace/frontend/src/features/governance/adapters/governance-view-model.ts`
- `/workspace/frontend/src/features/governance/modules/data-scope/DataScopeModule.tsx`
- `/workspace/frontend/src/authorization/contracts/ids.ts`

### Backend
- `/workspace/backend/db/schema/authz-data-scopes.js`
- `/workspace/backend/authorization/data-scope/dataScopeAssignmentService.js`
- `/workspace/backend/authorization/data-scope/dataScopeEvaluator.js`
- `/workspace/backend/authorization/data-scope/scopeTemplateRegistry.js`
- `/workspace/backend/authorization/data-scope/dataScopeStrategyRegistry.js`
- `/workspace/backend/authorization/data-scope/dataScopeReasonCodes.js`
- `/workspace/backend/authorization/policies/extensions/data-scope/authorizationDataScopeValid.js`
- `/workspace/backend/runtime/migrations.js`

### Tests
- `/workspace/backend/test/database-migrations-runtime.test.js`
- `/workspace/backend/tests/governanceEndpoints.test.js`
- `/workspace/backend/tests/governanceStructureReadModel.test.js`

---

## 10. RESUMEN EJECUTIVO

El módulo **Data Scope Assignments** (`/governance/access-policy/scope-assignments`) es la interfaz principal para gestionar el componente ABAC del sistema de autorización Civitas10. Permite:

1. **Visualizar** todas las asignaciones de scope vigentes
2. **Filtrar** por role path y template
3. **Diagnosticar** assignments no efectivos
4. **Previsualizar** nuevos targets (sin persistencia desde UI)

La **autoridad real** reside en el backend, que valida:
- Templates registrados
- Targets del mismo tenant
- Relationships no stale
- Policy invalidations correctas

Este diseño asegura que el control de acceso basado en atributos sea **consistente, auditado y seguro**, fallando cerrado (fail-closed) cuando hay incertidumbre.
