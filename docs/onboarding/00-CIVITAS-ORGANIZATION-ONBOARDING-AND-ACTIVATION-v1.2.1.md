# Arquitectura y especificación del onboarding y activación de organizaciones en Civitas

**Documento:** `CIVITAS-ORGANIZATION-ONBOARDING-AND-ACTIVATION`  
**Versión:** `1.2.1`  
**Estado:** contrato canónico reconciliado para foundation y descomposición; la implementación productiva depende de los gates de repositorio  
**Repositorio objetivo:** `didaxus/civitas10`  
**Superficie principal:** Civitas Core Manager para Owner y Organization Portal host-local para configuración delegada  
**Autoridad canónica:** Civitas para onboarding, gobierno y autorización; Logto para identidad, autenticación, organizaciones, memberships, sesiones y emisión de tokens  

---

## Control de cambios

### Versión 1.2.1

Esta versión reconcilia los bloqueadores P0 y hallazgos P1 de la auditoría UX de navegación:

1. congela breadcrumbs distintos para Core Manager y Organization Portal;
2. define rutas parent, resume y exit por tipo de pantalla y actor;
3. amplía `OnboardingRouteRegistry` con steps, sections, findings, shortcuts y breadcrumb segments;
4. establece navegación interna route-backed para todos los pasos complejos;
5. congela `/owner/organization-onboardings` como índice principal Owner y enlaza el detalle organizacional al mismo aggregate;
6. define cómo `not_applicable` afecta el contador sin ocultar los ocho pasos canónicos;
7. define el comportamiento al abrir steps `active`, `conditional`, `blocked`, `complete` y `not_applicable`;
8. enlaza navegación y acciones con una matriz actor + estado + capacidad;
9. hace que los CTA de blockers sean role-aware y nunca conduzcan a una acción forbidden;
10. diferencia autosave, guardar borrador, continuar y guardar y salir;
11. congela destinos de salida por superficie;
12. subdivide visualmente el paso Organización y portal;
13. prioriza una acción principal actor-aware en el receipt;
14. establece español como idioma visible predeterminado y conserva acrónimos técnicos con explicación;
15. amplía el Document Consistency Checker para validar estas decisiones sin confundirlas con implementación del repositorio.

### Versión 1.2.0

Esta versión reconcilia el contrato documental con Tenant Resolution, el flujo funcional existente y la auditoría de repositorio:

1. actualiza el repositorio objetivo a `didaxus/civitas10`;
2. conserva `runCanonicalOrganizationProvisioning()` como implementación reutilizable del bootstrap mínimo, no como onboarding completo;
3. exige crear el aggregate `OrganizationOnboarding` antes del bootstrap y vincular toda ejecución a `onboardingId`, versión y ETag;
4. sustituye `appSubdomain + appBaseDomain` como autoridad por `tenantSlug + OrganizationHostname` del contrato Tenant Resolution;
5. congela `organizationId` como ID interno Civitas y `logtoOrganizationId` como referencia externa;
6. separa las rutas visibles Owner y Organization Portal, retirando `organizationId` de la URL pública tenant;
7. define `OnboardingRouteRegistry` como única fuente de pasos, rutas, labels, breadcrumbs, parent routes, permisos y aplicabilidad;
8. congela navegación de salida, guardado y cierre, deep links, manejo de cambios sin guardar y recuperación de errores;
9. distingue `hidden`, `disabled`, `forbidden` y `planned` para navegación y acciones;
10. incorpora indicador visible de actor, workspace, estado operativo, etapa y modo de edición;
11. separa Document Consistency Checker de Repository Compliance Checker;
12. mantiene la consistencia documental como `PASS`, pero registra la implementación del repositorio como `NOT_IMPLEMENTED` hasta superar sus gates;
13. elimina del contrato base las métricas comerciales específicas de otros módulos;
14. declara que Teacher, Student y Parent no participan en onboarding y reciben acceso desde contratos operativos posteriores.

### Versión 1.1.0

Esta versión resuelve once contradicciones bloqueantes y cuatro derivas contractuales detectadas entre el contrato canónico y los perfiles backend/UI:

1. separa definitivamente bootstrap y activación;
2. congela ocho pasos visibles sin confundirlos con entidades, secciones de dominio, validaciones o comandos;
3. incorpora `TeachingAssignment` como entidad contractual explícita cuando los role paths académicos la requieren;
4. define readiness multidimensional: seguridad, comercial, operacional y resultado global derivado;
5. elimina cualquier silla global facturable y congela billing exclusivamente por módulo;
6. separa entitlement, instalación, configuración y activación de módulos;
7. separa el estado del onboarding, el estado operativo de la organización y la publicación del portal;
8. normaliza colaboradores como asignaciones idempotentes por `subjectId`;
9. congela la autoridad de memberships: materialización en Logto, desired state y provenance en Civitas;
10. separa aprobación humana de la ejecución del activation run;
11. reserva `activation-plans` para el onboarding y `reconciliation-plans` para subsistemas;
12. publica un único aggregate DTO canónico;
13. normaliza los nombres de tablas;
14. establece la precedencia documental;
15. distingue los IDs internos de Civitas de los IDs externos de Logto.

### Versión 1.0.0

Definió el onboarding en dos etapas, el bootstrap mínimo contra Logto, la configuración colaborativa, la aprobación humana, Identity Federation, SCIM, gobierno, Data Scope y la exclusión del runtime LMS del onboarding base.

# 0. Autoridad normativa y relación con otros contratos

## 0.1 Propósito

Este documento define el onboarding base mediante el cual Civitas:

```text
crea
→ replica
→ configura
→ valida
→ gobierna
→ aprueba
→ publica
```

una organización cliente.

El onboarding termina cuando la organización puede operar con identidad, gobierno, portal y módulos autorizados. No termina simplemente porque exista una organización en Logto.

## 0.2 Documentos y contratos relacionados

Este contrato se mantiene consistente con:

```text
#154  Organization Identity Federation
#217  Claims mínimas y membership-bound role paths
#218  Dimensiones canónicas de ABAC/Data Scope

CIVITAS Tenant Resolution
  → hostname registry, tenantSlug, OrganizationHostname, portal namespace,
    BFF host-local, sesión y TenantContext

CIVITAS Organization Branding
  → perfil visual y publicación de branding

civitas-lms-module-runtime-contract.md
civitas-moodle-runtime-adapter.md
CIVITAS-CONTROL-PLANE-AND-ORGANIZATION-PORTALS.md
```

Perfiles derivados de este contrato:

```text
CIVITAS_ARCHITECTURE_REVIEW_ONBOARDING_BACKEND-v1.2.1.docx
CIVITAS_ARCHITECTURE_REVIEW_ONBOARDING_UI-v1.2.1.docx
```

Gates y auditorías:

```text
CIVITAS_ONBOARDING_CONSISTENCY_CHECK-v1.2.1.md
CIVITAS_ONBOARDING_REPOSITORY_COMPLIANCE-v1.2.1.md
CIVITAS_ONBOARDING_AUDIT_RECONCILIATION-v1.2.1.md
```

Los perfiles derivados pueden añadir diseño técnico o visual, pero no redefinen estados, rutas, IDs, step keys, modelos comerciales, autoridad de memberships, lifecycle de módulos ni Tenant Resolution.

## 0.3 Precedencia

En caso de conflicto, la jerarquía es:

1. Tenant Resolution define `tenantSlug`, `OrganizationHostname`, namespace del portal, resolución por hostname, BFF, sesión host-only y rutas públicas tenant;
2. los contratos canónicos de autorización e Identity Federation definen sus bounded contexts;
3. este documento define aggregate, lifecycle, pasos visibles, readiness, bootstrap, activation plans, aprobación y ejecución del onboarding;
4. los contratos canónicos de módulos definen instalación y operación posterior;
5. los perfiles backend y UI son guías derivadas;
6. auditorías y checkers identifican divergencias, pero no redefinen el contrato sin una reconciliación versionada;
7. adapters y runtimes nunca redefinen el onboarding base.

El Markdown `CIVITAS-ORGANIZATION-ONBOARDING-AND-ACTIVATION` es la única fuente normativa del onboarding. Los DOCX deben declarar expresamente su condición de perfiles derivados.

Se ejecutan dos verificaciones distintas:

```text
Document Consistency Checker
→ contrato ↔ perfil backend ↔ perfil UI

Repository Compliance Checker
→ contrato ↔ rutas ↔ APIs ↔ migraciones ↔ autorización ↔ frontend ↔ tests
```

Un `PASS` documental no implica que el repositorio ya implemente el contrato.

## 0.4 Regla de no duplicación

El onboarding orquesta recursos canónicos existentes. No debe crear copias paralelas de:

- conexiones de identidad;
- conexiones SCIM;
- roles;
- permisos;
- Owner Ceilings;
- Tenant Activations;
- taxonomías;
- Data Scope assignments;
- módulos;
- memberships;
- usuarios.

Mantiene referencias, snapshots aprobados, resultados de validación y evidencia de activación.

---

# 1. Decisión arquitectónica

## 1.1 Resultado esperado

El onboarding base debe producir, según las políticas aplicables a la organización:

```text
Organización creada en Logto
+ organización operacional referenciada en Civitas
+ `OrganizationHostname` reservado y posteriormente publicado o restringido mediante Tenant Resolution
+ administradores iniciales activos
+ conexiones de identidad configuradas y validadas cuando apliquen
+ lifecycle de usuarios y grupos operativo según la política seleccionada
+ roles canónicos, ceilings, activations, PBAC y Data Scope vigentes
+ estructura organizacional y académica mínima válida cuando sea requerida
+ teaching assignments válidos cuando existan role paths académicos
+ activation plan sin blockers
+ aprobación humana explícita del Owner
+ entitlements de módulos aprobados
+ instalaciones de módulos en el estado que corresponda
```

No se exige sincronización completa de usuarios, grupos o teaching assignments cuando la política de provisioning o el tipo de organización no los requiera.

## 1.2 Exclusión expresa del runtime LMS

El onboarding base puede mostrar el módulo LMS como una capacidad contractual que el Owner puede aprobar o habilitar.

No realiza:

```text
selección de Moodle
configuración de Moodle
creación de categorías Moodle
creación de cohortes Moodle
creación de cursos Moodle
creación de grupos Moodle
configuración de actividades
configuración del gradebook
binding de un runtime LMS
reconciliación con Moodle
```

La secuencia correcta es:

```text
Onboarding base de organización
        ↓
Organización active o restricted_active
        ↓
Instalación del módulo LMS
        ↓
Binding de capacidades LMS
        ↓
Selección del runtime
        ↓
Adapter y runtime específicos
```

## 1.3 Dos etapas obligatorias

El onboarding se divide en:

```text
ETAPA 1 — Bootstrap institucional
Responsable obligatorio: Owner autorizado

ETAPA 2 — Configuración, gobierno y activación
Responsables de configuración: Owner, consultor delegado u organization_admin
Responsable de aprobación/publicación: Owner autorizado
```

