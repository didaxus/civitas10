# CIVITAS — Consistency Check de Tenant Resolution

**Código:** TR-90  
**Estado:** Gate ejecutable de paquete  
**Comando de referencia:** `python check-contract.py`

---

## 1. Objetivo

Comprobar:

```text
00 contrato
↔ 10 state machine
↔ 20 OpenAPI
↔ 30 SQL
↔ 40 edge
↔ 50 backend/BFF
↔ 60 session/OIDC
↔ 70 UI
↔ 80 security tests
```

---

## 2. Namespace

Todos los documentos deben usar:

```text
{tenantSlug}.portal.didaxus.com
*.portal.didaxus.com
```

Fallar si el contrato tenant utiliza como formato vigente:

```text
{tenantSlug}.didaxus.com
```

Servicios centrales permanecen fuera del namespace portal.

---

## 3. OpenAPI

Comprobar:

- YAML 3.1 válido;
- `/api/tenant/context`;
- 200, 404, 423 y 503;
- no-store headers;
- `/api/auth/sign-in`;
- `/api/auth/handoff`;
- `/api/auth/session`;
- `/api/auth/sign-out`;
- endpoints Owner de reserve/activate/block/retire;
- hostname change run create/get/execute/cancel;
- reserved slugs;
- `TenantSlug` de 3–63;
- hostname pattern `.portal.didaxus.com`.

---

## 4. State machine

Estados canónicos:

```text
Hostname:
reserved active redirecting retired blocked

Organization:
provisioning active restricted_active suspended deactivated

Bootstrap:
resolving active locked not_found unavailable

Session:
created active stale_context revoked expired

Hostname change:
draft validating approved executing redirecting completed blocked failed cancelled
```

Fallar ante estados no documentados o divergentes.

---

## 5. Redirect policy

Debe existir:

```text
GET/HEAD seguro → 307
mutación/path/query sensible → 409 TENANT_HOST_MOVED
SNI/Host/:authority mismatch → 421 TENANT_AUTHORITY_MISMATCH
```

Fallar si algún documento permite redirect automático de:

```text
POST
PUT
PATCH
DELETE
/api
/callback
/auth
code
state
token
```

---

## 6. SQL

Comprobar:

- `organization_id` en tablas tenant;
- `UNIQUE (organization_id, id)` antes de FKs compuestas;
- unique global de slug y hostname;
- índice de un primary active por organización;
- self-FK redirect same-organization;
- change runs;
- tenant sessions;
- auth transactions;
- handoff tickets;
- contextVersion;
- sessionBindingVersion;
- consumo atómico del handoff;
- no reutilización de slug histórico.

---

## 7. Edge

Debe definir:

- Cloudflare `*.portal`;
- TLS `*.portal.didaxus.com`;
- Tunnel catch-all 404;
- Traefik v3 wildcard;
- ports privados;
- eliminación de forwarding headers no confiables;
- authority parser formal;
- SNI/Host mismatch tests;
- no `trust proxy = true`.

---

## 8. Session/OIDC

Debe definir:

```text
auth.didaxus.com
auth-callback.didaxus.com/callback
handoff POST
__Host-civitas_session
SameSite=Strict
PKCE S256
state ligado al hostname
```

Fallar si el contrato objetivo usa wildcard tenant callback.

---

## 9. Backend

Debe separar enforcement:

```text
Level A
Level B
Level C
Level D
```

Debe definir:

- cache tenant-bound;
- no stale fallback;
- repositories tenant-scoped;
- RLS o defensa equivalente;
- TenantExecutionContext interno;
- invalidación de sesiones BFF;
- outbox;
- retries y DLQ.

---

## 10. UI

Debe cumplir:

- bootstrap antes de sesión/router;
- no parsing hostname→organizationId;
- no localStorage authority;
- no tenant selector;
- rutas visibles sin organizationId;
- 404 neutral;
- 423 fijo;
- no tenant callback React route;
- branding después de TenantContext.

---

## 11. Seguridad

El plan debe cubrir:

