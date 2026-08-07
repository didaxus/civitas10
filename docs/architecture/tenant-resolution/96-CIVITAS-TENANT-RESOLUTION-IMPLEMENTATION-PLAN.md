# CIVITAS — Plan de implementación Tenant Resolution

**Código:** TR-96  
**Estado:** secuencia recomendada para GitHub

```text
TR-000  ADR: separar Core Manager, Organization Portal y Tenant BFF
TR-001  Corregir paquete contractual y gate semántico, incluyendo TR-00A
TR-002  Integrar OpenAPI BFF/Owner con estándares Civitas
TR-003  Integrar SQL con operational_tenants, outbox, audit e idempotencia
TR-004  Implementar edge wildcard, TLS, trusted ingress y puertos privados
TR-005  Implementar registry y TenantResolutionMiddleware
TR-006  Configurar cliente OIDC confidencial del Platform Identity Provider,
        implementar el perfil Logto activo y callback central exacto
TR-007  Implementar sesión BFF, handoff, CanonicalAuthContext y CSRF
TR-008  Implementar enforcement Levels A–D y RLS
TR-009  Crear Organization Portal host-local
TR-010  Migrar navegación visible desde /o/:organizationId
TR-011  Implementar hostname change y revocación de sesiones
TR-012  Añadir observabilidad, Redis rate limiting y negative cache
TR-013  E2E multi-host, provider portability, PostgreSQL gate y production readiness
```

Orden:

```text
TR-000
→ TR-001/TR-002/TR-003
→ TR-004/TR-005
→ TR-006/TR-007
→ TR-008
→ TR-009/TR-010
→ TR-011/TR-012
→ TR-013
```

## Dependencias de foundation

Antes de cerrar TR-006/TR-007 como implementación canónica deben existir los contratos ejecutables de:

```text
#344 canonical provider bindings
#345 CanonicalAuthContext/provider token adapter
#346 IdentityProviderAdapter capability boundary
```

Logto es el perfil activo inicial; no es una dependencia del dominio Tenant Resolution.

## Gates provider-neutral

TR-013 incluye obligatoriamente:

- provider/token organization mismatch contra hostname tenant → fail-closed;
- provider subject binding ambiguo → fail-closed;
- membership/provider binding de tenant A usado contra tenant B → fail-closed;
- fake Identity Provider sin conceptos Logto;
- Logto parity;
- revocación/cambio de membership después de enqueue/handoff pendiente;
- cross-tenant negativos con dos organizaciones.

## Definition of Done de la fase

- Organization Portal y BFF desplegados por wildcard;
- Core Manager intacto durante la migración;
- callback central exacto;
- OIDC consumido mediante frontera provider-neutral;
- CanonicalAuthContext antes de autorización/sesión Civitas;
- CSRF validado;
- cookie host-only;
- OpenAPI compuesto;
- PostgreSQL y RLS probados;
- puertos privados;
- CORS same-origin;
- outbox/audit/idempotencia reutilizados;
- fake-provider portability y Logto parity en verde;
- E2E multi-host y cross-tenant negativos en verde.