No se fusionan en una sola operación irreversible.

---

# 2. Principios obligatorios

## 2.1 Logto-first para identidad; Civitas-first para gobierno

```text
Logto
= identidad, autenticación, organización, membership, sesión y token

Civitas
= onboarding, estado operativo, autorización de negocio,
  gobierno, estructura, módulos, aprobación y publicación
```

## 2.2 El estado `configuration` es de Civitas

La organización puede existir en Logto durante la configuración. Sin embargo, este documento no asume que Logto tenga un estado nativo equivalente a `configuration` o `disabled organization`.

El bloqueo operativo se implementa mediante:

- estado canónico del onboarding en Civitas;
- estado operativo de la organización en Civitas;
- memberships mínimas;
- roles mínimos de implementación;
- gateway de entrada del portal;
- políticas de autorización;
- ausencia de publicación general;
- restricción de acceso a actores de implementación.

## 2.3 Fail closed

Cuando Civitas no puede probar de forma suficiente:

- identidad;
- membership;
- ownership tenant;
- versión del contrato;
- ceiling;
- activation;
- Data Scope;
- integridad del plan;

la operación se deniega o queda bloqueada. Nunca se interpreta una ausencia como autorización.

## 2.4 Configuración persistente

El onboarding no es una sesión temporal del navegador.

Debe soportar:

- autosave;
- pausa por días o semanas;
- acceso desde otro dispositivo;
- handoff entre actores;
- versionamiento;
- concurrencia optimista;
- historial por sección;
- comentarios y solicitudes de cambio;
- evidencias por validación;
- comparación de versiones.

## 2.5 Aprobación humana obligatoria

La organización no se autoactiva.

Toda publicación requiere una decisión explícita del Owner con:

- reautenticación;
- motivo;
- versión aprobada;
- hash del plan;
- actor;
- fecha;
- evidencia;
- idempotency key.

## 2.6 El onboarding no sustituye Governance

```text
Onboarding
= configuración inicial y activación

Governance
= administración permanente posterior
```

Al finalizar, cada área debe enlazar a su superficie permanente.

---

# 3. Vocabulario normativo

## 3.1 Onboarding

Aggregate persistente que representa el proceso completo de bootstrap, configuración, revisión y activación.

## 3.2 Bootstrap institucional

Primera etapa, ejecutada por el Owner, que crea la organización canónica mínima, el registro local y los administradores necesarios para continuar.

## 3.3 Configuración complementaria

Segunda etapa en la que se completan identidad, aprovisionamiento, mappings, gobierno, estructura, branding, módulos y validaciones.

## 3.4 Organización publicada

Organización cuyo entry point está disponible para las poblaciones autorizadas y cuyo estado operativo es `active` o `restricted_active`.

## 3.5 Readiness

Contrato multidimensional que evalúa si es seguro, comercialmente válido y operacionalmente posible activar:

```text
security readiness
commercial readiness
operational readiness
overall readiness derivado
```

No equivale al porcentaje de campos completados.

## 3.6 Completeness

Porcentaje de configuración aplicable completada. Puede ser inferior al 100 % y aun así estar lista.

## 3.7 Membership efectiva

Membership real de organización materializada en Logto y referenciada por `organization_membership_id`. Civitas mantiene desired state, mapping, provenance y verificación, pero no fabrica una segunda identidad de membership.

## 3.8 Entitlement, billing policy y usage ledger

```text
Module subscription
→ Module entitlement
→ Module-specific billing policy
→ Module usage ledger
```

No existe una silla global facturable. `organization.active_membership_count` puede existir como métrica técnica no facturable.

## 3.9 Fuente autoritativa

Sistema autorizado para producir un atributo o evento concreto. No existe una precedencia global de “último dato gana”.

## 3.10 Mapping

Regla gobernada que transforma evidencia externa en candidatos canónicos. Un mapping no concede acceso por sí mismo.

## 3.11 Data Scope

Restricción de recursos y contexto evaluada en Civitas. No es rol, permiso ni OAuth scope.

## 3.12 Módulo aprobado

Entitlement concedido por el Owner para que una organización configure un módulo. No implica que la instalación, capacidades, adapter o runtime estén activos.

## 3.13 Teaching assignment

Relación canónica de Civitas que vincula una membership docente con periodo, materia, curso, cohorte, clase, campus o jornada. Produce evidencia para Data Scope cuando el role path académico lo requiere.

## 3.14 Activation plan

Plan inmutable del onboarding base. No debe llamarse reconciliation plan. Los reconciliation plans pertenecen a subsistemas como Identity Federation, SCIM, Data Scope, módulos o runtimes.

## 3.15 Aprobación y activation run

La aprobación autoriza una versión, un plan y un objetivo operativo. El activation run ejecuta posteriormente el plan aprobado. Son recursos y acciones diferentes.

# 4. Fronteras de autoridad

| Concepto | Autoridad o responsabilidad canónica |
|---|---|
| Evidencia externa de pertenencia | SCIM, IdP, SIS o fuente aprobada |
| Organización de identidad | Logto |
| Membership materializada | Logto |
| `organization_membership_id` | ID real y verificable de la membership Logto |
| Desired state, mapping y provenance de membership | Civitas |
| Decisión efectiva de acceso | Civitas |
| Sesiones, MFA y tokens | Logto |
| Estado de onboarding | Civitas |
| Estado operativo de organización | Civitas |
| Perfil y publicación de onboarding | Civitas |
| Hostname, tenantSlug, portal namespace y redirects | Tenant Resolution |
| Branding organizacional | Contrato Organization Branding |
| Catálogo de permisos y role potential | Civitas |
| Owner Ceiling y Tenant Activation | Civitas |
| PBAC y ABAC/Data Scope | Civitas |
| Teaching assignments | Civitas Academic Structure |
| Claims materializadas mínimas | Logto, derivadas del contrato gobernado |
| Normalización y reconciliación | Civitas |
| Module subscriptions y entitlements | Civitas Modules/Commercial |
| Billing policy y usage ledger | Civitas Commercial, por módulo |
| Runtime externo | Ejecución especializada; nunca autoridad del tenant |

## 4.1 Identificadores canónicos

```text
organizationId
= ID interno estable de Civitas para rutas centrales, relaciones y ownership tenant

logtoOrganizationId
= referencia externa única de la organización materializada en Logto

onboardingId
= identidad estable del aggregate desde antes del bootstrap

tenantSlug
= slug reservado por Tenant Resolution; no es organizationId

hostnameId
= ID del OrganizationHostname autoritativo

membershipId / organization_membership_id
= ID real de membership Logto; Civitas solo lo referencia y verifica
```

Los IDs internos y externos no son intercambiables. Las APIs centrales de Civitas pueden conservar `organizationId`; el Organization Portal no lo expone en su URL visible ni permite que JavaScript seleccione el tenant.

El onboarding debe persistir `organizationId`, `logtoOrganizationId`, `tenantSlug` y `hostnameId` como campos distintos con constraints explícitos.

# 5. Modelo de dos etapas

## 5.1 Etapa 1 — Bootstrap institucional controlado por Owner

### Objetivo

Crear la mínima superficie segura que permita a los administradores autorizados entrar y completar el onboarding.

### Actor

Solo:

- `owner_global` con permisos canónicos correspondientes;
- consultor interno con delegación explícita para bootstrap, sin capacidad de aprobación final si no posee el permiso Owner.

### Flujo

```text
Draft local Civitas
→ validación mínima institucional
→ reserva de `tenantSlug` y `OrganizationHostname` mediante Tenant Resolution
→ creación de organización en Logto
→ creación/conciliación de administradores mínimos
→ membership en la organización Logto
→ asignación de rol organizacional inicial permitido
→ persistencia de perfil/bootstrap en Civitas
→ portal de configuración accesible
→ handoff opcional al organization_admin
```

### Resultado

```text
organizationOnboarding.status = configuring
organization.operationalStatus = configuration
logtoOrganizationId != null
entryPoint.publicationStatus = unpublished o restricted
bootstrapAdmins >= 1
```

La organización todavía no está abierta para profesores, estudiantes, padres ni usuarios operativos generales.

## 5.2 Compatibilidad con el comportamiento actual

La etapa 1 conserva la capacidad funcional existente:

- recopilar datos institucionales, contactos, business profile y segmentación inicial;
- crear la organización real en Logto;
- guardar `logtoOrganizationId`;
- resolver o crear administradores iniciales;
- crear memberships y asignar roles iniciales permitidos;
- conservar idempotencia y trazabilidad operacional.

La implementación actual se encapsula así:

```text
OrganizationBootstrapPlanner
→ OrganizationBootstrapRunner
   → runCanonicalOrganizationProvisioning()
```

```text
runCanonicalOrganizationProvisioning()
≠ onboarding completo

runCanonicalOrganizationProvisioning()
= implementación reutilizable del bootstrap mínimo
```

Antes de ejecutar esa lógica debe existir un aggregate persistente:

```text
onboardingId estable
+ version
+ ETag
+ currentVisibleStep
+ bootstrap plan/run
```

### Payload mínimo normativo

```text
name
tenantSlug
adminDomain
administrativeContacts (mínimo uno válido)
jitProvisioning.defaultRoleNames
```

El contrato puede conservar también:

```text
description
business
contact
segmentation
```

`appSubdomain` y `appBaseDomain` pueden aceptarse temporalmente como inputs de compatibilidad de UI, pero el backend debe transformarlos inmediatamente en:

```text
tenantSlug
→ OrganizationHostname reserved
→ hostnameId
```

No se persisten ni se usan como autoridad canónica.

### Regla de administrador mínimo


Debe existir al menos un administrador inicial que:

- tenga identidad resoluble;
- tenga membership válida en la organización;
- posea un rol canónico de superficie organizacional;
- no reciba `owner_global`;
- no exceda el Owner Ceiling;
- pueda acceder al portal de configuración.

## 5.3 Etapa 2 — Configuración complementaria y aprobación

### Actores configuradores

- Owner;
- consultor de implementación con permisos delegados;
- `organization_admin` invitado o creado en la etapa 1.

### Acciones

- completar perfil y branding;
- configurar una o varias conexiones de identidad;
- validar OIDC/SAML;
- configurar SCIM/JIT/API/native provisioning;
- definir fuentes autoritativas;
- mapear atributos y grupos;
- proponer roles;
- construir estructura canónica;
- asignar scope templates y Data Scope;
- revisar entitlements, límites y proyecciones de uso por módulo;
- aprobar módulos permitidos;
- ejecutar dry-runs;
- resolver conflictos;
- solicitar revisión.

### Acciones exclusivas del Owner

- cambiar Owner Ceiling;
- aprobar roles privilegiados;
- aceptar excepciones operativas permitidas;
- aprobar módulos;
- aprobar el target `restricted_active` o `active`;
- publicar la organización;
- rechazar o cancelar el onboarding.

## 5.4 Handoff

El Owner puede entregar la configuración al administrador institucional mediante:

