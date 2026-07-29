# Civitas — Modelo normativo de autorización: RBAC, PBAC y ABAC

> **Historical legacy strings: explicitly marked.** Any `academic.section` or `academic.grade_level` below is retained only as historical/migration evidence; it is not an active alias.


**Estado:** Normativo para Phase 2  
**Fecha:** 2026-07-15  
**Fuente de decisión:** ADR de autorización #127  
**Ámbito:** backend, contratos de API, catálogo, Logto, frontend y auditoría.

> Este documento fija el modelo de autorización de Civitas. Un cambio de semántica requiere ADR, migración versionada, pruebas de regresión, auditoría y actualización de este documento. No se crean excepciones por pantalla, endpoint, rol local ni integración de identidad.

## 1. Propósito

Civitas usa tres capas complementarias:

| Capa | Pregunta que responde | Autoridad |
|---|---|---|
| **RBAC** | ¿Qué puede hacer potencialmente este rol canónico? | Catálogo global, roles de Logto y mapeo rol-permiso |
| **PBAC** | ¿Qué parte de ese potencial está permitida por Owner y activada por el tenant? | Owner Ceiling + Tenant Activation |
| **ABAC** | ¿Sobre cuáles recursos concretos puede actuar este sujeto? | Scopes, relaciones, atributos de recurso y contexto |

