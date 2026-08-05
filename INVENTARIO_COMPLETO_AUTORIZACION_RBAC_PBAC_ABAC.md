# 📚 INVENTARIO COMPLETO DE POLÍTICAS DE AUTORIZACIÓN - CIVITAS

**Documento Maestro de Autorización: RBAC + PBAC + ABAC**  
**Versión:** 2026-07-civitas-authz-contract-v1  
**Fecha de generación:** 2026-01-XX  
**Ámbito:** Sistema completo Civitas (backend, frontend, contratos, auditoría)

---

## 🎯 RESUMEN EJECUTIVO

Civitas implementa un **modelo de autorización híbrido de tres capas**:

| Capa | Significado | Pregunta que responde | Autoridad |
|------|-------------|----------------------|-----------|
| **RBAC** | Role-Based Access Control | ¿Qué puede hacer potencialmente este rol? | Owner Global (catálogo) |
| **PBAC** | Policy-Based Access Control | ¿Qué está permitido por Owner y activado por tenant? | Owner Ceiling + Tenant Activation |
| **ABAC** | Attribute-Based Access Control | ¿Sobre qué recursos concretos puede actuar? | Data Scopes + atributos |

**Principio fundamental:** `RBAC → PBAC → ABAC` en pipeline secuencial fail-closed.

---

## 📋 ÍNDICE GENERAL