```text
onboarding invitation
+ onboardingId
+ organizationId
+ permisos por sección
+ fecha de expiración
+ actor delegante
+ alcance delegado
```

El handoff no transfiere la capacidad de aprobación final.

---

# 6. Actores y permisos

| Acción | Owner | Consultor delegado | Organization Admin |
|---|---:|---:|---:|
| Crear onboarding | Sí | Según delegación | No, salvo invitación específica |
| Ejecutar bootstrap Logto | Sí | Según delegación | No |
| Completar datos institucionales | Sí | Sí | Sí |
| Editar branding | Sí | Sí | Sí, dentro de límites |
| Configurar IdP | Sí | Sí | Sí |
| Probar login | Sí | Sí | Sí |
| Configurar SCIM | Sí | Sí | Sí |
| Proponer mappings | Sí | Sí | Sí |
| Crear valores de estructura permitidos | Sí | Sí | Sí |
| Cambiar Owner Ceiling | Sí | No | No |
| Activar permisos tenant | Sí | Según permiso | Sí, solo dentro del ceiling y sujeto a aprobación |
| Aprobar roles privilegiados | Sí | No | No |
| Aprobar módulos | Sí | No | No |
| Solicitar revisión | Sí | Sí | Sí |
| Aprobar organización | Sí | No | No |
| Publicar | Sí | No | No |
| Rechazar | Sí | No | No |

## 6.1 Permisos canónicos propuestos

Los nombres definitivos deben integrarse en el catálogo canónico; no se hardcodean como autorización paralela. El dominio funcional requiere al menos capacidades equivalentes a:

```text
owner.organization_onboarding.create
owner.organization_onboarding.read
owner.organization_onboarding.update
owner.organization_onboarding.assign
owner.organization_onboarding.review
owner.organization_onboarding.approve
owner.organization_onboarding.activate
owner.organization_onboarding.reject

org.organization_onboarding.read
org.organization_onboarding.update
org.organization_onboarding.request_review

org.identity.connections.manage
org.identity.provisioning.manage
org.identity.mappings.manage
org.structure.manage
org.data_scope.manage
```

La denominación final debe pasar por el registry de permisos de Civitas.

---

# 7. Máquinas de estado separadas

## 7.1 Estado del onboarding

```text
draft
→ bootstrap_validating
→ bootstrap_queued
→ bootstrap_running
→ configuring
→ ready_for_review
→ changes_requested
→ ready_for_review
→ approved
→ activation_queued
→ activating
→ verifying
→ completed
```

Estados alternos:

```text
blocked
failed
rejected
cancelled
rollback_required
```

`completed` significa que el activation run terminó y produjo un resultado operativo. El onboarding no utiliza `active`, `restricted_active`, `degraded`, `suspended` ni `archived` como estados propios.

## 7.2 Estado operativo de la organización

```text
configuration
restricted_active
active
degraded
suspended
archived
```

### `configuration`

Acceso limitado a Owner, consultores autorizados y administradores de implementación.

### `restricted_active`

Acceso limitado a Owner, consultores autorizados y administradores institucionales aprobados. Profesores, estudiantes, padres y población operativa permanecen bloqueados.

### `active`

Acceso disponible según membership Logto, roles, políticas, Data Scope, entitlements y estado de cada módulo.

### `degraded`

La organización estaba operativa y presenta una falla posterior. No representa onboarding incompleto.

## 7.3 Estado de publicación del portal

```text
reserved
unpublished
restricted
published
suspended
```

## 7.4 Estado de revisión

```text
not_requested
review_requested
in_review
changes_requested
approved
rejected
```

## 7.5 Invariantes

- `restricted_active` y `active` requieren aprobación Owner y activation run exitoso.
- `published` requiere un estado operativo compatible.
- una versión aprobada es inmutable;
- cualquier cambio crítico vuelve stale el activation plan y la aprobación;
- `organizationId` y `logtoOrganizationId` deben estar vinculados antes de delegar la etapa 2;
- el activation result guarda el estado operativo alcanzado, pero no sustituye `onboarding.status = completed`.

# 8. Wizard definitivo

## 8.0 Paso visible, sección de dominio y comando no son equivalentes

```text
visibleStep ≠ domainSection ≠ validationGroup ≠ backendCommand
```

El stepper conserva ocho pasos visibles para la experiencia. Las entidades y comandos internos mantienen sus contratos propios aunque aparezcan dentro de un mismo paso.

## 8.1 `organization_portal` — Organización y portal

Incluye perfil legal y comercial, identificación, país, zona horaria, idioma, contactos, subdominio, dominio institucional, branding y preview. Produce el organization draft, entry point reservado, branding draft y domain claims.

## 8.2 `initial_administrators` — Administradores y gobierno inicial

Incluye administrador principal y secundarios, roles canónicos iniciales, invitaciones, expiración y responsable de implementación. Refleja el bootstrap y evita duplicar identidades.

## 8.3 `access_methods` — Métodos de acceso

Incluye múltiples conexiones OIDC/SAML y acceso administrado por Logto, con dominios, poblaciones, prioridad, lifecycle, test login y claims inspection redactada.

## 8.4 `provisioning_lifecycle` — Aprovisionamiento y ciclo de vida

Incluye SCIM, JIT, API o administración nativa; fuentes autoritativas; alta, actualización, suspensión, delete, gracia, provenance y reglas para datos incompletos.

## 8.5 `identity_structure_mapping` — Identidad, estructura y asignaciones

Subsecciones contractuales:

```text
attribute_mappings
group_mappings
role_candidates
taxonomy_structure
academic_periods
teaching_assignments
```

### Atributos

Cada mapping define fuente, atributo externo, campo canónico, transformación, validación, prioridad, conflicto, provenance, versión y estado.

### Grupos y roles

```text
external group
→ canonical role candidate
→ Owner Ceiling
→ Tenant Activation
→ scope template
```

Nunca `external group → permiso directo`.

### Estructura

Usa exclusivamente las dimensiones canónicas de #218 y valores tenant-bound.

### Teaching assignments

Se configuran cuando una organización tiene role paths académicos que requieren vincular docentes con periodos, subjects, courses, cohorts o classes. Siguen siendo entidades explícitas aunque no tengan un paso independiente.

## 8.6 `authorization_simulation` — Autorización y Access Preview

Subsecciones:

```text
role_candidates
owner_ceilings
tenant_activations
pbac
data_scope
access_preview
```

El preview muestra cada gate y reason code. La presentación nunca decide autorización.

## 8.7 `dry_run_review` — Plan, proyecciones y revisión

Subsecciones:

```text
identity_reconciliation_summary
authorization_projection
module_entitlements
module_usage_projection
commercial_readiness
activation_plan
activation_plan_diff
```

El plan del onboarding se denomina `activation plan`. Los planes de reconciliación internos de Identity, SCIM, Data Scope o módulos se referencian como inputs, pero no sustituyen el activation plan.

## 8.8 `approval_publication` — Aprobación, ejecución y entrega

Organization Admin puede solicitar revisión, comentar, corregir y generar un plan nuevo.

Owner puede:

```text
approve
request_changes
reject
```

Una aprobación `approve` incluye:

```text
approvedTarget = restricted_active | active
planId
planHash
onboardingVersion
reason
reauthenticationEvidenceRef
```

Después, `POST /activation-runs` ejecuta exactamente el plan aprobado. La UI distingue claramente “Aprobar plan” de “Ejecutar activación”.

# 9. Completitud y readiness

## 9.1 Contrato canónico

```ts
type OrganizationOnboardingReadiness = {
  completenessPercent: number;
  security: "blocked" | "warning" | "ready";
  commercial: "blocked" | "warning" | "ready";
  operational: "blocked" | "warning" | "ready";
  overall: "blocked" | "warning" | "ready";
};
```

`overall` es derivado y no editable.

## 9.2 Configuration completeness

Indica cuánto de la configuración aplicable está diligenciada. Puede ser inferior al 100 % y estar lista.

## 9.3 Security readiness

Evalúa identidad, membership, tenant ownership, roles, ceilings, activations, PBAC, Data Scope, plan integrity y secretos.

## 9.4 Commercial readiness

Evalúa module subscriptions, entitlements, billing policies, límites y proyecciones por módulo.

## 9.5 Operational readiness

Evalúa workers, credenciales, validaciones, publication probes, observed state y capacidad de ejecutar el plan.

## 9.6 Overrides

El Owner puede aceptar warnings permitidos. No puede ignorar cross-tenant, identidad ambigua, membership no verificable, rol fuera del ceiling, contrato incompatible, operación destructiva con datos incompletos, secreto expuesto, dominio en conflicto o Data Scope de otra organización.

# 10. Conexiones de identidad múltiples

## 10.1 Modelo

```ts
type OrganizationIdentityConnection = {
  id: string;
  organizationId: string;
  protocol: "oidc" | "saml" | "managed";
  providerKind: string;
  status:
    | "draft"
    | "validating"
    | "ready"
    | "active"
    | "degraded"
    | "suspended"
    | "archived";
  allowedDomains: string[];
  populationSelectors: string[];
  priority: number;
  secretReference: string | null;
  configurationFingerprint: string;
  claimContractVersion: string;
  mappingVersion: number;
};
```

## 10.2 Regla de selección

La selección debe ser determinista, auditable y versionada.

No se permite:

- seleccionar por orden accidental de base de datos;
- usar correo como único identificador inmutable;
- fallback silencioso a una conexión distinta;
- utilizar una conexión `degraded` para acciones destructivas.

## 10.3 Test login

Cada conexión requiere sesiones de prueba con:

- nonce;
- expiración;
- usuario de prueba autorizado;
- claims redactadas;
- resultado de issuer/audience/signature;
- resultado de routing;
- resultado de mapping;
- evidencia sin secretos.

---

# 11. Aprovisionamiento, SCIM y ciclo de vida

## 11.1 Separación de conceptos y autoridad

```text
Evidencia externa
= SCIM, IdP, SIS o fuente aprobada

Desired membership state
= Civitas

Membership materializada
= Logto

Mapping y provenance
= Civitas

Decisión efectiva
= Civitas

Uso facturable
= module usage ledger de Civitas
```

SCIM no es membership canónica, autorización ni facturación.

## 11.2 Eventos de entrada

```text
user.created
user.updated
user.activated
user.suspended
user.deleted
group.created
group.updated
group.membership.added
group.membership.removed
```

## 11.3 Transformación

```text
external event
→ normalization
→ identity correlation
→ desired membership
→ mapping evaluation
→ authorization constraints
→ reconciliation plan
→ approval/policy
→ apply
→ module usage event cuando una billing policy lo requiera
```

## 11.4 Datos incompletos

Si la fuente indica overage, partial result, paging incompleto o claims faltantes:

- no se ejecutan removals destructivos;
- se conserva el valor vigente;
- se genera bloqueo o warning según impacto;
- se solicita una fuente completa o revisión.

## 11.5 Credenciales SCIM