- Host Header Injection;
- SNI/Host mismatch;
- cache poisoning;
- cross-tenant session/route/resource;
- RLS;
- jobs sin hostname;
- redirect method preservation;
- OIDC replay;
- handoff replay;
- cookie injection;
- hostname change;
- E2E con dos tenants.

---

## 12. Manifest

El checker genera:

```json
{
  "status": "PASS",
  "namespace": "*.portal.didaxus.com",
  "documents": [],
  "openapiPaths": [],
  "sqlTables": [],
  "states": {},
  "requiredControls": [],
  "executedAt": "..."
}
```

---

## 13. Salida

Éxito:

```text
[tenant-resolution-contract] PASS
```

Fallo:

```text
[tenant-resolution-contract] FAIL
- missing 423 response
- old tenant namespace found
- SQL single active primary index missing
```

---

## 14. Condición de aprobación

El paquete solo es congelable cuando:

1. todos los documentos existen;
2. OpenAPI parsea;
3. SQL conserva constraints tenant-bound;
4. callback central está congelado;
5. redirect policy es segura;
6. UI no actúa como autoridad;
7. security test plan cubre multi-host;
8. el checker termina en PASS.

---

## 15. Acceso a múltiples organizaciones

El checker debe exigir:

```text
organization-provided URL is the default entry
no organization switcher inside tenant portal
secondary Civitas discovery is optional and separate
secondary discovery is not Core Manager
secondary discovery is not embedded in Organization Portal
full navigation to the selected tenant hostname
independent host-only session per organization
```

Debe fallar si algún documento afirma:

- que Civitas es la puerta predeterminada para todas las organizaciones;
- que el Organization Portal contiene selector de tenants;
- que una sesión tenant cambia de organización;
- que la superficie secundaria comparte cookies o sesión entre hostnames;
- que el usuario necesita la superficie secundaria para usar su portal.

## 15. Semantic checks reconciliados

El checker debe validar semántica, no solo presencia de palabras:

### OpenAPI

- seguridad por operación (`sessionCookie`, `bearerAuth` o anónimo);
- headers no-store en todas las respuestas `/api/auth/*`;
- `TenantLockedProblem.code = TENANT_LOCKED`;
- métodos, responses, idempotencia y reautenticación;
- operaciones Owner de block/retire con 409.

### SQL

- campos completos del handoff;
- mapping status/access_mode;
- orden old redirecting antes de new active;
- trigger diferido de primary y redirect target;
- prohibición de retire directo active;
- integración con `integration_outbox_events`, `audit_logs` e `idempotency_records`;
- ejecución PostgreSQL registrada por separado.

### State/UI

- lifecycle AuthHandoff;
- salida recuperable de `blocked`;
- mismatch fuera del bootstrap;
- TenantRouteRegistry cubre rutas profundas.

El manifest incluye:

```text
states
operations
sqlConstraints
semanticChecks
postgresExecution
```

## 17. Gate Node y validación semántica

El gate canónico es Node y no depende de PyYAML:

```text
scripts/tenant-resolution/contract-check.mjs
scripts/tenant-resolution/postgres-check.mjs
scripts/tenant-resolution/edge-check.mjs
scripts/tenant-resolution/ui-check.mjs
```

Los OpenAPI del paquete se serializan en sintaxis JSON válida como YAML 1.2, por lo que el checker usa `JSON.parse` sin dependencia externa.

Debe validar semánticamente:

- método y operationId;
- security por operación;
- no-store por cada respuesta auth;
- código único `TENANT_LOCKED`;
- CSRF en mutaciones cookie-authenticated;
- metadata `x-civitas-*`;
- split BFF/Owner;
- campos y consumo de handoff;
- constraints de primary/redirect;
- mapping status/access_mode;
- integración con tablas existentes;
- RLS ejecutable;
- 409 vs 421;
- route registry;
- estados y transiciones.

El manifest incluye `states`, `operations`, `sqlConstraints`, `semanticChecks`, `postgresExecution` y `repositoryIntegration`.
