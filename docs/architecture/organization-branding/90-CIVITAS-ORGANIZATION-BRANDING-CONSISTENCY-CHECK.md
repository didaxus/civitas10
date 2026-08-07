# CIVITAS — Consistency check del paquete de branding

**Código:** BRAND-90  
**Estado:** Gate contractual

## Precedencia provider-neutral

El gate incluye `BRAND-00A` como enmienda normativa para superficies de login pertenecientes al Platform Identity Provider.

```text
BRAND-00A provider projection
→ BRAND-00 canonical branding contract
→ derivados 10..60
```

`BRAND-00A` no cambia la autoridad del dominio: Civitas sigue siendo source of truth de draft, asset references, publication, validation, rollback y runtime health.

## Verifica

```text
Contrato
↔ Provider projection amendment
↔ State machine
↔ OpenAPI
↔ SQL
↔ Backend
↔ UI
↔ UX
```

## Checks base

- OpenAPI parsea y resuelve referencias.
- Estados coinciden.
- SQL es tenant-bound.
- UI no implementa backend.
- UX no expone jerga técnica.
- ValidationRun y publicación respetan lifecycle.

## Checks provider-neutral adicionales

- `BrandPublication` sigue siendo la autoridad canónica aunque el provider soporte branding.
- La proyección al Identity Provider es capability-driven y no una dependencia Logto del dominio.
- Provider organization IDs son bindings externos, nunca branding primary keys.
- La proyección valida que el binding corresponde al mismo `organizationId` canónico.
- Tenant A nunca puede proyectar branding al provider organization de tenant B.
- Provider projection failure no cambia `BrandPublication.active` ni ejecuta rollback implícito.
- Un provider sin branding support deja la publicación Civitas válida.
- Secretos/credentials del provider no aparecen en APIs/UI de Branding.
- La implementación Logto, cuando exista, vive detrás de `IdentityProviderAdapter` y mantiene parity sin transferir autoridad.

Comando base:

```text
npm run branding:contract-check
```

Salida esperada del gate existente:

```text
[branding-contract] PASS
```

Estado de integración provider-neutral hasta que #346 sea ejecutable:

```text
Branding contract:             PASS
Provider projection contract: PASS_DOCUMENTAL
Provider adapter tests:        PENDING
Production:                    NO_GO
```

## Gate final

Antes de producción deben añadirse pruebas ejecutables de:

```text
fake provider without branding capability
Logto projection parity
provider outage/retry/idempotency
cross-tenant provider binding mismatch
publication remains active on projection failure
```