- se generan en backend;
- se muestran una vez;
- se almacenan mediante `secretsRef`;
- nunca se generan con `Math.random()`;
- se rotan con idempotencia;
- se auditan;
- tienen scope mínimo.

---

# 12. Correlación de identidades

## 12.1 Orden de correlación

```text
immutable external subject / externalId
→ verified email como evidencia secundaria
→ resolución manual gobernada
```

El correo no debe ser la clave primaria única.

## 12.2 Multi-organización

Una persona global puede tener memberships en varias organizaciones.

Cada membership:

- tiene identificador propio;
- pertenece a un `organizationId`;
- se valida contra `sub`;
- tiene roles y provenance propios;
- no presta scopes a otra membership.

## 12.3 Duplicados

Cuando una identidad externa coincide parcialmente con una persona existente:

- no se fusiona automáticamente si falta evidencia inmutable;
- se crea un conflicto;
- se conserva el estado vigente;
- se requiere resolución explícita;
- se registra evidencia.

---

# 13. Política de fuentes y conflictos

## 13.1 No existe “último dato gana” global

Cada atributo y población tiene una política versionada.

Ejemplo:

| Dato | Fuente autoritativa configurable |
|---|---|
| Email institucional | IdP o SCIM principal |
| Nombre legal | Fuente institucional definida |
| Cargo | Fuente de RR. HH. o SCIM |
| Campus | SIS o directorio académico aprobado |
| Rol Civitas | Mapping gobernado en Civitas |
| Data Scope | Civitas |
| Membership | Civitas, derivada de fuente aprobada |

## 13.2 Conflicto confirmado

Cuando dos fuentes difieren:

```text
generar conflicto
→ conservar valor vigente
→ bloquear cambios sensibles
→ requerir resolución o regla explícita
```

## 13.3 Modelo

```ts
type AttributeAuthorityPolicy = {
  organizationId: string;
  canonicalField: string;
  populationKey: string | null;
  primarySourceId: string;
  fallbackSourceIds: string[];
  conflictMode: "block" | "warn" | "manual_review";
  version: number;
};
```

## 13.4 Prohibiciones

- merge silencioso;
- prioridad implícita;
- precedencia por timestamp sin contrato;
- overwrite de datos sensibles desde fuente secundaria;
- resolución cross-tenant.

---

# 14. Módulos, entitlements y modelo comercial

## 14.1 No existe una silla global facturable

`organization.active_membership_count` puede existir como métrica operacional. No produce cargo en la versión inicial del modelo comercial.

## 14.2 Cadena comercial canónica

```text
organization_module_subscription
→ module_entitlement
→ module_billing_policy
→ module_usage_ledger
```

## 14.3 Métricas congeladas inicialmente

```text
planning.author_teacher
planning.additional_course
```

Roles administrativos, de soporte y cuentas técnicas no consumen silla por defecto.

## 14.4 Reglas

- SCIM no factura objetos directamente.
- La membership y el entitlement pueden generar eventos que el billing policy interpreta.
- Cada evento de ledger incluye `moduleId`, `dimensionKey`, sujeto, cantidad, provenance, policy version y periodo.
- Los límites, periodos de gracia y overage son políticas versionadas por módulo.
- Un overage requiere el tratamiento definido por el contrato del módulo y la política comercial.

## 14.5 Modelo

```ts
type ModuleUsageLedgerEntry = {
  id: string;
  organizationId: string;
  moduleId: string;
  dimensionKey:
    | "planning.author_teacher"
    | "planning.additional_course"
    | string;
  subjectRef: string;
  quantity: number;
  billingPolicyVersion: string;
  provenance: string;
  effectiveAt: string;
};
```

# 15. Roles, ceilings, activations, PBAC y ABAC

## 15.1 Pipeline obligatorio

```text
external evidence
→ normalized identity
→ mapping candidate
→ canonical role candidate
→ Owner Ceiling
→ Tenant Activation
→ PBAC
→ scope template
→ Data Scope assignment
→ resource validation
→ effective decision
```

## 15.2 Roles canónicos

El onboarding consume el catálogo canónico vigente. No inventa roles en la UI.

Los roles institucionales personalizados, cuando se permitan, deben ser agrupaciones gobernadas de permisos canónicos dentro del Owner Ceiling.

## 15.3 Claims mínimas

El token aporta únicamente el contexto mínimo congelado por el contrato de autorización:

```text
organization_id
organization_membership_id
organization_role_ids
authz_contract_version
scope OIDC/Logto aplicable
```

ABAC, relaciones y recursos permanecen en Civitas.

## 15.4 Dimensiones canónicas

```text
academic.section
academic.subject
academic.course
academic.cohort
academic.class
organization.campus
organization.shift
organization.department
administration.function
```

`academic.grade_level` no se utiliza ni se mantiene como alias.

## 15.5 El scope no crea estructura

```text
taxonomy dimensions
+ taxonomy values
+ organization units
+ relationships
+ memberships
= estructura

Data Scope assignment
= referencia autorizada a esa estructura
```

---

# 16. Estructura organizacional y académica inicial

## 16.1 Alcance

El onboarding crea o importa la estructura mínima requerida para identidad, autorización, segmentación, delegación, Data Scope y módulos posteriores.

Incluye cuando aplique:

```text
academic periods
academic.section
academic.subject
academic.course
academic.cohort
academic.class
organization.campus
organization.shift
organization.department
administration.function
teaching assignments
```

## 16.2 TeachingAssignment

```ts
type TeachingAssignment = {
  id: string;
  organizationId: string;
  teacherMembershipId: string;
  academicPeriodId: string;
  campusId?: string;
  shiftId?: string;
  subjectId: string;
  courseId: string;
  cohortId?: string;
  classId?: string;
  assignmentRole: "lead_teacher" | "co_teacher" | "substitute" | "reviewer";
  validFrom: string;
  validUntil?: string;
  status: "draft" | "active" | "suspended" | "expired";
  source: "onboarding" | "scim" | "sis" | "manual" | "api";
  version: number;
};
```

Los Data Scope assignments pueden derivarse de estas relaciones bajo plantillas versionadas. No se crean scopes académicos arbitrarios sin teaching assignment o evidencia equivalente verificable.

## 16.3 Condicionalidad

Teaching assignments son obligatorios para activar role paths académicos que dependan de subject, course, cohort o class. No son obligatorios para una organización sin población o funciones académicas.

## 16.4 No incluido

No incluye contenidos, actividades, gradebook, course shells de runtime ni objetos Moodle.

# 17. Módulos durante el onboarding

## 17.1 Recursos separados

```text
Module subscription
= relación contractual/comercial con el módulo

Module entitlement
= capacidades y límites aprobados

Module installation
= instalación técnica dentro de Civitas

Runtime binding
= asociación posterior entre capacidades y runtime
```

## 17.2 Qué hace el onboarding base

- registra o valida la subscription;
- proyecta uso comercial;
- permite aprobación Owner del entitlement;
- crea la `module installation` en `pending_configuration` cuando el módulo requiere onboarding especializado.

## 17.3 Qué no hace

- seleccionar runtime;
- crear runtime connection o binding;
- configurar adapter;
- aprovisionar recursos externos;
- declarar activo un módulo que no completó su sub-onboarding.

## 17.4 Estados

```text
subscription: proposed | contracted | suspended | ended
entitlement: pending | approved | denied | suspended
installation: not_created | pending_configuration | configuring | active | degraded | suspended
```

La organización puede quedar `active` con módulos `pending_configuration`, salvo que un módulo esté marcado contractualmente como gate obligatorio para la apertura.

# 18. Branding, portal y dominios

## 18.1 Contratos separados

El onboarding coordina, pero no redefine:

```text
Tenant Resolution
→ tenantSlug, OrganizationHostname, hostname status, redirects y publicación del entry point

Organization Branding
→ logo, colores, favicon, portada, supportEmail y enlaces legales
```

## 18.2 Reserva del portal

El paso `organization_portal` solicita una reserva a Tenant Resolution:

```text
tenantSlug
→ OrganizationHostname
→ hostnameId
→ status: reserved
→ hostname: {tenantSlug}.portal.didaxus.com
```

El onboarding almacena referencias y evidencia. No concatena libremente un subdominio con un base domain.

## 18.3 Publicación

Después del bootstrap:

```text
Portal: reserved o unpublished
```

Solo el activation run aprobado puede dejarlo:

```text
restricted o published
```

La existencia de una organización en Logto no publica el portal.

## 18.4 Dominios personalizados

Los dominios personalizados permanecen fuera del onboarding base y pertenecen a una fase futura de Tenant Resolution.

## 18.5 CSS personalizado

No se admite CSS arbitrario. El branding usa los contratos y tokens gobernados por Organization Branding.

# 19. Activation plan y dry-run

## 19.1 Nombre normativo

El plan del onboarding se denomina `OrganizationActivationPlan` y se publica bajo `/activation-plans`.

`reconciliation-plans` queda reservado para Identity Federation, SCIM, Data Scope, módulos y runtimes.

## 19.2 Plan inmutable

```ts
type OrganizationActivationPlan = {
  id: string;
  onboardingId: string;
  onboardingVersion: number;
  planHash: string;
  targetOperationalStatus: "restricted_active" | "active";
  policyVersions: Record<string, string>;
  mappingVersions: Record<string, number>;
  operations: PlannedOperation[];
  blockers: ValidationFinding[];
  warnings: ValidationFinding[];
  moduleUsageProjection: ModuleUsageProjection[];
  safeToApply: boolean;
  createdBy: string;
  createdAt: string;
};
```

## 19.3 Operaciones destructivas

Requieren datos completos, provenance, threshold policy, revisión, idempotencia, evidencia y compensación. El umbral es una política versionada.

## 19.4 Comparación

Cada rerun crea un plan nuevo y un diff semántico. Nunca modifica un plan aprobado.

# 20. Aprobación HITL y ejecución

## 20.1 Decisiones de aprobación

```text
approve
request_changes
reject
```

No existen decisiones `activate_restricted` ni `activate_production`.

## 20.2 Aprobación

```ts
type OrganizationActivationApproval = {
  id: string;
  onboardingId: string;
  onboardingVersion: number;
  planId: string;
  planHash: string;
  decision: "approve" | "request_changes" | "reject";
  approvedTarget: "restricted_active" | "active" | null;
  reason: string;
  actorId: string;
  reauthenticationEvidenceRef: string;
  idempotencyKey: string;
  createdAt: string;
};
```

`approvedTarget` es obligatorio únicamente para `approve`.

## 20.3 Activation run

```http
POST /api/v1/owner/organization-onboardings/{id}/activation-runs
```

Ejecuta exactamente la aprobación vigente. Debe rechazar plan, versión, hash o target distintos; reautoriza cada mutación y registra checkpoints.

## 20.4 Receipt

El receipt conserva versión, plan, aprobación, target, observed state, resultado operativo, módulos, excepciones y evidencias.

# 21. Fallos, compensación y rollback

