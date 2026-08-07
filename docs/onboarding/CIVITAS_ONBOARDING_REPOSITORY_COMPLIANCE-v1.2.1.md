# Repository Compliance Checker — Onboarding Civitas v1.2.1

**Repositorio objetivo:** `didaxus/civitas10`  
**Estado inicial:** `NOT_IMPLEMENTED`

## 1. Gates separados

```text
Document Consistency
→ PASS_DOCUMENT_CONSISTENCY_WITH_IDP_REBASE

Repository Compliance
→ NOT_IMPLEMENTED | PARTIAL | PASS | FAIL
```

## 2. Checks de dominio y persistencia

- aggregate creado antes del bootstrap;
- `organizationId` canónico Civitas;
- `subjectId` canónico Civitas;
- provider organization/subject/membership IDs únicamente mediante bindings verificados de #344;
- ningún `logtoOrganizationId`, `logtoUserId` o provider membership ID como primary key/autoridad de dominio;
- `tenantSlug + OrganizationHostname`;
- ETag/If-Match;
- bootstrap plan/run;
- activation plan/approval/run/evidence;
- FKs tenant-bound;
- outbox, audit e idempotencia reutilizados;
- provider mutations exclusivamente por `IdentityProviderAdapter` #346.

## 3. Checks de rutas

Owner:

```text
/owner/organization-onboardings
/owner/organization-onboardings/:onboardingId
/owner/organization-onboardings/:onboardingId/:visibleStepKey
/owner/organization-onboardings/:onboardingId/:visibleStepKey/:sectionKey
/owner/organization-onboardings/:onboardingId/:visibleStepKey/:sectionKey/findings/:findingId
```

Tenant:

```text
/onboarding
/onboarding/:visibleStepKey
/onboarding/:visibleStepKey/:sectionKey
/onboarding/:visibleStepKey/:sectionKey/findings/:findingId
```

No permitido:

```text
/o/:organizationId/onboarding/*
```

La ruta tenant no acepta provider organization IDs ni claims del navegador como selector de organización.

## 4. Checks del registry

Debe existir una única fuente generada o compartida con:

```text
visibleStepKey
sectionKey
defaultSectionKey
sectionRoute
findingRoute
parentRoute
resumeRoute
exitRoute
breadcrumbSegments
requiredCapabilities
allowedActions
availability
applicability
```

Router, stepper, section navigator, breadcrumbs, shortcuts, handoff y tests deben consumirla.

Las acciones protegidas consumen el Authorization Decision Envelope/#348 y el Action Registry/#349; el registry de navegación no inventa permisos.

## 5. Checks de navegación

- breadcrumbs Owner y tenant distintos;
- parent routes explícitos;
- índice Owner canónico;
- `Save and exit` actor-aware;
- deep links a sections/findings;
- `Step N de M aplicables`;
- no aplicables visibles y no bloqueantes;
- blocked/conditional abren explicación;
- complete abre read-only y reabrir invalida plan derivado;
- planned no es link;
- forbidden conserva shell sin descargar datos prohibidos;
- blocker CTA respeta decisión backend, capacidad y responsable;
- cambio de organización purga estado/caches/in-flight protegidos.

## 6. Checks de acciones y Governance

Materialización de acciones desde backend:

```text
canonical subject
+ canonical organization
+ onboarding state
+ organization state
+ authorization snapshot
+ capability/action registry
+ resource ownership
```

Organization Admin no puede:

- aprobar activation plan;
- ejecutar activation run;
- resolver Owner Ceiling;
- ver excepciones internas o notas comerciales restringidas.

Onboarding consume, no duplica:

```text
#318/#329 Organization Model / Predicate Engine
#330 Segmentation
#331 Scope Assignment Policies
#348-#351 AUTH contracts
#352-#356 Governance boundaries/reconciliation
```

Solo #331 puede materializar `authorization_scope_assignments`.

## 7. Checks de provider materialization

```text
canonical desired identity state
→ seat/entitlement gate
→ persisted operation/preconditions
→ outbox/worker
→ IdentityProviderAdapter
→ active provider
```

Checks:

- `runCanonicalOrganizationProvisioning()` no llama provider SDK desde lógica de dominio;
- Logto parity se implementa en adapter/compatibility boundary;
- provider capability ausente produce estado explícito, no branching `provider === logto` en dominio;
- retry es idempotente y tenant-bound;
- worker revalida tenant, desired state y precondiciones destructivas antes de ejecutar;
- provider result actualiza bindings/evidence, no la autoridad canónica.

## 8. Checks de guardado

- autosave con debounce y ETag;
- Guardar borrador fuerza flush durable;
- Continuar espera save + validación;
- Guardar y salir usa exit route;
- cambio de ruta con datos pendientes exige confirmación;
- ETag mismatch muestra diff;
- no se anuncia éxito antes del backend.

## 9. Checks UX, evidencia y accesibilidad

- español como idioma visible predeterminado;
- acrónimos técnicos explicados;
- step/section navigation usable con teclado;
- `aria-current` para página, step y section;
- focus-not-obscured;
- action bar móvil con una primaria y overflow;
- empty/error/not-applicable states;
- receipt con acción principal actor-aware;
- evidence/diagnostics respeta #350;
- provider IDs no son primary labels de UI;
- tokens/assertions/secrets nunca se exponen.

## 10. E2E mínimo

```text
Owner crea aggregate
→ canonical Civitas state
→ bootstrap/provider projection
→ receipt
→ Admin reanuda step 3/section exacta
→ handoff finding
→ request review
→ Owner genera/aprueba/ejecuta
→ publicación
→ receipt actor-aware
```

Debe ejecutarse con dos organizaciones y pruebas cross-tenant, incluyendo provider binding mismatch.

## 11. Portability gates

```text
fake Identity Provider without Logto concepts
Logto adapter parity
canonical IDs survive provider swap
ambiguous binding fails closed
provider failure/retry/DLQ
revocation or approval change after enqueue
no direct provider SDK in onboarding domain
```

## 12. Resultado actual

```text
Document Consistency:                 PASS_DOCUMENT_CONSISTENCY_WITH_IDP_REBASE
Identity/Governance foundations:      PENDING
Repository Compliance:               NOT_IMPLEMENTED
Production:                           NO_GO
```
