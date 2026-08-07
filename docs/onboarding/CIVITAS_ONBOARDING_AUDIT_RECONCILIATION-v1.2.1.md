# Reconciliación de auditoría — Onboarding Civitas v1.2.1

## 1. Fuente reconciliada

La auditoría UX v1.2.0 aprobó la orientación general, pero bloqueó la implementación directa por ocho P0 de navegación y seis P1 de interacción, idioma y salida.

Esta reconciliación se lee además bajo `ONB-00A`, que corrige la autoridad Logto-first del contrato original sin reemplazar las decisiones UX válidas.

## 2. Decisiones preservadas

```text
Flujo actual:
FUNCIONA
SE CONSERVA
SE REUTILIZA
SE INTEGRA COMO BOOTSTRAP
```

No se elimina `runCanonicalOrganizationProvisioning()` ni la creación temprana de organización, administradores, memberships, roles, drafts, contactos o segmentación inicial.

La preservación es **funcional**, no una congelación del acoplamiento al provider. El bootstrap se interpreta como:

```text
canonical Civitas onboarding/organization/subject state
→ desired identity state
→ seat/entitlement gate
→ persisted operation/outbox
→ IdentityProviderAdapter
→ active provider (Logto today)
```

Los IDs externos del provider se persisten como bindings/evidence y no reemplazan `organizationId`, `subjectId` ni la membership/access canónica de Civitas.

## 3. P0 reconciliados

1. breadcrumbs distintos por superficie;
2. parent/resume/exit routes completos;
3. registry jerárquico para sections y findings;
4. navegación interna route-backed;
5. índice Owner y relación con Organization Directory;
6. contador por pasos aplicables;
7. comportamiento de steps blocked/conditional/complete;
8. acciones protegidas ligadas a decisiones backend y Action Registry, no a role-name inference.

## 4. P1 reconciliados

1. blocker CTA role-aware mediante decisión backend;
2. semántica de autosave/guardar/continuar;
3. destino Save and exit por actor;
4. subsecciones del paso Organización y portal;
5. acción principal del receipt;
6. política visible de idioma español.

## 5. Hallazgos que permanecen como implementación

No se consideran contradicciones documentales, pero permanecen abiertos en el repositorio:

- canonical provider bindings #344;
- `IdentityProviderAdapter` #346 y Logto adapter parity;
- aggregate y rutas reales;
- BFF host-local;
- APIs y migrations;
- navegación generada desde registry;
- Authorization Decision Envelope/Action Registry ejecutables;
- Organization Model/Predicate/Segmentation/Scope Assignment services permanentes;
- ETag y autosave real;
- worker revalidation para operaciones async;
- responsive probado;
- fake-provider portability;
- E2E multi-actor y multi-tenant.

## 6. Estado

```text
Document Consistency:                PASS_DOCUMENT_CONSISTENCY_WITH_IDP_REBASE
UX Navigation blockers:             0 pendientes en contrato
Tenant Resolution compatibility:    PASS_CONTRACT_WITH_TR_00A
Identity/Governance foundations:    PENDING
Repository Compliance:              NOT_IMPLEMENTED
Foundation/UI-0 design:              GO_DOCUMENTAL
Producción:                          NO_GO
```

## 7. Interpretación

> La auditoría no obliga a reemplazar el bootstrap existente. Obliga a conservar su valor funcional mientras se mueve la materialización externa detrás de `IdentityProviderAdapter` y se mantienen organización, identidad, membership, Governance y autorización como autoridad canónica de Civitas. El onboarding completo debe además conservar rutas, orientación, retorno, permisos y navegación suficientemente precisos para que dos implementadores no produzcan experiencias incompatibles.
