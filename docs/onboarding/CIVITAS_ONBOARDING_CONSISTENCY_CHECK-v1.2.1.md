# Consistency / Contract Check — Onboarding Civitas v1.2.1

**Documentos revisados:**

- `00A-CIVITAS-ONBOARDING-IDP-NEUTRAL-REBASE.md` — enmienda normativa provider-neutral.
- `00-CIVITAS-ORGANIZATION-ONBOARDING-AND-ACTIVATION-v1.2.1.md` — contrato canónico base.
- `CIVITAS_ARCHITECTURE_REVIEW_ONBOARDING_BACKEND-v1.2.1.docx` — perfil backend derivado.
- `CIVITAS_ARCHITECTURE_REVIEW_ONBOARDING_UI-v1.2.1.docx` — perfil UI/UX derivado.
- `CIVITAS_ONBOARDING_UX_NAVIGATION_AUDIT-v1.2.0.md` — auditoría independiente reconciliada.

## Precedencia de identidad/Governance

Ante contradicción sobre autoridad de organización, subject, membership, provider o materialización:

```text
ONB-00A
→ contrato canónico base
→ reviews/audits derivados
```

Los `.docx` son snapshots de revisión y no pueden restaurar semántica Logto-first que contradiga ONB-00A.

## Resultado ejecutivo

```text
Contradicciones UX/navegación pendientes:       0
Contradicciones provider-neutral sin resolver:  0 por precedencia ONB-00A
Bloqueadores UX P0 pendientes:                   0
Hallazgos UX P1 pendientes:                      0
Tenant Resolution compatibility:                 PASS_CONTRACT
Identity/Governance executable dependencies:     PENDING
Repository Compliance:                           NOT_IMPLEMENTED
Estado:                                           PASS_DOCUMENT_CONSISTENCY_WITH_IDP_REBASE
```

Este resultado demuestra coherencia documental después del rebase de autoridad. No afirma que `didaxus/civitas10` haya implementado bindings canónicos, `IdentityProviderAdapter`, Predicate Engine, Scope Assignment, rutas, aggregate, BFF, migraciones o E2E.

## Matriz de reconciliación de autoridad

| Contradicción anterior | Decisión normativa | Estado |
|---|---|:---:|
| Logto como autoridad canónica de organización/membership | Civitas conserva `organizationId`, `subjectId` y membership/access canónicos; Logto es provider activo. | RESUELTO |
| `logtoOrganizationId` como identificador de dominio | Provider ID solo como binding externo verificado. | RESUELTO |
| Provider membership como membership universal | Provider membership ID es binding/evidence opcional; autorización consume membership canónica. | RESUELTO |
| Bootstrap directo a Logto como modelo de dominio | `runCanonicalOrganizationProvisioning()` orquesta estado Civitas y proyección por `IdentityProviderAdapter`. | RESUELTO |
| Crear provider organization = completar onboarding | Compleción exige lifecycle Civitas aprobado/activado/publicado y convergencia requerida. | RESUELTO |
| Onboarding materializa Data Scope directamente | Solo #331 puede materializar `authorization_scope_assignments`. | RESUELTO |
| Onboarding mantiene engines IAM propios | Consume Organization Model, Predicate, Segmentation, Scope Assignment y AUTH foundations permanentes. | RESUELTO |

## Matriz de reconciliación UX

| Hallazgo | Decisión v1.2.1 | Estado |
|---|---|:---:|
| Breadcrumb único para ambos actores | Breadcrumbs distintos para Owner y Administrador de la organización. | RESUELTO |
| `parentRoute` sin valores | Matriz de parent/resume/exit por tipo de pantalla. | RESUELTO |
| Registry solo modelaba steps | Schema jerárquico con sections, findings, shortcuts y breadcrumb segments. | RESUELTO |
| Pasos complejos sin navegación interna | `OnboardingSectionNavigator` route-backed. | RESUELTO |
| Entrada Owner ambigua | Índice principal `/owner/organization-onboardings`; detail link al mismo aggregate. | RESUELTO |
| `not_applicable` y contador | Ocho pasos visibles; progreso por pasos aplicables. | RESUELTO |
| Click en blocked/conditional/complete | Comportamiento de apertura, mutación e invalidación congelado. | RESUELTO |
| Permisos no enlazados al registry | Backend Authorization Decision Envelope + Action Registry gobiernan acciones; UI no infiere por role name. | RESUELTO |
| CTA blocker inaccesible | CTA role-aware o solicitud de intervención. | RESUELTO |
| Autosave/guardar/continuar ambiguos | Semántica diferenciada y durable. | RESUELTO |
| Destino Save and exit | Owner a summary; tenant admin a `/settings`. | RESUELTO |
| Paso 1 demasiado amplio | Cinco sections internas. | RESUELTO |
| Receipt sin prioridad | Acción principal actor-aware y secundarias por capacidad. | RESUELTO |
| Copy mixto español/inglés | Política de idioma español con mapping obligatorio. | RESUELTO |

## Invariantes verificadas

- El flujo actual se conserva como bootstrap/orquestador, no como autoridad Logto-first.
- `organizationId` canónico y provider organization binding no se confunden.
- `subjectId` y membership/access canónicos sobreviven un cambio de Identity Provider.
- Tenant Resolution gobierna `tenantSlug`, `hostnameId` y el portal host-local.
- Provider claims/IDs no cambian el tenant resuelto.
- Onboarding consume servicios Governance permanentes y no crea un Predicate/Segmentation/Scope engine paralelo.
- Solo Scope Assignment #331 puede materializar `authorization_scope_assignments`.
- Teacher, Student y Parent siguen fuera del onboarding; no se afirma consistencia global de sus workspaces.
- La UI no usa `navigate(-1)` como única salida.
- El step rail mantiene ocho pasos y distingue los no aplicables.
- Un plan aprobado queda stale si se reabre una etapa o cambia una dependencia que lo afecta.
- Organization Admin puede revisar y solicitar, pero no aprobar ni ejecutar acciones Owner-only.

## Gates pendientes de ejecución

```text
#344 canonical provider bindings
#346 IdentityProviderAdapter
#348-#351 authorization/evidence/publish contracts
#352-#356 Governance boundaries/reconciliation
fake-provider portability
Logto parity
two-tenant adversarial onboarding
async revocation/precondition revalidation
```

## Veredicto

> v1.2.1 + ONB-00A es documentalmente consistente para foundation, rutas y descomposición UI-0. La implementación productiva continúa en NO-GO hasta que Identity/Governance foundations, Repository Compliance, PostgreSQL, autorización y E2E multi-actor/multi-tenant reporten PASS.