RBAC por sí solo simplifica la administración al agrupar permisos por rol; ABAC añade atributos de sujeto, recurso, acción y entorno para decisiones granulares y contextuales. Civitas combina ambos y añade PBAC como overlay de política de producto multi-tenant. Véase [RBAC y ABAC de Logto](https://blog.logto.io/es/rbac-and-abac).

El resultado es una decisión **server-side**, explícita, auditable y deny-by-default. El frontend únicamente consume el contexto resuelto; nunca reemplaza la autorización del backend.

## 2. Principios inmutables

1. **Deny-by-default.** Si falta catálogo activo, scope, rol potencial, ceiling, activation, policy o data scope requerido, la decisión es denegar.
2. **Backend authoritative.** Ocultar un menú, botón o ruta no autoriza ni desautoriza una API. Toda operación vuelve a validar en backend.
3. **Una fuente por concepto.** El catálogo define potencial; PBAC define disponibilidad por tenant; ABAC define alcance de datos. Ninguna capa duplica a otra.
4. **Sin roles ad hoc en Phase 2.** Solo existen roles canónicos globales y de organización definidos por Owner/Logto.
5. **Sin permisos wildcard.** Ningún rol, token, ceiling o activation concede `*`, `domain.*` o permisos no catalogados.
6. **Tenant isolation primero.** Cualquier carga de recurso comprueba organización antes de evaluar/ejecutar la acción.
7. **Datos, no UI, para políticas.** Ceilings, activations, scopes, versiones y auditoría viven en persistencia; no se reconstruyen desde JSX, JWT crudo o estado de navegador.
8. **No privilege borrowing.** Con varios roles, cada ruta de rol se evalúa completa; no se combinan el permiso de un rol y el scope de otro.
9. **Auditabilidad.** Toda mutación de política, membresía, relación o scope deja actor, organización, antes/después, razón, versión y correlación.
10. **Fail closed.** Ambigüedad, contrato inválido, versión incompatible o estado stale bloquean el acceso; no devuelven datos “por si acaso”.

## 3. Ownership: quién gobierna cada capa

### 3.1 Owner Global

Owner gobierna el catálogo global y las fronteras de producto:

- IDs canónicos de roles y permisos;
- potencial RBAC de cada rol;
- templates semánticos de scope, estrategia ABAC y dimensiones/relaciones permitidas;
- perfiles base y Bootstrap Profiles;
- Owner Ceilings máximos;
- versiones, deprecaciones y migraciones;
- introducción de un nuevo rol o permiso.

Owner puede parametrizar por organización el perfil que se aplicará, pero no debe realizar cambios operativos cotidianos sin una intervención explícita y auditada.

### 3.2 Tenant Admin

Tenant Admin opera **dentro** del catálogo y los ceilings existentes:

- activar/desactivar permisos que Owner ya permitió;
- asignar miembros a roles canónicos;
- renombrar alias visibles;
- escoger valores permitidos por templates;
- crear unidades y relaciones válidas de la organización;
- configurar y asignar data scopes;
- administrar navegación visual no autorizativa.

Tenant no puede crear roles, cambiar IDs semánticos, ampliar potencial RBAC, superar ceilings, inventar una dimensión/estrategia de scope ni editar un catálogo global.

## 4. RBAC: catálogo potencial

### 4.1 Roles canónicos

Los roles son IDs estables, no etiquetas visuales. Logto es el proveedor de identidad y de asignación de roles; el backend confirma que cualquier rol recibido pertenece al catálogo conocido.

- Rol global: `owner_global`.
- Roles de organización: `organization_admin`, `organization_director`, `organization_headdirector`, `organization_headteacher`, `organization_groupleader`, `organization_teacher`, `organization_student`, `organization_parent`, `organization_secretary`, `organization_accountant`, `organization_billing`, `organization_payroll`, `organization_member`.

El tenant puede cambiar el nombre que se muestra (“Rector”, “Coordinador académico”, etc.), pero no el ID ni el potencial del rol. Crear un rol nuevo es un cambio de Owner: catálogo, configuración Logto, permisos, contrato, migración, tests y version bump.

### 4.2 Permisos y acciones

Un permiso canónico representa una capacidad de dominio, por ejemplo `lms.grades.read` o `lms.grades.update`. Una action ID de frontend/ruta/API debe referenciar un permiso activo, nunca un literal inventado.

Un permiso solo puede ser efectivo si está:

1. presente y **activo** en el catálogo;
2. asignado potencialmente al rol canónico;
3. incluido por el token/identidad válida cuando el contrato de la operación lo exige;
4. permitido por PBAC; y
5. permitido sobre el recurso por ABAC.

Permisos `planned`, `deprecated` o desconocidos no se convierten en efectivos. La UI puede reflejar su estado, pero no invocar operaciones no activas.

### 4.3 Rol, membresía y permiso no son sinónimos

```text
membresía de organización
+ rol canónico de Logto
= candidato RBAC

candidato RBAC
+ PBAC permitido
+ ABAC válido
= autorización efectiva para una operación/recurso
```

Una membresía por sí sola no concede permiso. Una relación organizacional tampoco concede permiso salvo que una estrategia ABAC registrada la use como atributo de alcance.

## 5. PBAC: Owner Ceiling y Tenant Activation

PBAC en Civitas no reemplaza RBAC. Es la política de producto que reduce el potencial RBAC por organización.

### 5.1 Owner Ceiling

Owner Ceiling responde: **“¿Este rol puede ofrecer este permiso en esta organización?”**

- Es máximo permitido, no concesión directa.
- Se almacena por `organizationId + roleId + permissionId`.
- Ausencia equivale a denegación para capacidades restringibles.
- `allowed=false` vence cualquier activation tenant.

### 5.2 Tenant Activation

Tenant Activation responde: **“¿Esta organización decidió habilitar este permiso, ya permitido, para este rol?”**

- Se almacena por `organizationId + roleId + permissionId`.
- Solo puede estar habilitada si existe un Owner Ceiling permitido correspondiente.
- No puede elevar un ceiling ni crear un permiso nuevo.
- Su cambio invalida/actualiza la versión de política y genera auditoría.

### 5.3 Regla PBAC

```text
PBAC(role, permission, organization) =
  ownerCeiling.allowed === true
  AND tenantActivation.enabled === true
```

La interfaz Owner edita ceilings; la interfaz tenant edita activations de los permisos que el ceiling ya permite. Nunca se mezclan ambos controles en un mismo toggle.

### 5.4 Bootstrap Profile

Un Bootstrap Profile es un perfil versionado seleccionado explícitamente por Owner al crear una organización. Sirve para que el primer administrador configure el tenant sin un bypass.

En una única transacción auditable, el perfil puede materializar:

- membresía inicial y rol canónico permitido;
- Owner Ceilings exactos;
- Tenant Activations exactas;
- templates de scope disponibles;
- versión de catálogo, actor, origen del wizard y policy version.

No significa “todos los permisos del administrador están activos”. Toda capacidad debe estar listada explícitamente y seguir pasando ABAC cuando aplique.

## 6. ABAC: Data Scopes y atributos de recurso

ABAC decide el alcance real de los datos una vez RBAC y PBAC permiten la operación.

### 6.1 Tipos de scope

Los scopes se persisten como datos, tenant-scoped y con un objetivo exacto:

| Tipo | Ejemplo | Uso |
|---|---|---|
| `dimension` | `academic.section=primary` | filtrar por taxonomía |
| `unit` | Unidad/área válida de la organización | filtrar por estructura organizacional |
| `resource` | estudiante, curso o recurso específico | acceso individual controlado |
| `relationship` | docente asignado, padre relacionado | candidato derivado por estrategia registrada |

Un scope contiene ID semántico, target, organización, sujeto/rol aplicable, origen, versión y estado. Nunca acepta targets cross-tenant.

### 6.2 Taxonomía no es jerarquía

Taxonomías clasifican datos y alimentan selectores/scopes: `academic.section`, `academic.subject`, `academic.grade_level`, `organization.campus`, `organization.department`, `administration.function`.

Las unidades organizacionales representan estructura real y relaciones de reporte/operación. No se usan taxonomías para simular cadena de mando ni se convierten valores académicos en roles.

### 6.3 Estrategias ABAC registradas

Las estrategias son código/contrato global versionado, no reglas arbitrarias escritas por cada tenant. Ejemplos de comportamiento:

| Rol/capacidad | Alcance esperado |
|---|---|
| Director | organización completa cuando la estrategia lo permite |
| Head director | dimensiones `academic.section` asignadas |
| Head teacher | dimensiones `academic.subject` asignadas |
| Teacher | grupos/cursos asignados mediante relación válida |
| Student | solo recursos propios |
| Parent | solo estudiantes vinculados |

Un rol con capacidad de `manage` no amplía filas por sí mismo. Si requiere assignment y este falta, el resultado es vacío/“alcance no configurado”, nunca acceso global.

### 6.4 Combinación de scopes

- **AND dentro de una cláusula:** un recurso debe satisfacer todos los atributos requeridos por la estrategia.
- **OR entre rutas de rol completas:** si un usuario tiene varios roles, se permite si al menos una ruta completa pasa RBAC + PBAC + ABAC.
- No se mezcla el permiso de un rol con los scopes de otro.
- Si ninguna ruta completa pasa, se deniega.

## 7. Pipeline de decisión obligatorio

Para cada endpoint protegido y recurso concreto:

```text
1. Autenticar token Logto y resolver organización solicitada.
2. Verificar que permiso/action exista y esté activo en el catálogo.
3. Resolver roles canónicos del sujeto para esa organización.
4. Para cada rol, comprobar potencial RBAC.
5. Para cada ruta RBAC posible, comprobar Owner Ceiling.
6. Comprobar Tenant Activation.
7. Resolver ABAC con estrategia, scopes y atributos del recurso.
8. Unir únicamente rutas completas permitidas.
9. Cargar/filtrar recurso tenant-scoped y ejecutar operación.
10. Auditar mutación o decisión relevante.
```

Pseudocódigo:

```ts
const allowedPath = rolePaths.some((path) =>
  catalog.isActive(action.permissionId) &&
  rbac.hasPotential(path.roleId, action.permissionId) &&
  pbac.ownerCeilingAllows(orgId, path.roleId, action.permissionId) &&
  pbac.tenantActivationAllows(orgId, path.roleId, action.permissionId) &&
  abac.allows(path.roleId, subject, resource, action, orgId)
);

if (!allowedPath) throw forbidden(reasonCode);
```

El frontend puede recibir un `AuthorizationContext` para construir navegación elegible, pero nunca evalúa roles desde JWT crudo ni sustituye el chequeo anterior.

## 8. Logto: aprovisionamiento no equivale a autorización

Logto puede usar **Default organization roles**, aprovisionamiento por dominio de correo o Enterprise SSO/JIT para crear/reconciliar membresía y asignar roles canónicos. Eso solo establece el candidato RBAC.

| Evento | Logto puede crear | Civitas debe validar para permitir una acción |
|---|---|---|
| Wizard con roles predeterminados | Membresía y rol inicial | Bootstrap Profile explícito + PBAC + ABAC |
| Dominio verificado | Membresía y rol canónico permitido | Ceiling + activation tenant + ABAC |
| Enterprise SSO/JIT | Membresía y rol mapeado desde IdP aprobado | Ceiling + activation tenant + ABAC |
| Login de miembro existente | Token y claims candidatos | Pipeline completo |

Controles obligatorios:

- El mapeo JIT/dominio asigna solo roles canónicos aprobados.
- Ningún flujo de provisioning asigna `owner_global`.
- La relación dominio/IdP → organización debe verificarse y ser idempotente.
- Claims externos no pueden inyectar permisos, action IDs, ceilings, activations ni scopes.
- Alta/cambio/baja por provisioning genera auditoría e invalida/refresca el contexto de autorización.
- Un usuario provisionado obtiene potencial RBAC; no recibe activations adicionales implícitamente.

## 9. Contratos y persistencia

Los contratos de autorización deben ser versionados y validados al inicio/CI:

- catálogo canónico de permisos y roles;
- mapeo de potencial RBAC;
- `org_role_entitlement_limits` para Owner Ceilings;
- `org_role_permission_activations` para Tenant Activations;
- `authorization_scope_assignments` para ABAC;
- `authorization_policy_versions` para coherencia e invalidación;
- auditoría y outbox para cambios de política.

Reglas de integridad:

- activation habilitada sin ceiling permitido: rechazar por constraint/servicio;
- scope con objetivo inválido o de otro tenant: rechazar;
- recurso cargado sin filtro tenant: rechazar;
- catálogo/versión incompatible o snapshot stale: fail closed;
- operaciones Governance/read models: consumir persistencia real, no repositorios en memoria en producción.

## 10. Códigos de razón

Las denegaciones y decisiones deben ser explicables, sin filtrar información sensible de otro tenant. Códigos mínimos:

- `token_scope_missing`
- `organization_role_unknown`
- `role_permission_missing`
- `owner_ceiling_missing`
- `owner_ceiling_denied`
- `tenant_activation_missing`
- `tenant_activation_denied`
- `tenant_activation_exceeds_owner_ceiling`
- `tenant_activation_locked`
- `authorization_snapshot_stale`
- `authorization_policy_version_conflict`

Los códigos son para auditoría, soporte y UI segura. No revelan IDs, filas o políticas pertenecientes a otra organización.

## 11. Frontend y UX

- La navegación se resuelve desde el registry y el `AuthorizationContext`; AppShell solo presenta el árbol resultante.
- Sin permiso de vista, el item no aparece; una URL directa muestra acceso denegado y la API devuelve 403.
- Con vista pero sin actualización, la misma pantalla es read-only; no se inventa otra ruta.
- Las preferencias de menú son visuales: pueden ocultar un item, pero no eliminan autorización de URL/API.
- Estados `planned` o backend no montado se muestran con estados explícitos, sin simular datos ni llamar endpoints inexistentes.
- Los selectores de data scope muestran solo unidades/taxonomías válidas para el tenant y para la estrategia del rol.

## 12. Prohibiciones

No está permitido:

- evaluar autorización exclusivamente en frontend;
- leer JWT crudo en UI para reconstruir permisos;
- conceder acceso por pertenencia, alias, menú o relación no registrada;
- usar Logto provisioning como bypass de PBAC/ABAC;
- crear roles, permisos, scopes o templates locales;
- usar taxonomía como jerarquía de mando;
- usar un `resourceId` del cliente como sustituto de la comprobación tenant/scope;
- mapear permisos `planned` como activos;
- reemplazar persistencia por repositorios en memoria fuera de tests/dev explícito.

## 13. Matriz mínima de pruebas

1. Rol provisionado por dominio con token válido y sin Owner Ceiling: 403.
2. Rol con ceiling permitido y sin Tenant Activation: 403.
3. Rol con RBAC+PBAC permitido y sin scope ABAC requerido: lista vacía/403 según contrato; nunca acceso global.
4. Usuario con dos roles: se permite solo si una ruta completa pasa; no hay préstamo de privilegios.
5. Admin inicial del wizard: solo recibe capacidades del Bootstrap Profile.
6. Claim SSO malicioso con `owner_global` o permiso inventado: se rechaza/no se mapea.
7. Revocar activation o scope revoca acceso efectivo tras invalidación de versión.
8. URL directa y API producen el mismo resultado efectivo que la navegación.
9. Recurso de otro tenant: 403/404 seguro antes de exponer datos.
10. Cada mutación PBAC/ABAC deja auditoría y versión de política.

## 14. Proceso para cambiar el modelo

Un cambio de rol, permiso, template, estrategia ABAC, ceiling, activation por defecto o provisioning requiere:

1. ADR/decisión de producto y seguridad;
2. cambio de catálogo versionado;
3. migración de datos e invariantes de base;
4. actualización de backend, contratos y frontend;
5. tests de regresión y de aislamiento tenant;
6. actualización de este documento y de los read models;
7. aprobación de ownership/CODEOWNERS.

No se admiten cambios silenciosos que alteren autorización efectiva.


## 15. Plantilla obligatoria para introducir o cambiar un rol canónico

Un rol nuevo no es una configuración de tenant ni una asignación aislada de Logto: modifica el contrato global de seguridad. Para eliminar decisiones repetidas y asegurar que cada cambio atraviese RBAC, PBAC y ABAC de forma consistente, **todo rol nuevo, cambio material de potencial o deprecación debe usar la plantilla** [CIVITAS_NEW_CANONICAL_ROLE_TEMPLATE.md](templates/CIVITAS_NEW_CANONICAL_ROLE_TEMPLATE.md).

### 15.1 Flujo parametrizado

```text
Necesidad de responsabilidad reutilizable
→ completar plantilla y aprobar Owner
→ catálogo + Logto + estrategia ABAC versionados
→ ceilings/activations o Bootstrap Profile explícitos
→ pruebas de multirol, tenant isolation y revocación
→ desplegar el rol como candidato
→ Tenant asigna miembros, aliases y scopes permitidos
```

La plantilla hace que cada rol declare los mismos parámetros:

| Parámetro | Quién lo define | Ejemplo |
|---|---|---|
| ID canónico y estado | Owner | `organization_groupleader` |
| Alias visible | Tenant | “Director de grupo” |
| Potencial RBAC | Owner | permisos de lectura explícitos |
| Owner Ceiling inicial | Owner/perfil | qué puede ofrecerse |
| Tenant Activation | Tenant dentro del ceiling | qué queda habilitado |
| Estrategia ABAC | Owner | `group_leadership` |
| Valores, unidades y relaciones | Tenant | `leads(7B)` |
| Membresía/rol Logto | Tenant o provisioning aprobado | usuario → rol |
| Auditoría/versiones | Sistema | antes/después, actor, razón |

### 15.2 Cuándo usar rol nuevo y cuándo no

Crear un rol canónico únicamente si representa una responsabilidad reutilizable, con potencial RBAC o estrategia ABAC propios, que otros tenants puedan necesitar.

No crear un rol cuando el cambio sea solamente:

- un nombre local de cargo: usar alias;
- una unidad, curso, grupo o área diferente: usar scope/unidad/relación;
- una diferencia temporal de disponibilidad: usar Tenant Activation;
- un límite comercial o de producto: usar Owner Ceiling/perfil;
- una responsabilidad ya expresable por un rol existente con un scope distinto.

Ejemplo: `organization_groupleader` es canónico porque representa liderazgo de un grupo y una estrategia ABAC reusable. “Director de 7B” es una relación `leads(7B)`; “Rector del Colegio X” es un alias/configuración local, no un rol.

### 15.3 Gate de implementación

No se permite crear el rol en Logto, agregarlo a un selector de UI ni asignarlo a usuarios de producción hasta que el issue/ADR que usa la plantilla tenga:

1. ID canónico, propósito y decisiones de no-acceso;
2. tabla RBAC de permisos potenciales;
3. Owner Ceilings, Tenant Activations y Bootstrap Profile definidos o explícitamente ausentes;
4. estrategia ABAC, atributos y comportamiento sin scope;
5. casos multirol sin privilege borrowing;
6. controles de provisioning Logto;
7. migraciones, auditoría, razón de denegación y pruebas completas.

Así, añadir roles se vuelve un flujo repetible y parametrizado: se completan datos de una plantilla; no se rediseña la arquitectura ni se conceden permisos implícitos.

## Normative amendment: Logto provisioning is identity input, not effective authorization

Default organization roles, email-domain provisioning, and Enterprise SSO/JIT provisioning may create or reconcile organization membership, assign approved canonical organization roles, and emit token role/scope claims. Those artifacts are only identity inputs and RBAC candidates. They never bypass deny-by-default and never create Owner Ceilings, Tenant Activations, or Data Scopes by themselves.

Every protected operation still evaluates the complete path: active catalog, valid Logto token/identity, canonical role RBAC potential, Owner Ceiling, Tenant Activation, and ABAC Data Scope over the resource. Missing any layer denies with an observable same-tenant reason code. Domain or SSO origin does not alter the result.

The initial organization wizard may use an explicitly selected Owner Bootstrap Profile for onboarding. The profile is finite and versioned: it can create the initial membership/role binding, materialize only listed Owner Ceilings, materialize only listed Tenant Activations, enable only listed scope templates, and audit `profileId`, catalog version, actor, wizard source, and policy version. New onboarding capabilities require a profile/catalog change; no Logto default role implicitly activates all admin permissions.

Provisioning controls are mandatory: JIT/domain mappings can only assign pre-approved canonical `organization_*` roles; they cannot assign `owner_global` or Owner privileges; domain/IdP bindings must be verified, tenant-scoped, and idempotent; external claims cannot inject permissions, action IDs, Owner Ceilings, Tenant Activations, or Data Scopes; membership/role provisioning changes audit and refresh authorization context; post-bootstrap default roles gain RBAC potential only, not extra activations.

Scope subject is `organizationId + membershipId + canonicalRoleId`. Each membership-role binding is evaluated as a complete path. Generic mutable role scopes and privilege/scope borrowing across roles or memberships are not supported.

### Implementation note: scope-template persistence

The Phase 2 implementation persists Owner scope templates in `owner_scope_templates` and tenant-local enablement/labels in `tenant_scope_configurations`. Data-scope assignment rows may reference `scope_template_id` and `scope_template_version`; the server validates assignments against the Owner-published immutable semantics before writing any target. Tenant labels remain presentation-only and cannot alter strategy, capability, role applicability, target kind, dimension keys or relationship keys.


### Canonical role: organization_groupleader

`organization_groupleader` is an Owner-governed canonical organization role for group leadership. Its Phase 2 RBAC potential is limited to approved LMS read capabilities (`lms.groups.read`, `lms.group_members.read` and `lms.course_offerings.read` in the active catalog); it does not receive `lms.grades.update`, `lms.grades.manage`, Owner permissions, wildcards or planned permissions. Its ABAC strategy is `group_leadership`, which only accepts tenant-scoped `leads` relationships to the relevant group/course/unit resource and denies closed when no valid `leads` relationship exists. Tenant aliases such as “Director de grupo” are presentation-only and never replace the canonical role ID.

### Implementation note: management-level virtual root

`managementLevel: "organization"` is reserved for the virtual, non-editable organization root in hierarchy projections. Persisted `organization_units` rows may only use `strategic`, `tactical`, `coordination`, `operational` or `administrative`; top-level persisted units have `parentUnitId = null` and are validated as children of the virtual root with order `0`. `levelOrder` is derived from the Owner catalog and returned as read-only metadata; clients never submit it.

### Implementation note: active operation requirements and planned capabilities

Active operation registry entries use one canonical `permission` and, when owner and tenant surfaces are alternatives for the same module, an explicit `permissionRequirement` object with `mode: "any" | "all"` and canonical permission IDs. Composite permission strings are forbidden because they hide whether each branch is active and catalogued. Planned operations remain unavailable until they have an active canonical permission, mounted server handler, durable adapter, contract test and frontend consumer; the frontend may display a pending/unavailable state but must not mount a real mutation or fetch for planned capabilities.

### Implementation note: fail-closed scope-template availability

Owner scope templates are not globally available by default. A data-scope assignment can reference a template only when the template is published, explicitly available for the organization, and backed by an enabled tenant scope configuration for the same `scopeTemplateId` and version. Missing template availability returns `scope_template_not_available_for_tenant`; missing tenant configuration returns `tenant_scope_configuration_missing`; disabled configuration returns `tenant_scope_configuration_disabled`; invalid target/role/relationship semantics return `scope_target_invalid`.

### Implementation note: bootstrap and provisioning runtime requirements

Bootstrap profile application requires a transaction port, data-scope service, audit runtime and idempotency key. The operation validates profile references before mutation, writes membership, Owner Ceiling, Tenant Activation and ABAC scopes inside one transaction, audits the result, and returns the prior result on an idempotent retry. JIT/domain provisioning validates exact canonical organization role IDs rather than prefixes, rejects Owner roles and unknown roles, and sanitizes external claims that try to inject permissions, actions, tenant IDs, ceilings, activations or data scopes.

### Canonical Group Leader capability (#128)

`organization_groupleader` is now a business LMS reader, not a surrogate for document access. Its active RBAC potential is limited to `lms.groups.read`, `lms.group_members.read` and `lms.course_offerings.read`; `lms.student_profiles.read` remains planned until a dedicated redaction endpoint exists. The role never receives grade mutation, Owner, wildcard, governance, ceiling, activation or scope-management permissions.

Effective access for each LMS Groups endpoint is the full Phase 2 path: token scope for the exact LMS permission, `organization_groupleader` RBAC potential, Owner Ceiling, Tenant Activation and the `group_leadership` ABAC strategy. `group_leadership` only accepts tenant-scoped `leads(groupId)` provenance. `manages`, `teaches`, simple membership, cross-tenant relationships and stale relationship rows fail closed and do not widen to organization-level access.

The supported endpoint contract is:

- `GET /o/:organizationId/lms/groups` with `lms.groups.read`, returning only groups visible through valid `leads` targets.
- `GET /o/:organizationId/lms/groups/:groupId` with `lms.groups.read`, asserting the requested tenant group is in the allowed target set and including course offerings only when `lms.course_offerings.read` also completes the full path.
- `GET /o/:organizationId/lms/groups/:groupId/members` with `lms.group_members.read`, asserting the requested tenant group is in the allowed target set before returning membership rows.

Audit records for these reads include actor, organization, target group, action, result, reason code, timestamp and contract version. Frontend LMS Groups views consume these server responses and reason codes; they do not evaluate role names, JWT claims or local scope derivations.

## Governance workspace operational topology (#129)

The organization Governance surface is an operational workspace under the selected organization, not a second organization overview. The only organization overview remains `/owner/organizations/:organizationId`; `/owner/organizations/:organizationId/governance` and `/o/:organizationId/settings/governance` route into task groups: Access policy (Role permissions, Role names, Scope assignments), Organization model (Structure and classification, Groups and courses, People segmentation), and Control and evidence (Access explorer, Audit log).

Every workspace item declares a route/action/permission/source-of-truth contract before it is rendered as an available task. Planned work, including People segmentation until its grammar/privacy contract is approved, must render an unavailable state and must not mount a fetch. The frontend consumes the screen/action registry and server decisions; it never derives access from a role name, JWT claim, hidden control, local tab state, or client graph layout.