## 21.1 Política confirmada

No se revierte ciegamente todo el proceso.

Se utiliza:

```text
compensación selectiva segura
+ conservación de recursos válidos
+ estado blocked/failed
+ evidencia
+ reintento idempotente
```

## 21.2 Ejemplo

```text
Logto organization creada
admins creados
branding aplicado
IdP configurado
validación final falla
```

Resultado:

- no eliminar organización automáticamente;
- no eliminar administradores automáticamente;
- bloquear publicación;
- registrar failure reason;
- permitir corregir y reanudar;
- compensar únicamente recursos temporales seguros.

## 21.3 Rollback de publicación

Suspender publicación no elimina identidad ni datos. Cambia el estado operativo y revoca acceso según policy.

---

# 22. Aggregate y modelo de datos

## 22.1 Aggregate principal canónico

```ts
type OrganizationOnboarding = {
  id: string;
  organizationId: string | null;
  logtoOrganizationId: string | null;
  status:
    | "draft"
    | "bootstrap_validating"
    | "bootstrap_queued"
    | "bootstrap_running"
    | "configuring"
    | "ready_for_review"
    | "changes_requested"
    | "approved"
    | "activation_queued"
    | "activating"
    | "verifying"
    | "completed"
    | "blocked"
    | "failed"
    | "rejected"
    | "cancelled"
    | "rollback_required";
  currentVisibleStep: string;
  completenessPercent: number;
  securityReadiness: "blocked" | "warning" | "ready";
  commercialReadiness: "blocked" | "warning" | "ready";
  operationalReadiness: "blocked" | "warning" | "ready";
  overallReadiness: "blocked" | "warning" | "ready";
  version: number;
  etag: string;
  assignedOwnerId: string | null;
  assignedImplementationUserIds: string[];
  assignedOrganizationAdminIds: string[];
  approvedBy: string | null;
  approvedVersion: number | null;
  approvedPlanId: string | null;
  approvedPlanHash: string | null;
  activationResultStatus: "restricted_active" | "active" | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};
```

## 22.2 Tablas canónicas

```text
organization_onboardings
organization_onboarding_step_snapshots
organization_onboarding_collaborators
organization_onboarding_comments
organization_onboarding_validation_runs
organization_onboarding_findings
organization_onboarding_exceptions
organization_activation_plans
organization_activation_approvals
organization_activation_runs
organization_activation_evidence
organization_readiness_snapshots
organization_publication_states
organization_attribute_authority_policies
organization_module_subscriptions
module_entitlements
module_billing_policies
module_usage_ledger
teaching_assignments
```

## 22.3 Recursos referenciados, no duplicados

```text
organization_identity_connections
organization_external_role_mappings
organization_federated_assignment_sources
SCIM connections/plans/runs
canonical roles
Owner Ceilings
Tenant Activations
PBAC policies
taxonomy values
Data Scope assignments
module installations
runtime bindings
```

## 22.4 Restricciones de IDs

- `organization_onboardings.organization_id` referencia el ID interno Civitas;
- `logto_organization_id` es external reference única;
- `teacher_membership_id` y membership claims referencian IDs reales Logto mediante mapping verificado;
- ninguna tabla crea un ID alternativo que pretenda ser la membership canónica.

# 23. APIs normativas

## 23.1 Owner — aggregate

```http
POST  /api/v1/owner/organization-onboardings
GET   /api/v1/owner/organization-onboardings
GET   /api/v1/owner/organization-onboardings/{onboardingId}
PATCH /api/v1/owner/organization-onboardings/{onboardingId}
```

## 23.2 Bootstrap

```http
POST /api/v1/owner/organization-onboardings/{onboardingId}/bootstrap-plans
POST /api/v1/owner/organization-onboardings/{onboardingId}/bootstrap-runs
GET  /api/v1/owner/organization-onboardings/{onboardingId}/bootstrap-runs/{runId}
```

## 23.3 Colaboradores y handoff

```http
GET    /api/v1/owner/organization-onboardings/{id}/collaborators
PUT    /api/v1/owner/organization-onboardings/{id}/collaborators/{subjectId}
DELETE /api/v1/owner/organization-onboardings/{id}/collaborators/{subjectId}
POST   /api/v1/owner/organization-onboardings/{id}/handoffs
GET    /api/v1/owner/organization-onboardings/{id}/comments
POST   /api/v1/owner/organization-onboardings/{id}/comments
```

## 23.4 Organization Admin y Organization Portal

La URL visible del portal no contiene `organizationId`:

```text
https://{tenantSlug}.portal.didaxus.com/onboarding/{visibleStepKey}
```

El BFF host-local expone operaciones same-origin:

```text
GET   /api/onboarding
PATCH /api/onboarding/steps/{visibleStepKey}
POST  /api/onboarding/review-requests
GET   /api/onboarding/readiness
POST  /api/onboarding/activation-plan-requests
```

El BFF resuelve `organizationId` desde TenantContext y puede invocar internamente la application layer o las APIs centrales:

```text
/api/v1/o/{organizationId}/...
```

El navegador no selecciona `organizationId`, no envía `X-Tenant-ID` y no obtiene tokens para elegir organización.

## 23.5 Validaciones

## 23.5 Validaciones

```http
POST /api/v1/owner/organization-onboardings/{id}/validation-runs
POST /api/v1/owner/organization-onboardings/{id}/validation-runs/{validationGroup}
GET  /api/v1/owner/organization-onboardings/{id}/validation-runs
GET  /api/v1/owner/organization-onboardings/{id}/readiness
```

## 23.6 Activation plans

```http
POST /api/v1/owner/organization-onboardings/{id}/activation-plans
GET  /api/v1/owner/organization-onboardings/{id}/activation-plans/{planId}
GET  /api/v1/owner/organization-onboardings/{id}/activation-plans/{planId}/diff
```

## 23.7 Aprobación y ejecución

```http
POST /api/v1/owner/organization-onboardings/{id}/approval-decisions
POST /api/v1/owner/organization-onboardings/{id}/activation-runs
GET  /api/v1/owner/organization-onboardings/{id}/activation-runs/{runId}
GET  /api/v1/owner/organization-onboardings/{id}/activation-evidence
```

## 23.8 Identity Federation

Se utiliza exclusivamente el contrato canónico de #154. Sus `/reconciliation-plans` siguen siendo recursos del subsistema Identity Federation y no se confunden con `/activation-plans` del onboarding.

## 23.9 Concurrencia e idempotencia

- `If-Match` en mutaciones versionadas;
- `Idempotency-Key` en bootstrap runs, activation plan generation, approval decisions y activation runs;
- `ETag` en aggregate y recursos sensibles;
- stale write o stale approval falla cerrado y muestra diff.

# 24. Orquestación backend

## 24.1 Servicios

```text
OrganizationOnboardingService
OrganizationBootstrapPlanner
OrganizationBootstrapRunner
OnboardingValidationService
OnboardingCompletenessService
OrganizationReadinessService
IdentityConfigurationCoordinator
ProvisioningPolicyCoordinator
MappingGovernanceCoordinator
AuthorizationPreviewService
OrganizationActivationPlanCompiler
OrganizationActivationRunner
OrganizationPublicationService
ModuleUsageLedgerService
```

## 24.2 Workers y colas

```text
organization-onboarding-bootstrap
organization-onboarding-validation
organization-onboarding-activation-plan
organization-onboarding-activation
organization-onboarding-verification
organization-onboarding-notifications
organization-onboarding-evidence
```

## 24.3 Eventos

```text
organization.onboarding.created
organization.onboarding.bootstrap.planned
organization.onboarding.bootstrap.completed
organization.onboarding.handoff.created
organization.onboarding.step.updated
organization.onboarding.validation.completed
organization.onboarding.review.requested
organization.onboarding.changes_requested
organization.onboarding.approved
organization.onboarding.activation_run.started
organization.onboarding.activation_run.completed
organization.onboarding.activation_run.failed
organization.publication.changed
module.usage.recorded
module.usage.reversed
```

## 24.4 Outbox

Los eventos de estado, auditoría y notificación deben publicarse mediante outbox transaccional. No se envían desde el request handler sin persistencia durable.

---

# 25. UI y experiencia

## 25.1 Superficies y jerarquía de rutas

### Core Manager — Owner y consultor

```text
/owner/organization-onboardings
/owner/organization-onboardings/{onboardingId}
/owner/organization-onboardings/{onboardingId}/{visibleStepKey}
/owner/organization-onboardings/{onboardingId}/{visibleStepKey}/{sectionKey}
/owner/organization-onboardings/{onboardingId}/{visibleStepKey}/{sectionKey}/findings/{findingId}
```

`/owner/organization-onboardings` es el índice principal para reanudar procesos, revisar asignaciones y abrir tareas pendientes.

El detalle de una organización puede mostrar un enlace **Configuración inicial**, pero ese enlace resuelve al mismo `OrganizationOnboarding`; no crea un segundo workspace ni otro aggregate.

### Organization Portal — Administrador de la organización

```text
/onboarding
/onboarding/{visibleStepKey}
/onboarding/{visibleStepKey}/{sectionKey}
/onboarding/{visibleStepKey}/{sectionKey}/findings/{findingId}
```

La ruta tenant no contiene `organizationId`. El BFF obtiene la organización desde `TenantContext`.

La pantalla `/settings` es el home de configuración de la organización y `/onboarding` es el resumen de su configuración inicial.

## 25.2 Registry expandido

`OnboardingRouteRegistry` es la única fuente para router, stepper, navegación de secciones, breadcrumbs, deep links, resume, exit, shortcuts, handoff, guards y pruebas.

```ts
type OnboardingSurface = "owner" | "organization_admin";

type OnboardingBreadcrumbSegment = {
  key: string;
  labelKey: string;
  routeTemplate: string | null;
  current?: boolean;
};

type OnboardingSectionNode = {
  sectionKey: string;
  labelKey: string;
  descriptionKey: string;
  routeSuffix: string;
  requiredCapabilities: string[];
  allowedActions: OnboardingAction[];
  availabilityPolicyRef: string;
  applicabilityPolicyRef: string;
  findingRouteTemplate: string;
  shortcuts: string[];
};

type OnboardingSurfaceRoute = {
  stepRouteTemplate: string;
  sectionRouteTemplate: string;
  findingRouteTemplate: string;
  parentRouteTemplate: string;
  resumeRouteTemplate: string;
  exitRouteTemplate: string;
  breadcrumbSegments: OnboardingBreadcrumbSegment[];
};

type OnboardingNavigationNode = {
  visibleStepKey: VisibleStepKey;
  labelKey: string;
  descriptionKey: string;
  defaultSectionKey: string;
  sections: OnboardingSectionNode[];
  availability: "active" | "conditional" | "blocked" | "complete";
  applicability: "applicable" | "not_applicable";
  requiredCapabilities: string[];
  actionPolicyRef: string;
  surfaces: {
    owner: OnboardingSurfaceRoute | null;
    organizationAdmin: OnboardingSurfaceRoute | null;
  };
};
```

