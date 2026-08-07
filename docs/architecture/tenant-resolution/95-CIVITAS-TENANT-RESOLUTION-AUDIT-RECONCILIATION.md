
# CIVITAS — Reconciliación final de bloqueadores y auditoría Tenant Resolution

**Código:** TR-95  
**Fuentes:** auditoría interna de contrato y auditoría contra `didaxus/civitas10`  
**Estado del paquete:** `PASS_CONTRACT_STATIC`  
**Estado del repositorio:** `NOT_IMPLEMENTED`  
**Estado productivo:** `NO-GO` hasta PostgreSQL, edge, OIDC, CSRF y E2E

## 1. Veredicto reconciliado

```text
Contrato documental corregido:          SÍ
P0 internos corregidos:                 7/7
P1 internos corregidos:                 6/6
Arquitectura compatible con repo:       SÍ
Implementación existente en repo:       NO
Gate Node estático:                      PASS
Gate PostgreSQL real:                    NOT_RUN
Producción:                              NO-GO
Inicio de fase TR-000/TR-001:            GO
```

El paquete ya no presenta su `PASS` estático como evidencia de implementación o producción.

## 2. Bloqueadores internos cerrados

1. `sessionCookie` sustituye Bearer en session/sign-out.
2. 423 expone únicamente `TENANT_LOCKED`.
3. El hostname anterior pasa a `redirecting` antes de activar el nuevo primary.
4. Handoff persiste subject, membership y versiones.
5. `access_mode` queda exhaustivamente ligado al status.
6. Block/retire primary falla con 409 sin transición segura.
7. Trigger diferido exige redirect target active/primary de la misma organización.
8. `mismatch` pertenece al runtime boundary.
9. Todas las respuestas auth son no-store.
10. AuthHandoff tiene lifecycle formal.
11. `blocked` de change run es recuperable o cancelable.
12. `TenantRouteRegistry` es la única fuente de rutas.
13. Outbox se integra con la fundación existente.

## 3. Decisiones de estándares reconciliadas

### Mutación en hostname antiguo

```text
GET/HEAD seguro → 307
mutación/ruta sensible → 409 TENANT_HOST_MOVED
SNI/Host mismatch → 421 TENANT_AUTHORITY_MISMATCH
```

Se adopta 409 para impedir que 421 sugiera reintentos automáticos de métodos no idempotentes.

### Cookie y CSRF

La sesión mantiene `__Host-civitas_session; SameSite=Strict`, pero todas las mutaciones añaden Origin exacto, Fetch Metadata, token CSRF y Content-Type allowlist.

### Traefik

Se congela `HostRegexp` hasta verificar Traefik 3.7+ en Coolify. El wildcard `Host()` queda condicionado al edge gate.

## 4. Reconciliación con el repositorio

Se conserva el Core Manager SPA y la API central. Se añaden Organization Portal y tenant-bff como superficies físicas separadas.

```text
operational_tenants       → identidad canónica
integration_outbox_events → outbox
audit_logs                → auditoría
idempotency_records       → idempotencia
```

No se crean sistemas paralelos.

## 5. OpenAPI

Se separó:

```text
20A Tenant BFF
20B Owner
20 combinado de referencia
```

Owner usa bearer y metadata `x-civitas-*`; session usa cookie; sign-out exige cookie + CSRF.

## 6. SQL y RLS

- IDs organizacionales UUID con FK a `operational_tenants.id`;
- eliminadas tablas paralelas de auditoría/idempotencia;
- integración transaccional con fundaciones existentes;
- políticas RLS reales en TR-31;
- handoff completo;
- triggers de lifecycle;
- consumo atómico.

## 7. Pendientes que no pueden declararse resueltos documentalmente

1. ejecutar TR-30 y TR-31 contra PostgreSQL real;
2. integrar specs en `contracts/openapi/civitas-api.yaml`;
3. verificar esquema exacto de writers existentes;
4. confirmar versión de Traefik/Coolify;
5. crear aplicación Logto Traditional Web;
6. implementar BFF y CSRF;
7. separar builds y servicios;
8. aplicar RLS a tablas funcionales tenant;
9. ejecutar E2E multi-host;
10. cerrar puertos públicos en compose productivo.

## 8. Estado final

```text
[tenant-resolution-contract] PASS_CONTRACT_STATIC
[tenant-resolution-postgres] NOT_RUN
[tenant-resolution-repository] NOT_IMPLEMENTED
[tenant-resolution-production] NO_GO
```