1. [Arquitectura General](#1-arquitectura-general)
2. [RBAC - Catálogo de Roles y Permisos](#2-rbac---catálogo-de-roles-y-permisos)
3. [PBAC - Owner Ceiling y Tenant Activation](#3-pbac---owner-ceiling-y-tenant-activation)
4. [ABAC - Data Scopes y Atributos](#4-abac---data-scopes-y-atributos)
5. [Pipeline de Decisión](#5-pipeline-de-decisión)
6. [Esquema de Base de Datos](#6-esquema-de-base-de-datos)
7. [Políticas Core](#7-políticas-core)
8. [Políticas Extensions](#8-políticas-extensions)
9. [Políticas Owner](#9-políticas-owner)
10. [Proveedores de Política](#10-proveedores-de-política)
11. [Códigos de Razón](#11-códigos-de-razón)
12. [Frontend y UI](#12-frontend-y-ui)
13. [Módulos de Governance](#13-módulos-de-governance)
14. [Delegación](#14-delegación)
15. [Entitlements](#15-entitlements)
16. [Runtime y Cache](#16-runtime-y-cache)
17. [Auditoría](#17-auditoría)
18. [Archivos del Sistema](#18-archivos-del-sistema)

---

## 1. ARQUITECTURA GENERAL

### 1.1 Modelo Conceptual

```
┌─────────────────────────────────────────────────────────────────┐
│                    PETICIÓN DE API                              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  1. AUTENTICACIÓN (Logto) → Token + Scopes                      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  2. RBAC → ¿Rol canónico tiene permiso en catálogo?             │
│     - Catálogo global de permisos                               │
│     - Mapeo rol-permiso                                         │
│     - Estado: active/planned/deprecated                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  3. PBAC → ¿Owner permite + Tenant activa?                      │
│     - Owner Ceiling (máximo permitido)                          │
│     - Tenant Activation (habilitación efectiva)                 │
│     - Regla: ceiling.allowed=true AND activation.enabled=true   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  4. ABAC → ¿Recurso está dentro del scope del sujeto?           │
│     - Estrategia registrada                                     │
│     - Scopes asignados (dimension/unit/resource/relationship)   │
│     - Atributos del recurso                                     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  5. DECISIÓN → ALLOW / DENY + reasonCode                        │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Principios Inmutables

1. **Deny-by-default**: Ausencia = denegación
2. **Backend authoritative**: UI nunca autoriza
3. **Una fuente por concepto**: Sin duplicación entre capas
4. **Sin roles ad hoc**: Solo roles canónicos globales/org
5. **Sin permisos wildcard**: No existe `*` o `domain.*`
6. **Tenant isolation primero**: Verifica organización antes de acción
7. **Datos, no UI**: Políticas en persistencia, no en estado frontend
8. **No privilege borrowing**: Múltiples roles = evaluación independiente
9. **Auditabilidad completa**: Todo cambio deja traza
10. **Fail closed**: Ambigüedad = bloqueo

### 1.3 Superficies de Autorización

| Superficie | Descripción | Ejemplo |
|------------|-------------|---------|
| `owner` | Operaciones globales de plataforma | Crear organización |
| `organization` | Operaciones dentro de una org | Gestionar miembros |
| `tenant` | Alias de organization en contexto tenant | Mismo que organization |
| `self` | Operaciones sobre recursos propios | Ver perfil propio |

---

## 2. RBAC - CATÁLOGO DE ROLES Y PERMISOS

### 2.1 Contrato y Versiones

```javascript
// /workspace/core/authz/constants.js
CONTRACT_VERSION = '2026-07-civitas-authz-contract-v1'
API_RESOURCE = 'https://civitas.didaxus.com/api'
```

### 2.2 Roles Canónicos

#### Roles Globales (Owner)
- `owner_global` - Administrador de plataforma

#### Roles de Organización (14 roles)
```javascript
ORGANIZATION_ROLES = [
  'organization_admin',         // Administrador máximo
  'organization_director',      // Director general
  'organization_headdirector',  // Jefe de directores
  'organization_headteacher',   // Jefe de profesores
  'organization_groupleader',   // Líder de grupo
  'organization_teacher',       // Profesor
  'organization_student',       // Estudiante
  'organization_parent',        // Padre/Acudiente
  'organization_secretary',     // Secretario
  'organization_accountant',    // Contador
  'organization_billing',       // Facturación
  'organization_payroll',       // Nómina
  'organization_member'         // Miembro básico
]
```

### 2.3 Dominios de Permisos

```javascript
KNOWN_DOMAINS = [
  'owner', 'org', 'lms', 'planning', 'crm', 
  'marketing', 'community', 'payments', 'hr', 
  'scheduling', 'support', 'analytics', 
  'reports', 'platform'
]
```

### 2.4 Estructura de Permiso

```javascript
{
  name: "lms.grades.read",
  namespace: "lms",
  moduleId: "lms",
  capabilityId: "lms.grades",
  surface: "organization",
  targetStatus: "active", // active | planned | deprecated
  observedImplementation: "present",
  dataScopeStrategy: "academic.section",
  risk: "standard", // standard | high | critical
  consumers: ["screen:id"],
  policyRequirements: ["authorization-data-scope-valid"],
  screenActionIds: ["grades:view"],
  compatibility: "v1",
  presentation: {
    label: "View grades",
    description: "View student grades",
    groupKey: "lms",
    groupLabel: "LMS",
    groupOrder: 10,
    order: 1
  }
}
```

### 2.5 Estados de Permiso

| Estado | Significado | Puede ser efectivo |
|--------|-------------|-------------------|
| `active` | Completamente operacional | ✅ Sí |
| `planned` | Definido pero no implementado | ❌ No |
| `deprecated` | En proceso de retiro | ❌ No |

### 2.6 Archivos Clave RBAC

| Archivo | Propósito |
|---------|-----------|
| `/core/authz/catalog/registry.js` | Registro central de permisos |
| `/core/authz/catalog/generated/permission-catalog.js` | Catálogo generado (no editar) |
| `/core/authz/roles/registry.js` | Registro de roles |
| `/core/authz/roles/generated/role-model.js` | Modelo de roles generado |
| `/core/authz/roles/global-role-permissions.js` | Permisos de rol global |
| `/core/authz/roles/organization-role-permissions.js` | Permisos de rol org |
| `/core/authz/validation/validate-permission-name.js` | Validador de nombres |

### 2.7 Hash de Integridad

```javascript
catalogHash: "573a51324a516cfd0b96d51542920b24019de72208036953cdc00ee1519893ca"
roleModelHash: "8ed786f9c2a2fd0fbead4eaeab9c6c944d5407ecbab04ad7621a4a8f53f78ff6"
```

---

## 3. PBAC - OWNER CEILING Y TENANT ACTIVATION

### 3.1 Concepto PBAC

PBAC en Civitas **no reemplaza RBAC**, es un overlay de política multi-tenant que reduce el potencial RBAC por organización.

### 3.2 Owner Ceiling

**Pregunta:** ¿Este rol puede ofrecer este permiso en esta organización?

- Es un **máximo permitido**, no concesión directa
- Almacenado por: `organizationId + roleId + permissionId`
- Ausencia = denegación para capacidades restringibles
- `allowed=false` vence cualquier tenant activation

### 3.3 Tenant Activation

**Pregunta:** ¿Esta organización decidió habilitar este permiso, ya permitido, para este rol?

- Almacenado por: `organizationId + roleId + permissionId`
- Solo puede estar habilitada si existe Owner Ceiling permitido
- No puede elevar un ceiling ni crear permiso nuevo
- Su cambio invalida versión de política y genera auditoría

### 3.4 Regla PBAC

```javascript
PBAC(role, permission, organization) = 
  ownerCeiling.allowed === true 
  AND 
  tenantActivation.enabled === true
```

### 3.5 Bootstrap Profile

Perfil versionado seleccionado por Owner al crear organización:
- Membresía inicial y rol canónico
- Owner Ceilings exactos
- Tenant Activations exactas
- Templates de scope disponibles
- Versión de catálogo y policy version

### 3.6 Tablas PBAC

```sql
-- authorization_policy_versions
logto_organization_id (PK)
version (bigint)
catalog_version
updated_at
updated_by_logto_user_id
reason

-- org_role_entitlement_limits (Owner Ceiling)
id (PK)
logto_organization_id
logto_role_id
role_name_cache
permission_key
allowed (boolean)
locked (boolean)
policy_version (bigint)
set_by_logto_user_id
reason
created_at
updated_at

-- org_role_permission_activations (Tenant Activation)
id (PK)
logto_organization_id
logto_role_id
role_name_cache
permission_key
entitlement_limit_id (FK)
enabled (boolean)
policy_version (bigint)
set_by_logto_user_id
reason
created_at
updated_at
```

### 3.7 Constraint Trigger

```sql
-- Impide activation sin ceiling permitido
CREATE CONSTRAINT TRIGGER trg_tenant_activation_within_owner_ceiling
AFTER INSERT OR UPDATE ON org_role_permission_activations
FOR EACH ROW EXECUTE FUNCTION enforce_tenant_activation_within_owner_ceiling();
```

---

## 4. ABAC - DATA SCOPES Y ATRIBUTOS

### 4.1 Tipos de Scope

| Tipo | Ejemplo | Uso |
|------|---------|-----|
| `dimension` | `academic.section=primary` | Filtrar por taxonomía |
| `unit` | Unidad/área válida | Filtrar por estructura org |
| `resource` | estudiante específico | Acceso individual |
| `relationship` | docente asignado | Candidato por estrategia |

### 4.2 Taxonomías

Las taxonomías **clasifican datos**, no son jerarquía de mando:

- `academic.section` - Sección académica
- `academic.subject` - Materia
- `academic.grade_level` - Nivel de grado
- `organization.campus` - Campus
- `organization.department` - Departamento
- `administration.function` - Función administrativa

### 4.3 Estrategias ABAC Registradas

| Rol/Capacidad | Alcance esperado |
|---------------|------------------|
| Director | Organización completa |
| Head director | Dimensiones `academic.section` asignadas |
| Head teacher | Dimensiones `academic.subject` asignadas |
| Teacher | Grupos/cursos asignados por relación |
| Student | Solo recursos propios |
| Parent | Solo estudiantes vinculados |

### 4.4 Combinación de Scopes

- **AND dentro de una cláusula**: Recurso debe satisfacer todos los atributos
- **OR entre rutas de rol completas**: Si tiene múltiples roles, basta una ruta completa
- **No mezclar**: Permiso de un rol con scopes de otro

### 4.5 Tabla authorization_scope_assignments

```sql
CREATE TABLE authorization_scope_assignments (
  id UUID PRIMARY KEY,
  logto_organization_id VARCHAR(128) NOT NULL,
  logto_user_id VARCHAR(128) NOT NULL,
  logto_role_id VARCHAR(128) NOT NULL,
  capability VARCHAR(80) NOT NULL,
  scope_kind VARCHAR(40) NOT NULL, -- dimension | unit | resource
  dimension_key VARCHAR(100),
  relationship_key VARCHAR(100),
  dimension_value_id UUID,
  unit_id UUID,
  resource_ref VARCHAR(180),
  source_type VARCHAR(60) NOT NULL,
  source_ref VARCHAR(180),
  source_version VARCHAR(80),
  status VARCHAR(32) NOT NULL DEFAULT 'scheduled',
  assigned_by_logto_user_id VARCHAR(128) NOT NULL,
  reason TEXT,
  valid_from TIMESTAMPTZ NOT NULL,
  valid_until TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_by_logto_user_id VARCHAR(128),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Constraints
  CONSTRAINT check_scope_kind CHECK (scope_kind IN ('dimension','unit','resource')),
  CONSTRAINT check_source_type CHECK (source_type IN ('explicit','unit_membership','person_relationship','capability_group','system_migration')),
  CONSTRAINT check_status CHECK (status IN ('scheduled','active','expired','revoked','invalidated')),
  CONSTRAINT exactly_one_target CHECK (num_nonnulls(dimension_value_id, unit_id, resource_ref) = 1)
);
```

### 4.6 Índices Principales

```sql
-- Índices únicos por tipo de scope activo
CREATE UNIQUE INDEX idx_active_dimension ON authorization_scope_assignments(
  logto_organization_id, logto_user_id, logto_role_id, 
  capability, dimension_key, dimension_value_id
) WHERE scope_kind = 'dimension' AND status IN ('scheduled','active');

CREATE UNIQUE INDEX idx_active_unit ON authorization_scope_assignments(
  logto_organization_id, logto_user_id, logto_role_id, 
  capability, relationship_key, unit_id
) WHERE scope_kind = 'unit' AND status IN ('scheduled','active');

CREATE UNIQUE INDEX idx_active_resource ON authorization_scope_assignments(
  logto_organization_id, logto_user_id, logto_role_id, 
  capability, relationship_key, resource_ref
) WHERE scope_kind = 'resource' AND status IN ('scheduled','active');

-- Índices de consulta
CREATE INDEX idx_org_user ON authorization_scope_assignments(logto_organization_id, logto_user_id, status);
CREATE INDEX idx_org_role ON authorization_scope_assignments(logto_organization_id, logto_role_id, capability);
CREATE INDEX idx_source ON authorization_scope_assignments(source_type, source_ref);
CREATE INDEX idx_dimension ON authorization_scope_assignments(logto_organization_id, dimension_key, dimension_value_id);
CREATE INDEX idx_unit ON authorization_scope_assignments(logto_organization_id, unit_id);
CREATE INDEX idx_resource ON authorization_scope_assignments(logto_organization_id, resource_ref);
```

### 4.7 Estados de Assignment

| Estado | Significado |
|--------|-------------|
| `scheduled` | Programado para activación futura |
| `active` | Vigente y efectivo |
| `expired` | Expiró por valid_until |
| `revoked` | Revocado explícitamente |
| `invalidated` | Invalidado por cambio de política |

---

## 5. PIPELINE DE DECISIÓN

### 5.1 Secuencia Obligatoria

```javascript
async function authorize(input) {
  // 1. Construir contexto
  const context = buildPolicyContext(input);
  
  // 2. Validar superficie
  if (!surfaceMatches(context)) 
    return deny(POLICY_REASON_CODES.SURFACE_MISMATCH);
  
  // 3. Validar catálogo
  const permission = permissionsByName[context.authorization.permission];
  if (!permission) 
    return deny(POLICY_REASON_CODES.PERMISSION_UNKNOWN);
  
  // 4. Disponibilidad de módulo
  const moduleAvailability = await resolveModuleAvailability(context, permission);
  if (moduleAvailability) 
    return deny(moduleAvailability.reasonCode);
  
  // 5. Estado del permiso
  if (permission.status !== "active") 
    return deny(POLICY_REASON_CODES.PERMISSION_INACTIVE);
  
  // 6. Superficie del permiso
  if (!permissionSurfaceMatches(permission, context.request.surface)) 
    return deny(POLICY_REASON_CODES.CONSUMER_SURFACE_MISMATCH);
  
  // 7. Scopes del token
  if (!context.principal.scopes.has(context.authorization.permission)) 
    return deny(POLICY_REASON_CODES.PERMISSION_MISSING);
  
  // 8. Potencial RBAC
  const rolePotentialFailure = validateRolePotential(context);
  if (rolePotentialFailure) 
    return deny(rolePotentialFailure);
  
  // 9. Evaluar políticas canónicas
  for (const policyId of deriveAuthorizationPlan(context)) {
    const policy = registry.getPolicy(policyId);
    const result = await policy.evaluate(context);
    
    if (result.outcome === "deny") 
      return deny(result.reasonCode);
  }
  
  // 10. ALLOW
  return allow(matchedRolePathId);
}
```

### 5.2 Políticas Canónicas por Superficie

```javascript
CANONICAL_POLICIES_BY_SURFACE = {
  owner: [
    "authorization-snapshot-current"
  ],
  organization: [
    "same-organization",
    "membership-required",
    "org-role-entitlement-enabled",
    "authorization-snapshot-current",
    "authorization-data-scope-valid"
  ],
  tenant: [
    "same-organization",
    "membership-required",
    "org-role-entitlement-enabled",
    "authorization-snapshot-current",
    "authorization-data-scope-valid"
  ],
  self: [
    "authorization-snapshot-current"
  ]
};
```

### 5.3 Estructura de Decisión

```javascript
// Decisión ALLOW
{
  allowed: true,
  decisionId: "uuid",
  permission: "lms.grades.read",
  actionId: "grades:view",
  surface: "organization",
  organizationId: "uuid",
  matchedRolePathId: "uuid",
  evaluatedRolePaths: [...],
  policyVersion: "123",
  authorizationSnapshotVersion: "123",
  reasonCode: "authorization_allowed",
  catalogHash: "...",
  roleModelVersion: "..."
}

// Decisión DENY
{
  allowed: false,
  decisionId: "uuid",
  permission: "lms.grades.read",
  actionId: "grades:view",
  surface: "organization",
  organizationId: "uuid",
  evaluatedRolePaths: [...],
  policyVersion: "123",
  authorizationSnapshotVersion: "123",
  reasonCode: "tenant_activation_missing",
  safeMetadata: {...}
}
```

---

## 6. ESQUEMA DE BASE DE DATOS

### 6.1 Migraciones de Autorización

| Migración | Propósito |
|-----------|-----------|
| `0006_authz_delegation_limits.sql` | Límites de delegación |
| `0007_authz_entitlement_overlay.sql` | PBAC (ceilings + activations) |
| `0008_authz_taxonomy.sql` | Taxonomías organizacionales |
| `0009_authz_units.sql` | Unidades organizacionales |
| `0010_authz_data_scopes.sql` | Tabla principal de scopes ABAC |
| `0011_authorization_runtime_consistency.sql` | Consistencia runtime |
| `0013_membership_role_bound_scope_subject.sql` | Membership scoped |
| `0014_scope_templates.sql` | Templates de scope |
| `0016_authorization_scope_assignments_contract.sql` | Contrato de assignments |
| `0024_data_scope_taxonomy_v2.sql` | Taxonomía v2 |
| `0025_data_scope_taxonomy_reconciliation_plan.sql` | Reconciliación |
| `0026_data_scope_assignment_governance.sql` | Governance de assignments |
| `0027_authorization_delegation_contexts.sql` | Contextos de delegación |
| `0028_integration_operation_idempotency_tenant_scope.sql` | Idempotencia tenant |

### 6.2 Relaciones Clave

```
authorization_policy_versions (1) ──┬── (N) org_role_entitlement_limits
                                    │
                                    └── (N) org_role_permission_activations

authorization_scope_assignments (N) ──┬── organization_dimension_values
                                      ├── organization_units
                                      └── organization_memberships
```

---

## 7. POLÍTICAS CORE

Ubicación: `/workspace/backend/authorization/policies/core/`

| Política | ID | Propósito |
|----------|-----|-----------|
| `cannotEscalatePrivileges.js` | N/A | Previene escalada de privilegios |
| `cannotModifyOwnerGlobal.js` | N/A | Bloquea modificación de owner_global |
| `connectorEnabled.js` | N/A | Verifica connector habilitado |
| `criticalOperationAudited.js` | N/A | Requiere auditoría para ops críticas |
| `featureEnabled.js` | N/A | Verifica feature flag activo |
| `membershipRequired.js` | `membership-required` | Requiere membresía válida |
| `resourceBelongsToOrganization.js` | N/A | Verifica pertenencia a org |
| `sameOrganization.js` | `same-organization` | Misma organización en ruta/recurso |
| `seatAvailability.js` | N/A | Verifica asiento disponible |
| `targetRoleDelegable.js` | N/A | Valida rol delegable |

### 7.1 Ejemplo: membershipRequired.js

```javascript
// Valida que el sujeto tenga membresía activa en la organización
async function evaluate(context) {
  const membership = await context.providers.membershipProvider.resolve({
    organizationId: context.principal.organizationId,
    subject: context.principal.subject
  });
  
  if (!membership || membership.status !== 'active') {
    return {
      outcome: 'deny',
      reasonCode: POLICY_REASON_CODES.MEMBERSHIP_REQUIRED,
      policyId: 'membership-required'
    };
  }
  
  return {
    outcome: 'allow',
    policyId: 'membership-required'
  };
}
```

---

## 8. POLÍTICAS EXTENSIONS

Ubicación: `/workspace/backend/authorization/policies/extensions/`

### 8.1 Entitlement (PBAC)

| Archivo | ID de Política | Propósito |
|---------|---------------|-----------|
| `authorizationSnapshotCurrent.js` | `authorization-snapshot-current` | Validez de snapshot |
| `orgRoleEntitlementEnabled.js` | `org-role-entitlement-enabled` | Ceiling + Activation |

### 8.2 Data-Scope (ABAC)

| Archivo | ID de Política | Propósito |
|---------|---------------|-----------|
| `authorizationResourceInScope.js` | N/A | Recurso en scope |
| `authorizationDataScopeValid.js` | `authorization-data-scope-valid` | Scope válido |

### 8.3 Billing

| Archivo | ID de Política | Propósito |
|---------|---------------|-----------|
| `seatRequestStateTransition.js` | N/A | Transición de estado de seat |
| `seatRequestApprovalEligibility.js` | N/A | Elegibilidad de aprobación |

### 8.4 Feature-Flags

| Archivo | ID de Política | Propósito |
|---------|---------------|-----------|
| `featureEnabled.js` | N/A | Feature flag habilitado |

---

## 9. POLÍTICAS OWNER

Ubicación: `/workspace/backend/authorization/policies/owner/`

| Archivo | Propósito |
|---------|-----------|
| `criticalActionRestricted.js` | Restringe acciones críticas de owner |
| `impersonationAllowed.js` | Valida impersonación permitida |
| `noImpersonationChaining.js` | Previene cadena de impersonación |
| `targetOrganizationValid.js` | Valida organización objetivo |
| `targetUserEligible.js` | Valida usuario elegible para acción |

---

## 10. PROVEEDORES DE POLÍTICA

Ubicación: `/workspace/backend/authorization/policies/providers/`

| Proveedor | Función |
|-----------|---------|
| `auditReadinessProvider.js` | Provee estado de auditoría |
| `connectorProvider.js` | Estado de connectors |
| `dataScopeProvider.js` | Resuelve data scopes |
| `delegationProvider.js` | Contexto de delegación |
| `entitlementProvider.js` | Ceiling y activation |
| `featureFlagProvider.js` | Feature flags |
| `membershipProvider.js` | Membresías |
| `resourceOwnershipProvider.js` | Propiedad de recursos |
| `seatProvider.js` | Asientos disponibles |

### 10.1 dataScopeProvider.js

```javascript
// Resuelve los scopes de datos para un sujeto/rol/capacidad
async function resolve({ organizationId, userId, roleId, capability }) {
  const scopes = await dataScopeRepository.findActive({
    organizationId,
    userId,
    roleId,
    capability
  });
  
  return {
    scopes,
    strategies: scopes.map(s => getStrategyForCapability(s.capability)),
    isValid: scopes.length > 0
  };
}
```

---

## 11. CÓDIGOS DE RAZÓN

Ubicación: `/workspace/backend/authorization/policies/reasonCodes.js`

### 11.1 Códigos Generales

| Código | Significado |
|--------|-------------|
| `authorization_allowed` | Autorización concedida |
| `permission_missing` | Permiso falta en token scope |
| `permission_inactive` | Permiso no está activo |
| `permission_unknown` | Permiso desconocido |
| `registry_catalog_mismatch` | Hash de catálogo no coincide |
| `consumer_surface_mismatch` | Superficie no coincide |
| `surface_mismatch` | Superficie inválida |

### 11.2 Códigos de Rol y Membresía

| Código | Significado |
|--------|-------------|
| `role_path_missing` | No hay ruta de rol |
| `organization_role_unknown` | Rol desconocido |
| `role_permission_missing` | Rol no tiene permiso |
| `membership_required` | Membresía requerida |
| `membership_revoked` | Membresía revocada |
| `membership_stale` | Membresía desactualizada |

### 11.3 Códigos PBAC

| Código | Significado |
|--------|-------------|
| `owner_ceiling_missing` | Ceiling no existe |
| `owner_ceiling_denied` | Ceiling deniega |
| `tenant_activation_missing` | Activation falta |
| `tenant_activation_denied` | Activation denegada |
| `tenant_activation_exceeds_owner_ceiling` | Activation excede ceiling |
| `tenant_activation_locked` | Activation bloqueada |

### 11.4 Códigos ABAC y Delegación

| Código | Significado |
|--------|-------------|
| `authorization_snapshot_stale` | Snapshot desactualizado |
| `authorization_policy_version_conflict` | Conflicto de versión |
| `delegation_rule_missing` | Regla de delegación falta |
| `delegation_operation_denied` | Operación de delegación denegada |
| `target_role_not_delegable` | Rol no delegable |

### 11.5 Códigos de Módulo y Runtime

| Código | Significado |
|--------|-------------|
| `module_not_installed` | Módulo no instalado |
| `module_disabled` | Módulo deshabilitado |
| `module_suspended` | Módulo suspendido |
| `capability_unavailable` | Capacidad no disponible |
| `runtime_incompatible` | Runtime incompatible |
| `runtime_unavailable` | Runtime no disponible |

### 11.6 Códigos de Auditoría

| Código | Significado |
|--------|-------------|
| `critical_operation_reason_required` | Razón requerida |
| `critical_operation_idempotency_required` | Idempotencia requerida |
| `audit_intent_missing` | Intento de auditoría falta |
| `audit_sink_unavailable` | Sink de auditoría no disponible |

---

## 12. FRONTEND Y UI

### 12.1 Componentes de Autorización

Ubicación: `/workspace/frontend/src/authorization/`

| Archivo | Propósito |
|---------|-----------|
| `AuthorizationProvider.tsx` | Provider de contexto |
| `authorization-client.ts` | Cliente HTTP |
| `permission-checker.ts` | Utilitario de chequeo |
| `use-authorization.ts` | Hook de autorización |
| `use-permissions.ts` | Hook de permisos |
| `authorizationContext.contract.test.mjs` | Tests de contrato |
| `visualContract.contract.test.mjs` | Tests visuales |

### 12.2 Contratos Frontend

```typescript
// AuthorizationContext
interface AuthorizationContext {
  organizationId: string;
  policyVersion: string;
  snapshotVersion: string;
  catalogHash: string;
  roleModelVersion: string;
  eligibleActions: ActionEligibility[];
  moduleAvailability: ModuleAvailability[];
}

interface ActionEligibility {
  actionId: string;
  permissionId: string;
  allowed: boolean;
  readOnly?: boolean;
  reasonCode?: string;
}
```

### 12.3 Módulos de Governance

Ubicación: `/workspace/frontend/src/features/governance/modules/`

| Módulo | Ruta | Propósito |
|--------|------|-----------|
| `access-preview` | `/governance/access-policy/access-preview` | Vista previa de acceso |
| `aliases-navigation` | `/governance/aliases-navigation` | Alias de navegación |
| `audit` | `/governance/audit` | Auditoría de cambios |
| `data-scope` | `/governance/access-policy/scope-assignments` | Asignación de scopes |
| `identity-provisioning` | `/governance/identity-provisioning` | Provisionamiento |
| `members` | `/governance/members` | Gestión de miembros |
| `overview` | `/governance/overview` | Vista general |
| `people-segmentation` | `/governance/people-segmentation` | Segmentación |
| `permission-matrix` | `/governance/permission-matrix` | Matriz de permisos |
| `taxonomy` | `/governance/taxonomy` | Taxonomías |
| `units` | `/governance/units` | Unidades organizacionales |

### 12.4 Principios UI

1. **Navegación desde registry**: AppShell presenta árbol resultante
2. **Sin permiso = no visible**: URL directa muestra 403
3. **Vista ≠ actualización**: Read-only cuando no hay update
4. **Preferencias visuales**: Ocultan items, no eliminan auth
5. **Estados explícitos**: `planned` o backend no montado se muestran claramente
6. **Selectores filtrados**: Solo unidades/taxonomías válidas para tenant y estrategia

---

## 13. MÓDULOS DE GOVERNANCE

### 13.1 Permission Matrix

**Propósito:** Visualizar y editar activaciones de permisos por rol

**Flujo:**
1. Leer catálogo de permisos activos
2. Leer ceilings de Owner para organización
3. Leer activations actuales de tenant
4. Mostrar matriz: filas=permisos, columnas=roles
5. Toggle solo en intersecciones donde ceiling.allowed=true
6. Guardar activation → incrementa policy_version → auditoría

### 13.2 Scope Assignments

**Propósito:** Asignar data scopes a usuarios/roles

**Flujo:**
1. Seleccionar usuario y rol
2. Seleccionar capability
3. Listar templates de scope disponibles
4. Seleccionar tipo: dimension/unit/resource
5. Según tipo, mostrar selector correspondiente
6. Guardar assignment → valida constraints → auditoría

### 13.3 Access Preview

**Propósito:** Simular decisión de autorización para debugging

**Flujo:**
1. Seleccionar usuario simulado
2. Seleccionar acción/recurso
3. Ejecutar pipeline completo
4. Mostrar resultado paso a paso:
   - RBAC ✓/✗
   - PBAC ✓/✗
   - ABAC ✓/✗
   - Decisión final + reasonCode

### 13.4 Audit

**Propósito:** Ver historial de cambios de política

**Eventos auditados:**
- Cambio de ceiling
- Cambio de activation
- Asignación de scope
- Revocación de scope
- Cambio de membresía
- Delegación creada/revocada

---

## 14. DELEGACIÓN

Ubicación: `/workspace/backend/authorization/delegation/`

### 14.1 Concepto

Permite que un usuario actúe en nombre de otro con límites explícitos:
- Duración máxima: 15 minutos
- Capacidades permitidas/denegadas explícitas
- Confirmación de política requerida

### 14.2 Tabla authorization_delegation_contexts

```sql
CREATE TABLE authorization_delegation_contexts (
  decision_id VARCHAR(80) PRIMARY KEY,
  actor_subject VARCHAR(128) NOT NULL,
  actor_surface VARCHAR(40) NOT NULL,
  client_id VARCHAR(128) NOT NULL,
  target_organization_id VARCHAR(128) NOT NULL,
  reason TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  allowed_capabilities JSONB NOT NULL,
  denied_effects JSONB NOT NULL,
  confirmation_policy VARCHAR(40) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT ttl_check CHECK(
    expires_at > issued_at 
    AND expires_at <= issued_at + INTERVAL '15 minutes'
  ),
  CONSTRAINT status_check CHECK(status IN ('active','revoked'))
);
```

### 14.3 Archivos de Delegación

| Archivo | Propósito |
|---------|-----------|
| `delegationContextRepository.js` | Repositorio de contextos |
| `delegationContextService.js` | Servicio de gestión |
| `delegationReasonCodes.js` | Códigos de razón |
| `delegationRepository.js` | Repositorio base |
| `delegationService.js` | Servicio principal |
| `delegationValidation.js` | Validaciones |
| `evaluateRoleDelegation.js` | Evaluación de delegación |
| `requireDelegationContext.js` | Middleware requerido |

---

## 15. ENTITLEMENTS

Ubicación: `/workspace/backend/authorization/entitlements/`

### 15.1 Propósito

Gestionar el ciclo de vida de entitlements:
- Línea base de entitlements
- Evaluación de elegibilidad
- Políticas de entitlement
- Validaciones

### 15.2 Componentes

| Archivo | Propósito |
|---------|-----------|
| `authorizationContextService.js` | Contexto de autorización |
| `bootstrapProfileService.js` | Perfiles bootstrap |
| `entitlementBaselineService.js` | Línea base |
| `entitlementEvaluator.js` | Evaluador |
| `entitlementPolicyAdapter.js` | Adaptador de políticas |
| `entitlementReasonCodes.js` | Códigos de razón |
| `entitlementRepository.js` | Repositorio |
| `entitlementService.js` | Servicio principal |
| `entitlementValidation.js` | Validaciones |

### 15.3 Bootstrap Profile Flow

```
1. Owner selecciona perfil al crear org
2. bootstrapProfileService.materialize():
   - Crea membresía inicial
   - Asigna rol canónico
   - Inserta org_role_entitlement_limits (ceilings)
   - Inserta org_role_permission_activations (activations)
   - Registra templates de scope disponibles
   - Incrementa policy_version
   - Auditoría completa
3. Usuario admin puede ahora operar dentro de límites
```

---

## 16. RUNTIME Y CACHE

Ubicación: `/workspace/backend/authorization/runtime/`

### 16.1 Componentes Runtime

| Componente | Propósito |
|------------|-----------|
| `authorizationEvents.js` | Eventos de autorización |
| `authorizationFreshnessService.js` | Frescura de datos |
| `authorizationVersionService.js` | Versionado |
| `cacheKeyRegistry.js` | Registry de claves cache |
| `cachePolicy.js` | Políticas de cache |
| `index.js` | Punto de entrada |

### 16.2 Subdirectorios

- `feature-flags/` - Resolución de disponibilidad
- `outbox/` - Reconciliación y dispatch
- `reauthorization/` - Revalidación asíncrona
- `billing/` - Workflow de cambios de seat

### 16.3 Cache Policy

```javascript
// Estrategias de cache
- authorization_context: TTL 5 min, invalida por policy_version
- entitlement_snapshot: TTL 15 min, invalida por cambio
- membership_status: TTL 1 min, validación frecuente
- scope_assignments: TTL 10 min, invalida por assignment change
```

---

## 17. AUDITORÍA

### 17.1 Eventos Auditados

| Evento | Tabla | Campos clave |
|--------|-------|--------------|
| Ceiling creado/modificado | org_role_entitlement_limits | set_by_logto_user_id, reason, policy_version |
| Activation creado/modificada | org_role_permission_activations | set_by_logto_user_id, reason, policy_version |
| Scope asignado | authorization_scope_assignments | assigned_by_logto_user_id, reason, source_type |
| Scope revocado | authorization_scope_assignments | revoked_at, revoked_by_logto_user_id |
| Delegación creada | authorization_delegation_contexts | actor_subject, reason, expires_at |
| Delegación revocada | authorization_delegation_contexts | revoked_at |
| Policy version incrementada | authorization_policy_versions | version, updated_by_logto_user_id, reason |

### 17.2 Outbox de Autorización

Componentes en `/workspace/backend/authorization/runtime/outbox/`:

| Archivo | Propósito |
|---------|-----------|
| `authorizationOutboxReconciler.js` | Reconciliación |
| `authorizationOutboxService.js` | Servicio |
| `authorizationOutboxRepository.js` | Repositorio |
| `authorizationOutboxDispatcher.js` | Dispatch de eventos |

### 17.3 Schema de Auditoría

```javascript
{
  eventType: "ceiling_updated",
  aggregateId: "uuid-limit",
  aggregateType: "org_role_entitlement_limit",
  organizationId: "uuid-org",
  actor: {
    subject: "user-id",
    surface: "owner",
    clientId: "client-id"
  },
  timestamp: "2026-01-XXT00:00:00Z",
  before: { allowed: false },
  after: { allowed: true },
  reason: "Activación para nuevo semestre",
  policyVersion: "123",
  correlationId: "uuid-correlation",
  metadata: {
    roleId: "organization_teacher",
    permissionKey: "lms.grades.read"
  }
}
```

---

## 18. ARCHIVOS DEL SISTEMA

### 18.1 Core AuthZ (17 archivos)

```
/workspace/core/authz/
├── index.js
├── constants.js
├── catalog/
│   ├── registry.js
│   ├── analytics.permissions.js
│   ├── billing.permissions.js
│   ├── communications.permissions.js
│   ├── community.permissions.js
│   ├── connectors.permissions.js
│   ├── crm.permissions.js
│   ├── lms.permissions.js
│   ├── marketing.permissions.js
│   ├── notifications.permissions.js
│   ├── organization.permissions.js
│   ├── owner.permissions.js
│   ├── scheduling.permissions.js
│   ├── support.permissions.js
│   └── generated/
│       └── permission-catalog.js
├── roles/
│   ├── registry.js
│   ├── global-role-permissions.js
│   ├── organization-role-permissions.js
│   └── generated/
│       └── role-model.js
├── runtime/
│   └── active-permissions.js
├── legacy/
│   └── legacy-permission-map.js
├── validation/
│   ├── validate-authz-contract.js
│   └── validate-permission-name.js
└── contract-tests/
    └── authz-contract.test.js
```

### 18.2 Backend Authorization (60+ archivos)

```
/workspace/backend/authorization/
├── policies/
│   ├── authorize.js
│   ├── index.js
│   ├── registry.js
│   ├── defaultRegistry.js
│   ├── policyContext.js
│   ├── policyResult.js
│   ├── reasonCodes.js
│   ├── errors.js
│   ├── guards.js
│   ├── provisioningGuard.js
│   ├── roles.js
│   ├── roleMappingErrors.js
│   ├── roleMappingResolver.js
│   ├── roleMappingStore.js
│   ├── roleMappingTypes.js
│   ├── principalBuilder.js
│   ├── middleware/
│   │   └── requireAuthorization.js
│   ├── core/ (10 políticas)
│   ├── extensions/ (4 subdirectorios)
│   ├── owner/ (5 políticas)
│   └── providers/ (9 proveedores)
├── data-scope/ (18 archivos)
│   ├── index.js
│   ├── dataScopeAssignmentService.js
│   ├── dataScopeAudit.js
│   ├── dataScopeConstraint.js
│   ├── dataScopeConstraintComposer.js
│   ├── dataScopeEvaluator.js
│   ├── dataScopePolicyRegistry.js
│   ├── dataScopeReasonCodes.js
│   ├── dataScopeRegistry.js
│   ├── dataScopeRepository.js
│   ├── dataScopeRuntimePort.js
│   ├── dataScopeStrategyRegistry.js
│   ├── relationshipScopeAdapter.js
│   ├── resourceScopeAdapter.js
│   ├── rolePathResolver.js
│   ├── scopeCandidateAdapter.js
│   ├── scopeTemplateRegistry.js
│   ├── taxonomyDimensionsRegistry.js
│   ├── taxonomyScopeAdapter.js
│   └── adapters/ (4 adaptadores)
├── delegation/ (8 archivos)
├── entitlements/ (10 archivos)
├── principal/ (3 archivos)
└── runtime/ (12+ archivos)
```

### 18.3 Frontend Authorization

```
/workspace/frontend/src/authorization/
├── AuthorizationProvider.tsx
├── authorization-client.ts
├── authorizationContext.contract.test.mjs
├── permission-checker.ts
├── use-authorization.ts
├── use-permissions.ts
├── visualContract.contract.test.mjs
├── components/
├── contracts/
├── evaluation/
└── registry/

/workspace/frontend/src/features/governance/modules/
├── access-preview/
├── aliases-navigation/
├── audit/
├── data-scope/
├── identity-provisioning/
├── members/
├── overview/
├── people-segmentation/
├── permission-matrix/
├── taxonomy/
└── units/
```

### 18.4 Documentación

```
/workspace/docs/architecture/
├── CIVITAS_AUTHORIZATION_POLICY_MODEL.md (456 líneas)
├── authorization-global-vs-organization.md
├── phase-3/
│   ├── 00-CIVITAS-PHASE-3-AUTHORITY-AND-PRECEDENCE.md
│   ├── 10-CIVITAS-AUTHORIZATION-FOUNDATION-V2.md
│   ├── 11-CIVITAS-TOKEN-PRINCIPAL-AND-ROLE-PATHS-V2.md
│   ├── 12-CIVITAS-DATA-SCOPE-TAXONOMY-V2.md
│   └── 13-CIVITAS-AUTHORIZATION-DECISION-PIPELINE-V2.md
├── CIVITAS_GOVERNANCE_WORKSPACE_UX_SPEC.md
├── core/
│   └── 00-CIVITAS-CORE-SCOPE-FREEZE.md
└── CIVITAS_Phase_2_Authorization_Engineering_Design.md

/workspace/docs/authorization/
├── tenant-isolation-and-entitlements.md
├── policy-registry.md
├── phase-2-authz-contract.md
├── naming-contract.md
├── logto-authorization-bootstrap.md
└── scope-only-and-delegation.md
```

### 18.5 Migraciones SQL (14 archivos)

```
/workspace/backend/db/migrations/
├── 0006_authz_delegation_limits.sql
├── 0007_authz_entitlement_overlay.sql
├── 0008_authz_taxonomy.sql
├── 0009_authz_units.sql
├── 0010_authz_data_scopes.sql
├── 0011_authorization_runtime_consistency.sql
├── 0013_membership_role_bound_scope_subject.sql
├── 0014_scope_templates.sql
├── 0016_authorization_scope_assignments_contract.sql
├── 0024_data_scope_taxonomy_v2.sql
├── 0025_data_scope_taxonomy_reconciliation_plan.sql
├── 0026_data_scope_assignment_governance.sql
├── 0027_authorization_delegation_contexts.sql
└── 0028_integration_operation_idempotency_tenant_scope.sql
```

---

## 📊 ESTADÍSTICAS DEL SISTEMA

| Métrica | Valor |
|---------|-------|
| **Roles canónicos** | 15 (1 global + 14 org) |
| **Dominios de permiso** | 14 |
| **Permisos totales** | ~500+ (generados) |
| **Políticas core** | 10 |
| **Políticas extensions** | 8+ |
| **Políticas owner** | 5 |
| **Proveedores** | 9 |
| **Códigos de razón** | 65+ |
| **Tablas DB authz** | 8+ |
| **Índices DB** | 20+ |
| **Migraciones** | 14 |
| **Archivos backend** | 100+ |
| **Archivos frontend** | 30+ |
| **Documentos arquitectura** | 15+ |

---

## 🔐 MATRIZ DE PRUEBAS MÍNIMA

1. ✅ Rol provisionado sin Owner Ceiling → **403** (`owner_ceiling_missing`)
2. ✅ Rol con ceiling sin Tenant Activation → **403** (`tenant_activation_missing`)
3. ✅ RBAC+PBAC OK sin scope ABAC → **Lista vacía/403** (nunca acceso global)
4. ✅ Múltiples roles → Permitido solo si una ruta completa pasa
5. ✅ Activation intenta exceder ceiling → **Rechazo DB** (trigger)
6. ✅ Scope cross-tenant → **Rechazo** (FK constraint)
7. ✅ Catálogo mismatch → **403** (`registry_catalog_mismatch`)
8. ✅ Módulo deshabilitado → **403** (`module_disabled`)
9. ✅ Membresía revocada → **403** (`membership_revoked`)
10. ✅ Delegación expirada → **403** (`impersonation_expired`)

---

## 📝 GLOSARIO

| Término | Definición |
|---------|------------|
| **Subject** | Identificador único de usuario (Logto user ID) |
| **Surface** | Contexto de operación (owner/organization/self) |
| **Role Path** | Cadena: token → rol → permisos potenciales |
| **Ceiling** | Límite máximo de permiso por rol/org (Owner) |
| **Activation** | Habilitación efectiva de permiso (Tenant) |
| **Scope** | Alcance de datos para operación ABAC |
| **Strategy** | Regla registrada que evalúa scopes |
| **Snapshot** | Instantánea de estado de autorización |
| **Policy Version** | Número incremental de cambios de política |
| **Reason Code** | Código machine-readable de decisión |

---

## 📞 CONTACTO Y SOPORTE

- **Documentación principal:** `/workspace/docs/architecture/CIVITAS_AUTHORIZATION_POLICY_MODEL.md`
- **Contratos:** `/workspace/contracts/authorization/`
- **Tests de contrato:** `/workspace/core/authz/contract-tests/`
- **Inventario ABAC previo:** `/workspace/INVENTARIO_ABAC_SCOPE_ASSIGNMENTS.md`

---

**Fin del documento**  
*Generado automáticamente desde el código fuente de Civitas*