`findingId` es dinámico y siempre queda bajo una `sectionKey`. Un step sin sección explícita resuelve a `defaultSectionKey`; no depende de React state.

## 25.3 Breadcrumbs por superficie

### Owner

```text
Organizaciones
→ Colegio Ejemplo
→ Configuración inicial
→ Inicio de sesión y acceso
→ Probar inicio de sesión
```

Raíces:

```text
Organizaciones       → /owner/organizations
Colegio Ejemplo      → /owner/organizations/{organizationId}
Configuración inicial→ /owner/organization-onboardings/{onboardingId}
```

### Administrador de la organización

```text
Inicio
→ Configuración de la organización
→ Configuración inicial
→ Inicio de sesión y acceso
→ Probar inicio de sesión
```

Raíces:

```text
Inicio                         → /
Configuración de la organización→ /settings
Configuración inicial          → /onboarding
```

Los breadcrumbs usan lista semántica, enlaces a padres reales y `aria-current="page"`. Nunca enlazan a una superficie que el actor no puede utilizar.

## 25.4 Matriz de parent, resume y exit routes

| Pantalla | Owner parent | Owner exit | Admin parent | Admin exit |
|---|---|---|---|---|
| Índice/resumen | `/owner/organization-onboardings` | `/owner/organization-onboardings` | `/settings` | `/settings` |
| Step | `/owner/organization-onboardings/{onboardingId}` | `/owner/organization-onboardings/{onboardingId}` | `/onboarding` | `/settings` |
| Section | step correspondiente | `/owner/organization-onboardings/{onboardingId}` | step correspondiente | `/settings` |
| Finding | section correspondiente | `/owner/organization-onboardings/{onboardingId}` | section correspondiente | `/settings` |
| Activation plan diff | `.../{onboardingId}/dry_run_review/activation_plan` | resumen Owner | `/onboarding/dry_run_review/activation_plan` | `/settings` |
| Receipt | step `approval_publication` | detalle de organización | step `approval_publication` | `/` |

`resumeRoute` conserva step, section y finding durables. `exitRoute` es actor-aware y no depende del historial del navegador.

## 25.5 Navegación interna de secciones

Todos los pasos usan el mismo contrato `OnboardingSectionNavigator`:

- cada sección tiene URL propia;
- cada sección muestra estado, responsable, prerequisites y tareas pendientes;
- la ruta del step redirige a `defaultSectionKey`;
- deep links, handoff y comentarios preservan `sectionKey` y `findingId`;
- el botón anterior/siguiente navega por el orden del registry, no por arrays locales.

Adaptación visual:

```text
Desktop  → rail vertical de secciones dentro del workspace
Tablet   → selector compacto con el mismo orden y estados
Mobile   → selector/drawer de secciones; una sección visible a la vez
```

Los pasos complejos usan estas secciones:

```text
Personas y estructura académica:
attribute_mappings
→ group_mappings
→ taxonomy_structure
→ academic_periods
→ teaching_assignments

Accesos y permisos:
role_candidates
→ owner_ceilings
→ tenant_activations
→ pbac
→ data_scope
→ access_preview

Revisión antes de activar:
identity_reconciliation_summary
→ authorization_projection
→ module_entitlements
→ module_usage_projection
→ readiness
→ activation_plan
```

El paso **Organización y portal** se divide visualmente sin crear pasos principales nuevos:

```text
Información institucional
→ Contactos
→ Portal y dirección
→ Identidad visual
→ Revisión del bloque
```

## 25.6 Aplicabilidad y contador

Los ocho pasos canónicos permanecen visibles para explicar el proceso completo.

Un step `not_applicable`:

- se muestra como **No aplica**;
- no bloquea readiness;
- no cuenta en numerador ni denominador de pasos aplicables;
- puede abrirse en solo lectura para explicar la razón y evidencia;
- no se marca artificialmente como completado.

Copy del progreso:

```text
Paso 3 de 6 aplicables · 2 no aplican
```

El total de ocho sigue visible en el step rail como estructura del onboarding.

## 25.7 Comportamiento al abrir steps

| Estado | Apertura | Mutaciones | Continue |
|---|---|---|---|
| `active` | permitida | según action policy | permitido si validación pasa |
| `conditional` | permitida en solo lectura | solo acciones para satisfacer prerequisites | no |
| `blocked` | permitida con blockers y evidencia | únicamente acciones autorizadas para resolver el bloqueo | no |
| `complete` | permitida en solo lectura por defecto | requiere **Editar etapa** y capacidad | no hasta revalidar si se edita |
| `not_applicable` | permitida para explicación | no | se omite |
| `planned` | no es ruta funcional | no | no |

Editar un step `complete` invalida sus validation runs dependientes. Si existe activation plan o aprobación basada en esa versión, pasa a `stale` y debe regenerarse; nunca se ejecuta un plan obsoleto.

## 25.8 Matriz de navegación y acciones

La navegación se materializa desde:

```text
step
+ section
+ action
+ actor
+ onboarding state
+ organization state
+ capability
+ assignment
```

Acciones canónicas:

```ts
type OnboardingAction =
  | "view"
  | "edit"
  | "validate"
  | "request_review"
  | "request_plan_regeneration"
  | "generate_activation_plan"
  | "approve_activation_plan"
  | "execute_activation_run"
  | "manage_collaborators"
  | "resolve_owner_exception";
```

| Actor | Configuración | Plan/review | Approval/publication |
|---|---|---|---|
| Administrador Didaxus | ve y edita según capacidad | genera plan, revisa y decide | aprueba y ejecuta con reautenticación |
| Consultor delegado | edita solo secciones asignadas | solicita revisión y consulta diff permitido | no aprueba ni ejecuta |
| Administrador de la organización | edita secciones tenant permitidas | solicita revisión o regeneración y ve resumen no sensible | ve progreso/receipt; no aprueba, ejecuta ni ve excepciones internas Owner |

Las acciones no autorizadas no se renderizan. Un deep link forbidden conserva shell, contexto y parent route, pero no revela datos restringidos.

## 25.9 CTA role-aware para blockers

Cada finding incluye:

```ts
type OnboardingFindingResolution = {
  responsibleActor: "owner" | "consultant" | "organization_admin" | "external";
  responsibleCapability: string | null;
  resolutionMode: "self" | "delegate" | "request_owner" | "external_action";
  resolutionStepKey: VisibleStepKey;
  resolutionSectionKey: string;
  resolutionRouteTemplate: string | null;
  requestAction: "notify" | "request_review" | "request_exception" | null;
};
```

Si el actor puede resolver, el CTA abre la section/finding exacta. Si no puede, el CTA muestra responsable e impacto y ofrece **Solicitar intervención** o **Notificar responsable**; nunca navega a una acción forbidden.

## 25.10 Semántica de guardado y salida

```text
Autosave
→ persiste cambios de campo/sección después del debounce
→ no valida el step
→ no avanza

Guardar borrador
→ fuerza flush de autosave
→ espera persistencia durable y nuevo ETag
→ mantiene la ruta

Continuar
→ flush + guarda + valida prerequisites
→ solo navega cuando el backend confirma

Guardar y salir
→ flush + guarda
→ Owner/consultor: resumen del onboarding
→ Administrador de la organización: /settings
```

Mientras exista `saving`, `Continue`, handoff y salida destructiva permanecen bloqueados. Un conflicto ETag muestra diff y no comunica éxito antes de resolverlo.

## 25.11 Contexto visible y política de idioma

Idioma visible predeterminado:

```text
español
```

Equivalencias obligatorias:

```text
Owner                   → Administrador Didaxus
Organization Admin      → Administrador de la organización
Organizations           → Organizaciones
Onboarding              → Configuración inicial
Governance              → Gobierno
Modules                 → Módulos
Operations              → Operaciones
Audit                   → Auditoría
Readiness               → Preparación
Handoff                 → Transferir configuración
Configuration           → En configuración
Editing                 → Puede editar
Saved 2 min ago         → Guardado hace 2 minutos
Save draft              → Guardar borrador
Save and exit           → Guardar y salir
Open summary            → Abrir resumen
Copy link                → Copiar enlace
```

OIDC, SAML, SCIM, API, PBAC y Data Scope pueden conservar sus siglas en superficies técnicas, acompañadas de una explicación funcional en español.

El encabezado muestra simultáneamente:

```text
nombre humano de la organización
actor visible
estado operativo
paso y sección
modo de edición/lectura/aprobación
estado de guardado
progreso aplicable
```

## 25.12 Shell, responsive y accesibilidad

Desktop:

```text
breadcrumb
→ encabezado contextual
→ step rail | section navigator + workspace | readiness
→ action bar
```

Jerarquía móvil:

```text
1. organización + actor + estado
2. selector de paso
3. selector de sección
4. blocker/readiness dominante
5. contenido
6. acción primaria sticky + menú de acciones secundarias
```

La action bar móvil no presenta seis botones simultáneos. **Continuar** es primaria; guardar, resumen, copiar enlace y transferir quedan en overflow según contexto.

Requisitos:

- `aria-current` para página, step y section;
- focus visible y no cubierto por sticky UI;
- status messages para guardado y validación;
- error summary enlazado a campos;
- targets móviles suficientes;
- zoom 200 %, teclado y lector de pantalla;
- foco al heading de la nueva section después de navegar.

## 25.13 Estados vacíos y recuperación

Cada section define:

```text
emptyState
loadingState
errorState
blockedState
notApplicableState
```

Ejemplos obligatorios:

- acceso administrado sin IdP externo;
- SCIM no aplicable;
- organización sin estructura académica;
- cero módulos contratados;
- activation plan inexistente, stale o rechazado;
- bootstrap parcial;
- Logto organization creada sin vínculo Civitas;
- hostname reservado en conflicto;
- navegador offline durante autosave.

Todo error muestra causa, impacto, responsable, siguiente acción y ruta de regreso, sin secretos ni PII.

## 25.14 Activation receipt

El receipt prioriza una acción principal:

```text
Administrador Didaxus
→ Abrir vista general de la organización

Administrador de la organización
→ Ir al inicio de la organización
```

Acciones secundarias, filtradas por capacidades:

```text
Gobierno
Módulos
Operaciones
Auditoría
Descargar evidencia
```

No se presentan todos los destinos como equivalentes.

## 25.15 Componentes

```text
OrganizationOnboardingShell
OnboardingContextHeader
OnboardingBreadcrumbs
OnboardingStepRail
OnboardingSectionNavigator
OnboardingStepHeader
OnboardingCompletenessMeter
OnboardingReadinessPanel
OnboardingTaskIndex
OnboardingBlockerAction
OnboardingCollaborators
OnboardingHandoffCard
OrganizationProfileForm
PortalReservationCard
PortalBrandPreview
InitialAdministratorsEditor
IdentityConnectionList
IdentityConnectionEditor
ScimLifecycleEditor
AttributeMappingTable
GroupMappingTable
CanonicalRoleMapping
TaxonomyStructureBuilder
AcademicPeriodEditor
TeachingAssignmentBuilder
DataScopeAssignmentBuilder
AccessDecisionPreview
ActivationPlanSummary
ActivationPlanDiffViewer
BlockingConflictPanel
OwnerApprovalPanel
ActivationProgress
ActivationReceipt
OnboardingRuntimeErrorBoundary
```

