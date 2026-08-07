# CIVITAS Tenant Resolution — paquete reconciliado

## Estado

```text
Contrato estático:              PASS_CONTRACT_STATIC_WITH_TR_00A
Identity provider portability:  PASS_DOCUMENTAL / EXECUTABLE_PENDING
PostgreSQL real:                NOT_RUN
Integración repositorio:        NOT_IMPLEMENTED
Producción:                     NO_GO
```

El paquete está listo para iniciar la fase de implementación, no para desplegarse directamente.

## Precedencia normativa

Para cualquier contradicción relacionada con autoridad de identidad o acoplamiento al proveedor:

```text
00A provider-neutral identity rebase
→ 00 contrato canónico
→ documentos derivados 10..96
```

Las referencias históricas a Logto describen la implementación activa o su perfil de compatibilidad; no convierten a Logto en autoridad canónica de tenant, organizationId, subjectId, membership o autorización.

## Contratos

- `00A` enmienda normativa provider-neutral para identidad/OIDC.
- `00` contrato canónico de Tenant Resolution.
- `10` state machine.
- `20A` OpenAPI Tenant BFF.
- `20B` OpenAPI Owner.
- `20` vista OpenAPI combinada.
- `30` esquema SQL integrado con `operational_tenants`.
- `31` políticas RLS ejecutables.
- `35` integración con `didaxus/civitas10`.
- `40` edge, TLS, proxy, puertos y CORS.
- `50` backend/BFF, CSRF y enforcement.
- `60` sesión/OIDC; consume Platform Identity Provider y usa el perfil Logto activo actualmente.
- `70` UI, route registry y acceso multi-organización.
- `80` pruebas de seguridad.
- `90` consistency gate.
- `95` informe de reconciliación.
- `96` plan TR-000 a TR-013; `TR-006` se interpreta según `00A`.

## Foundations consumidas

```text
#342 Platform Identity Provider foundation
#344 canonical provider bindings
#345 CanonicalAuthContext / provider token adapters
#346 IdentityProviderAdapter capability boundary
```

## Gates

```text
node scripts/tenant-resolution/contract-check.mjs
node scripts/tenant-resolution/postgres-check.mjs
node scripts/tenant-resolution/edge-check.mjs
node scripts/tenant-resolution/ui-check.mjs
```

El gate PostgreSQL requiere `TENANT_RESOLUTION_TEST_DATABASE_URL`. Los gates de edge y UI requieren `REPO_ROOT`.

Antes de producción se agregan como gates obligatorios: provider/tenant mismatch, binding ambiguo fail-closed, fake-provider portability, Logto parity y pruebas cross-tenant de dos organizaciones.