## 25.16 Workspaces posteriores

Teacher, Student y Parent no participan en onboarding. Este contrato no afirma consistencia global entre sus workspaces. El receipt entrega la organización a superficies operativas definidas por otros contratos.

# 26. Seguridad

## 26.1 Secrets

- nunca en payload de lectura;
- nunca en logs;
- nunca en snapshots;
- usar `secretReference`;
- redacción estructural;
- rotación auditable;
- separación read/write.

## 26.2 OIDC

- issuer exacto;
- audience/resource exactos;
- algoritmos permitidos;
- JWKS validado;
- anti-SSRF para discovery;
- límites de tamaño y timeout;
- nonce/state/PKCE según flujo.

## 26.3 SAML

- parser sin DTD/entity expansion;
- destination y audience;
- `InResponseTo`;
- clock skew controlado;
- rotación superpuesta de certificados;
- firma obligatoria según contrato.

## 26.4 Tenant isolation

Las operaciones del Organization Portal heredan Tenant Resolution: hostname autoritativo, sesión BFF host-only, membership, route/resource enforcement y protección CSRF para mutaciones autenticadas.


Cada request debe verificar:

```text
route organization
+ authenticated organization
+ membership organization
+ resource organization
+ Data Scope organization
```

## 26.5 Soporte temporal

- MFA fuerte;
- ticket;
- reason;
- TTL;
- mínimo privilegio;
- audit event;
- no genera uso facturable por defecto.

## 26.6 PII y evidencia

Las evidencias de test login, claims y dry-run deben estar redactadas. No guardar JWT completos, assertions, tokens, secretos ni PII innecesaria.

---

# 27. Auditoría y observabilidad

## 27.1 Auditoría

Registrar:

- actor;
- organización;
- onboarding;
- versión;
- acción;
- before/after redactado;
- reason;
- source;
- request ID;
- idempotency key;
- plan hash;
- policy versions.

## 27.2 Métricas

```text
onboarding_duration_seconds
bootstrap_success_rate
validation_failure_count
readiness_blocker_count
identity_connection_validation_seconds
scim_reconciliation_duration
mapping_conflict_count
activation_failure_count
module_usage_overage_count
stale_write_count
```

## 27.3 Alertas

- activation failed;
- connector degraded;
- secret expiring;
- destructive plan over threshold;
- cross-tenant attempt;
- repeated identity ambiguity;
- unsupported authz contract;
- module usage overage;
- no active administrator.

---

# 28. Notificaciones

El onboarding debe poder emitir:

- invitación al administrador;
- recordatorio de invitación;
- handoff;
- instrucciones de SSO;
- resultado de validación;
- resultado de dry-run;
- request changes;
- approval;
- activation;
- failure;
- degraded connector.

La fuente de cada correo puede ser Civitas o Logto según el evento. El contrato debe impedir duplicados mediante event key/idempotency.

---

# 29. Post-onboarding y handoff a Governance

Al finalizar:

```text
Identity
→ Governance / Identity

Roles y permissions
→ Governance / Roles & Permissions

Structure
→ Governance / Structure

Data Scope
→ Governance / Data Scope

Audit y evidence
→ Governance / Audit

Modules
→ Organization Modules
```

El onboarding queda read-only como receipt e historial, salvo reapertura versionada por Owner.

---

# 30. Migración desde el flujo actual

## 30.1 Decisión de preservación

El flujo actual:

```text
FUNCIONA
SE CONSERVA
SE REUTILIZA
SE INTEGRA COMO BOOTSTRAP
```

No representa el onboarding completo, la activación final ni la publicación productiva.

Se preservan:

- creación real de organización Logto;
- bootstrap de administradores;
- memberships y roles iniciales;
- idempotencia;
- datos institucionales;
- contactos;
- business profile;
- segmentación;
- borradores actuales como fuente de migración.

## 30.2 Encapsulación

```text
OrganizationOnboarding creado
→ datos mínimos guardados
→ bootstrap plan
→ bootstrap run
→ runCanonicalOrganizationProvisioning()
→ organizationId interno + logtoOrganizationId externo
→ hostname reserved
→ status configuring
→ continuar al paso access_methods
```

No se crea primero una organización aislada para descubrir después su onboarding.

## 30.3 Mapeo del wizard de cuatro etapas

```text
organization
admins
segmentation
review
```

se integra como subsecciones de:

```text
organization_portal
initial_administrators
```

Al finalizar el segundo paso se ejecuta el bootstrap. La UI continúa al paso 3.

## 30.4 Correcciones inmediatas

### Stage keys

Un registry único reemplaza vocabularios divergentes como `canonical` y `business`.

### Draft identity

```text
onboardingId estable
+ version
+ ETag
+ idempotency key por comando
```

### Tenant Resolution

```text
appSubdomain + appBaseDomain
→ input temporal de migración
→ tenantSlug
→ OrganizationHostname reserved
→ hostnameId
```

### Reanudación

Agregar listado, ruta por onboardingId, carga inicial, autosave, colaboradores, handoff, ETag y resolución de conflictos.

### Finalización

Sustituir:

```text
Organization created in Logto
```

por:

```text
Bootstrap completed.
The organization and its initial administrators are ready.
Continue with identity, provisioning, structure and access configuration.
```

## 30.5 Identity Federation y SCIM

Los administradores bootstrap se reconcilian posteriormente con identidades SCIM/IdP mediante issuer, subject, externalId y evidencia. El correo es señal secundaria y no crea duplicados.

Tags y lists existentes pueden conservarse como metadata inicial, pero no sustituyen organigrama, taxonomía, organization units ni Data Scope.

# 31. Orden de implementación

## Epic 1 — Contratos y aggregate

- congelar IDs Civitas/Logto;
- aggregate DTO y tablas canónicas;
- tres state machines;
- visible step registry y domain sections;
- version/ETag, autosave, drafts, colaboradores y handoff;
- readiness multidimensional.

## Epic 2 — Bootstrap compatible

- conservar create organization actual dentro de bootstrap plan/run;
- vincular organizationId y logtoOrganizationId;
- crear admins, memberships y roles mínimos;
- estado `configuration` y receipt de bootstrap.

## Epic 3 — Perfil, portal y branding

- perfil institucional, domain claims, preview y publication state.

## Epic 4 — Identity Federation real

- contrato #154, PostgreSQL, Vault, OIDC/SAML, test login, claims inspection y múltiples conexiones.

## Epic 5 — SCIM y lifecycle

- ingestion real, provenance, desired state, membership materialization Logto, planes propios de reconciliación, DLQ y safe removals.

## Epic 6 — Mappings, estructura y teaching assignments

- #217, #218, attributes, groups, role candidates, taxonomy, periods, teaching assignments y Data Scope derivado.

## Epic 7 — Autorización y Access Preview

- ceilings, activations, PBAC, ABAC, membership-bound role paths y reason codes.

## Epic 8 — Commercial y módulos

- subscriptions, entitlements, module billing policies, usage ledger y proyecciones con las métricas congeladas.

## Epic 9 — Activation plan, HITL y ejecución

- activation plan/diff, approval decisions, activation runs, verification, publication, receipt y module installations `pending_configuration`.

# 32. Pruebas

## 32.1 Dominio y contratos

- state machines separadas;
- visible steps frente a domain sections;
- readiness multidimensional y overall derivado;
- aggregate DTO, IDs, tablas y rutas;
- approval vs activation run;
- activation plan vs reconciliation plan.

## 32.2 Idempotencia y concurrencia

- retries de bootstrap, plan, aprobación y activation run;
- `If-Match`, stale plan, stale approval y worker lock;
- collaborator PUT idempotente.

## 32.3 Identity y memberships

- organización y membership materializadas en Logto;
- mapping `organizationId ↔ logtoOrganizationId`;
- `organization_membership_id` real;
- ausencia de IDs sintéticos;
- OIDC/SAML/SCIM, múltiples conexiones y fail closed.

## 32.4 Authorization y estructura

- role paths, ceilings, activations, PBAC, Data Scope;
- teaching assignments tenant-bound;
- scopes derivados y provenance;
- #217 y #218.

## 32.5 Commercial y módulos

- ninguna métrica `platform.active_membership` facturable;
- `planning.author_teacher`;
- `planning.additional_course`;
- entitlement, installation y runtime binding separados.

## 32.6 E2E

### Owner-led

```text
bootstrap → configuración → activation plan → approve → activation run → completed
```

### Delegated

```text
Owner bootstrap → admin completa → review → changes → plan nuevo → approve → activation run
```

### Restricted

```text
approve target restricted_active → activation run → completed
→ configuración adicional → plan nuevo → approve target active → activation run
```

# 33. Gates GO/NO-GO

## 33.1 GO para foundation

- contrato v1.2 reconciliado;
- aggregate DTO y tablas normalizados;
- IDs internos/externos definidos;
- step registry visible y domain sections definidos;
- APIs `/activation-plans` aprobadas.

## 33.2 NO-GO para delegar

Mientras no existan vínculo de IDs, admin membership Logto válida, rutas tenant, ETag, auditoría y handoff seguro.

## 33.3 NO-GO para aprobación

Mientras el activation plan sea stale, no exista target, haya blockers, falten policy versions o la membership sea ambigua.

## 33.4 NO-GO para activation run

Mientras no exista una aprobación vigente que coincida exactamente con planId, planHash, onboardingVersion y approvedTarget.

## 33.5 NO-GO para `restricted_active` o `active`

Mientras exista cross-tenant, dominio duplicado, IdP requerido inválido, identidad ambigua, membership no verificable, rol fuera de ceiling, mapping a `owner_global`, taxonomy archivada, scope obligatorio ausente, contrato incompatible, acción destructiva incompleta, secreto expuesto, límite comercial no aprobado o observed state incompatible.

# 33A. Repository Compliance Gate

El repositorio se evalúa de forma independiente. El gate debe comprobar al menos:

```text
repository = didaxus/civitas10
8 visible steps
Owner route registry
Organization Portal host-local route
organizationId interno distinto de logtoOrganizationId
tenantSlug + OrganizationHostname
aggregate persistente antes del bootstrap
ETag / If-Match
bootstrap plan/run
runCanonicalOrganizationProvisioning encapsulado
capability-filtered navigation
planned routes no navegables
parent routes y breadcrumbs
Save and exit
multi-actor E2E
```

Estados posibles:

```text
PASS
PARTIAL
NOT_IMPLEMENTED
FAIL
```

Mientras el resultado sea `NOT_IMPLEMENTED` o `FAIL`, el contrato puede descomponerse en foundation e issues, pero no declararse productivo.

# 34. Definition of Done

- [ ] Markdown v1.2 es la única fuente normativa del onboarding.
- [ ] perfiles backend/UI declaran que son derivados.
- [ ] bootstrap conserva creación temprana de Logto y admins mínimos.
- [ ] IDs Civitas, Logto y membership están diferenciados.
- [ ] membership materializada existe solo en Logto; Civitas mantiene desired state y provenance.
- [ ] ocho visible steps y sus domain sections comparten registry.
- [ ] teaching assignments existen como entidad condicional explícita.
- [ ] readiness es multidimensional.
- [ ] no existe billing global por active membership.
- [ ] métricas iniciales del contrato base son `planning.author_teacher` y `planning.additional_course`; otras dimensiones pertenecen a sus módulos.
- [ ] subscription, entitlement, installation y runtime binding están separados.
- [ ] onboarding, organización y portal usan state machines separadas.
- [ ] collaborator API usa PUT/DELETE por subjectId.
- [ ] activation plan usa `/activation-plans`.
- [ ] aprobación y activation run son acciones distintas.
- [ ] SCIM delete suspende y no hard-deletea.
- [ ] #217 y #218 están implementados antes de activación productiva.
- [ ] planes, aprobaciones, runs y evidencias son inmutables, idempotentes y auditables.
- [ ] runtime LMS permanece fuera del onboarding base.
- [ ] Document Consistency Checker reporta cero conflictos normativos.
- [ ] Repository Compliance Checker reporta implementación compatible o registra explícitamente `NOT_IMPLEMENTED`.
- [ ] Tenant Resolution compatibility check confirma `tenantSlug + OrganizationHostname` y rutas host-locales.
- [ ] breadcrumbs Owner y Organization Admin usan raíces distintas y válidas.
- [ ] parent, resume y exit routes están definidos por tipo de pantalla.
- [ ] el registry modela sections, findings, shortcuts y breadcrumb segments.
- [ ] todos los pasos complejos usan navegación interna route-backed.
- [ ] `not_applicable` no bloquea readiness y el contador informa pasos aplicables.
- [ ] steps conditional, blocked y complete tienen comportamiento de apertura y edición explícito.
- [ ] la matriz actor + estado + capability materializa navegación y acciones.
- [ ] blocker CTA nunca dirige a una acción forbidden.
- [ ] autosave, guardar borrador, continuar y guardar y salir tienen semántica distinta.
- [ ] la interfaz visible usa español consistente y explica siglas técnicas.
- [ ] el receipt prioriza una acción principal actor-aware.

# 35. ADRs

## ADR-ONB-001 — Onboarding en dos etapas
Bootstrap y activación son planes/runs diferentes.

## ADR-ONB-002 — IDs Civitas y Logto separados
`organizationId` es interno; `logtoOrganizationId` es external reference.

## ADR-ONB-003 — Membership materializada en Logto
Civitas mantiene desired state, provenance y decisión; no crea una segunda membership.

## ADR-ONB-004 — Estados separados
Onboarding, organización y portal tienen máquinas independientes.

## ADR-ONB-005 — Readiness multidimensional
Seguridad, comercial y operación se evalúan por separado; overall es derivado.

## ADR-ONB-006 — Visible steps no son entidades
Ocho pasos visibles contienen secciones de dominio y comandos explícitos.

## ADR-ONB-007 — Teaching assignments contractuales
Son entidad canónica y obligatoria cuando un role path académico la requiere.

## ADR-ONB-008 — Billing por módulo
No existe silla global facturable; el usage ledger usa dimensiones de módulo.

## ADR-ONB-009 — Lifecycle de módulos separado
Entitlement, installation y runtime binding no son equivalentes.

## ADR-ONB-010 — Approval separada de execution
Approval autoriza plan y target; activation run ejecuta.

## ADR-ONB-011 — Activation plan separado de reconciliation plans
El onboarding usa `/activation-plans`; los subsistemas conservan sus reconciliaciones.

## ADR-ONB-012 — Identity multi-conexión y fail closed
Múltiples conexiones usan routing versionado y validado.

## ADR-ONB-013 — SCIM sin hard delete automático
Suspensión inmediata y retención gobernada.

## ADR-ONB-014 — Governance como superficie permanente
El onboarding configura inicialmente y queda como receipt.


## ADR-ONB-015 — Tenant Resolution es autoridad del entry point
El onboarding solicita reservas y publicación; no concatena subdominio y base domain.

## ADR-ONB-016 — Flujo actual preservado como bootstrap
`runCanonicalOrganizationProvisioning()` se reutiliza dentro del Bootstrap Runner.

## ADR-ONB-017 — Rutas tenant host-locales
El Organization Portal usa `/onboarding/{visibleStepKey}`; `organizationId` queda en la application layer central.

## ADR-ONB-018 — OnboardingRouteRegistry
Router, stepper, breadcrumbs, labels, permisos y deep links comparten una fuente única.

## ADR-ONB-019 — Gates documentales y de repositorio separados
Un PASS de documentos no afirma implementación productiva.

## ADR-ONB-020 — Navegación orientada y recuperable
Cada pantalla posee parent route, Save and exit, manejo de cambios sin guardar y error boundary con contexto.

## ADR-ONB-021 — Breadcrumbs por superficie
Core Manager y Organization Portal usan raíces distintas; ningún breadcrumb cruza workspaces sin autorización.

## ADR-ONB-022 — Registry jerárquico
Steps, sections, findings, resume, exit, shortcuts y breadcrumbs comparten un registry versionado.

## ADR-ONB-023 — Aplicabilidad transparente
Los ocho pasos permanecen visibles; los no aplicables se excluyen del progreso y muestran su razón.

## ADR-ONB-024 — Steps bloqueados explicables
Un step bloqueado puede abrirse para mostrar blockers y acciones permitidas, pero no avanza.

## ADR-ONB-025 — Navegación y acciones actor-aware
La UI se materializa desde actor, estado, capacidad y asignación; las acciones no autorizadas no se renderizan.

## ADR-ONB-026 — Guardado con semántica explícita
Autosave, guardar borrador, continuar y guardar y salir son operaciones distintas y observables.

## ADR-ONB-027 — Español como idioma visible predeterminado
Las claves técnicas no se usan como copy y las siglas especializadas incluyen explicación funcional.

# Apéndice A — Registry de pasos visibles y secciones

```text
organization_portal
  └── organization_profile, entry_point, branding, domain_claims

initial_administrators
  └── bootstrap_admins, invitations, initial_governance

access_methods
  └── identity_connections, routing, test_login, claims_inspection

provisioning_lifecycle
  └── scim, jit, api_sync, native_admin, source_policies

identity_structure_mapping
  ├── attribute_mappings
  ├── group_mappings
  ├── taxonomy_structure
  ├── academic_periods
  └── teaching_assignments

authorization_simulation
  ├── role_candidates
  ├── owner_ceilings
  ├── tenant_activations
  ├── pbac
  ├── data_scope
  └── access_preview

dry_run_review
  ├── identity_reconciliation_summary
  ├── authorization_projection
  ├── module_entitlements
  ├── module_usage_projection
  ├── commercial_readiness
  └── activation_plan

approval_publication
  └── approval_decision, activation_run, verification, publication, receipt
```

El registry compartido debe declarar visible step, domain sections, validation groups y comandos permitidos sin tratarlos como sinónimos.

# Apéndice B — Clasificación de findings

```ts
type OnboardingFinding = {
  id: string;
  code: string;
  severity: "blocker" | "warning" | "info";
  stepKey: VisibleStepKey;
  sectionKey: string;
  resourceRef: string | null;
  messageKey: string;
  evidenceRef: string | null;
  canOverride: boolean;
  requiredPermissionToOverride: string | null;
  responsibleActor: "owner" | "consultant" | "organization_admin" | "external";
  responsibleCapability: string | null;
  resolutionMode: "self" | "delegate" | "request_owner" | "external_action";
  resolutionRouteTemplate: string | null;
  requestAction: "notify" | "request_review" | "request_exception" | null;
};
```

Ejemplos:

```text
domain_conflict
identity_ambiguous
immutable_external_id_missing
idp_validation_failed
role_outside_owner_ceiling
owner_role_mapping_forbidden
cross_tenant_reference
scope_required_value_missing
authz_contract_unsupported
scim_source_incomplete_destructive_plan
active_admin_missing
secret_exposure_detected
module_usage_overage_approval_required
```

---

# Apéndice C — Bootstrap plan de ejemplo

```json
{
  "onboardingId": "onb_123",
  "onboardingVersion": 3,
  "organization": {
    "name": "Colegio Ejemplo",
    "description": "Institución educativa",
    "tenantSlug": "colegio-ejemplo",
    "hostnameId": "host_reserved_123",
    "hostname": "colegio-ejemplo.portal.didaxus.com",
    "adminDomain": "colegio.edu.co"
  },
  "administrativeContacts": [
    {
      "email": "admin@colegio.edu.co",
      "organizationRoleName": "organization_admin"
    }
  ],
  "operations": [
    "create_logto_organization",
    "persist_civitas_profile",
    "resolve_or_create_admin_users",
    "add_organization_memberships",
    "assign_initial_organization_roles",
    "reserve_organization_hostname",
    "create_configuration_entry_point"
  ],
  "targetOperationalStatus": "configuration"
}
```

---

# Apéndice D — Activación plan de ejemplo

```json
{
  "onboardingId": "onb_123",
  "onboardingVersion": 18,
  "targetStatus": "active",
  "identityConnections": ["idc_1", "idc_2"],
  "mappingVersion": 9,
  "authorizationContractVersion": "2026-07-civitas-authz-v2",
  "dataScopeRegistryVersion": "2026-07-civitas-data-scope-dimensions-v2",
  "moduleBillingPolicyVersions": {"lms": "v1", "planning": "v1"},
  "approvedModuleEntitlements": ["governance", "lms"],
  "moduleRuntimeConfigurationIncluded": false,
  "targetOperationalStatus": "active",
  "blockers": [],
  "warnings": ["secondary_idp_not_configured"],
  "safeToApply": true,
  "planHash": "sha256:..."
}
```

---

# Conclusión normativa

El onboarding de Civitas no es una única forma que termina al crear una organización en Logto.

Es un proceso gobernado de dos etapas:

```text
Owner bootstrap
→ organización Logto + administradores mínimos
→ estado configuration
→ configuración colaborativa
→ identidad y lifecycle
→ mappings y estructura
→ autorización y Data Scope
→ activation plan
→ aprobación Owner de plan y target
→ activation run
→ restricted_active o active
→ publicación
```

La primera etapa conserva el comportamiento funcional existente de Civitas. La segunda añade la capa que falta para convertir esa creación mínima en una organización segura, gobernada y operacional.

El onboarding base puede aprobar módulos, pero no configura Moodle ni ningún otro runtime. Esa responsabilidad comienza después, en el onboarding específico del módulo correspondiente.
