# CIVITAS — Implementación Backend y BFF de Tenant Resolution

**Código:** TR-50  
**Estado:** Contrato técnico  
**Implementa:** contrato, state machine, OpenAPI, SQL y edge contract  
**No define:** componentes React ni copy visual

---

## 1. Objetivo

Implementar una cadena de resolución y enforcement que:

```text
effectiveHost
→ clasificación
→ registry lookup
→ organization state
→ TenantContext
→ sesión
→ membership
→ ruta
→ recurso
```

y que falle de forma cerrada ante cualquier inconsistencia.

---

## 2. Orden de middleware

```text
1. RequestIdMiddleware
2. TrustedIngressBoundary
3. EffectiveAuthorityParser
4. PlatformOrTenantHostnameClassifier
5. TenantResolutionMiddleware
6. PublicBootstrapOrRedirectPolicy
7. SessionMiddleware
8. MembershipMiddleware
9. RouteTenantEnforcement
10. ResourceTenantEnforcement
11. Authorization
12. Handler
13. Audit/metrics completion
```

No debe resolverse sesión antes de conocer el tenant para solicitudes del Organization Portal.

---

## 3. Clasificador

```ts
type HostnameClassification =
  | { kind: "platform"; serviceKey: string }
  | { kind: "tenant_candidate"; tenantSlug: string }
  | { kind: "unknown" };
```

El clasificador:

- compara primero hostnames exactos de plataforma;
- luego aplica el patrón tenant;
- nunca consulta por coincidencia parcial;
- no extrae organizationId desde el slug;
- no crea registros.

---

## 4. Tenant resolver

Entrada:

```ts
type ResolveTenantInput = {
  effectiveHost: string;
  requestId: string;
  now: Date;
};
```

Salida interna:

```ts
type TenantResolutionResult =
  | { kind: "active"; context: TenantContext }
  | { kind: "redirecting"; redirect: SafeRedirectDecision }
  | { kind: "locked"; messageCode: "tenant_locked" }
  | { kind: "not_found" }
  | { kind: "unavailable"; retryAfterSeconds?: number };
```

Lookup:

```text
exact hostname
+ hostname status
+ organization status
+ context version
```

La respuesta pública nunca distingue unknown, blocked, retired o deactivated.

---

## 5. Caché interna

Key:

```text
tenant-resolution:{sha256(normalizedHostname)}
```

Payload:

```text
hostnameId
organizationId
hostnameStatus
organizationStatus
accessMode
contextVersion
expiresAt
```

Reglas:

- validar hostname incluido dentro del valor;
- TTL corto;
- negative cache separado;
- no usar stale data cuando la fuente persistente falla;
- invalidación por outbox/evento;
- delete inmediato ante cambios críticos;
- cache miss consulta Postgres.

Eventos de invalidación:

```text
tenant.hostname.*
tenant.organization_status.*
tenant.context.version_changed
```

---

## 6. Bootstrap público

```http
GET /api/tenant/context
```

No requiere sesión.

Debe:

1. usar `effectiveHost`;
2. aplicar Nivel A;
3. responder no-store;
4. devolver solo campos públicos;
5. no incluir billing, razón de bloqueo o datos internos;
6. no leer `organizationId` desde query, body o headers.

---

## 7. Enforcement por niveles

### Nivel A

```text
effectiveHost
= registry hostname active
+ organization status permitido
```

### Nivel B

Después de autenticación:

```text
session.organizationId
= context.organizationId

session.hostnameId
= context.hostnameId

session.contextVersion
= context.contextVersion

membership active
```

### Nivel C

Rutas internas con organizationId:

```text
route.organizationId
= context.organizationId
```

### Nivel D

Repositorio:

```text
resource.organizationId
= context.organizationId
```

Si falla cualquier nivel:

```text
deny
audit
cancel downstream work
no autocorrection
```

---

## 8. Middleware de contextVersion

Header opcional:

```http
X-Civitas-Tenant-Context-Version: 17
```

Reglas:

- ausente: permitido según endpoint;
- igual: continúa;
- menor o mayor: `409 TENANT_CONTEXT_STALE`;
- manipulado: nunca cambia TenantContext;
- no se reescribe contexto desde el header.

La sesión también conserva `contextVersion`.

---

## 9. Política de redirect

Función:

```ts
decideHostnameRedirect({
  method,
  pathname,
  queryKeys,
  oldHostname,
  targetHostname,
  redirectExpiresAt,
})
```

Resultado:

```ts
type SafeRedirectDecision =
  | { action: "redirect"; status: 307; location: string }
  | { action: "host_moved"; status: 409; canonicalHost: string }
  | { action: "not_found"; status: 404 };
```

Reglas:

- redirect solo GET/HEAD;
- no `/api`, `/auth`, callbacks, recovery, invite;
- no query sensible;
- target obtenido de FK same-organization;
- path preservado solo si es seguro;
- query preservada únicamente mediante allowlist;
- fuera de ventana: 404.

---

## 10. Invalidación de sesiones en hostname change

Transacción:

```text
lock organization tenant state
→ crear/activar nuevo hostname
→ old active a redirecting
→ revocar sessions old hostname
→ incrementar sessionBindingVersion
→ incrementar contextVersion
→ outbox
→ audit
→ commit
```

Las respuestas desde el host anterior también pueden expirar su cookie local:

```http
Set-Cookie: __Host-civitas_session=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Strict
```

La revocación server-side es la autoridad.

---

## 11. Repositorios tenant-scoped

Contrato base:

```ts
interface TenantScopedRepository<T> {
  getById(context: TenantExecutionContext, id: string): Promise<T | null>;
  list(context: TenantExecutionContext, query: Query): Promise<T[]>;
  create(context: TenantExecutionContext, input: CreateInput): Promise<T>;
  update(context: TenantExecutionContext, id: string, patch: Patch): Promise<T>;
}
```

Reglas:

- `organizationId` no se acepta dentro de input funcional;
- el repositorio lo toma del contexto;
- toda query incluye organizationId;
- lectura cross-tenant devuelve 404 o denegación neutral;
- Owner usa un repositorio y capacidad separados.

---

## 12. RLS y roles de base

Roles:

```text
civitas_tenant_runtime
civitas_owner_runtime
civitas_tenant_resolver
civitas_worker_runtime
civitas_migrator
```

`civitas_tenant_runtime`:

- establece `app.organization_id`;
- no puede cambiarlo durante la transacción;
- está sujeto a RLS.

`civitas_tenant_resolver`:

- SELECT mínimo sobre hostname registry y organization state;
- no accede a recursos funcionales.

`civitas_owner_runtime`:

- acceso global explícito;
- toda operación auditada;
- no reutilizado por endpoints tenant.

---

## 13. TenantExecutionContext interno

```ts
type TenantExecutionContext = {
  organizationId: string;
  source: "hostname" | "owner_operation" | "job" | "event" | "resource";
  contextVersion: number;
  correlationId: string;
  issuedAt: string;
  principalId?: string;
  signature?: string;
};
```

### Jobs

El payload contiene:

```text
organizationId
resourceId
contextVersion
correlationId
signature
```

El worker:

1. verifica firma;
2. carga recurso con composite key;
3. verifica organizationId;
4. crea contexto interno;
5. ejecuta repositorio tenant-scoped.

No acepta headers HTTP como contexto.

---

## 14. Cambio de hostname

El change run valida:

- slug;
- reservas;
- no reutilización;
- TLS para wildcard;
- router edge disponible;
- estado actual activo;
- ausencia de otro run abierto;
- target exacto;
- ventana de 30 días;
- impacto de sesiones.

Owner UI debe mostrar:

```text
hostname actual
hostname nuevo
sesiones que serán revocadas
fecha de fin de redirect
rutas que no serán redirigidas
riesgo de links antiguos
```

Ejecución atómica e idempotente.

---

## 15. Estado de organización

El resolver consulta una fuente canónica:

```text
organization_tenant_states
```

Mapeo:

```text
active → full
restricted_active → restricted
provisioning/suspended → 423
deactivated → 404
```

La lógica funcional de qué mutaciones permite `restricted_active` pertenece a autorización, pero TenantContext debe exponer `accessMode`.

---

## 16. Errores canónicos

```text
TENANT_SPACE_NOT_FOUND
TENANT_LOCKED
TENANT_RESOLUTION_UNAVAILABLE
TENANT_CONTEXT_STALE
TENANT_SESSION_TENANT_MISMATCH
TENANT_ROUTE_MISMATCH
TENANT_RESOURCE_MISMATCH
TENANT_HOST_MOVED
TENANT_AUTHORITY_MISMATCH
TENANT_HOSTNAME_ALREADY_USED
TENANT_SLUG_RESERVED
TENANT_HOSTNAME_CHANGE_IN_PROGRESS
TENANT_EXECUTION_CONTEXT_INVALID
```

---

## 17. Auditoría

Registrar:

```text
requestId
actorId
organizationId
hostnameId
effectiveHost
enforcementLevel
sessionId hash
routeOrganizationId
resourceOrganizationId
decision
reason
timestamp
```

No registrar:

- cookies;
- authorization header;
- code/state/nonce;
- handoff plaintext;
- tokens.

---

## 18. Métricas

```text
tenant_resolution_duration_ms
tenant_resolution_cache_hit_total
tenant_resolution_cache_miss_total
tenant_resolution_negative_cache_hit_total
tenant_context_stale_total
tenant_session_binding_mismatch_total
tenant_route_mismatch_total
tenant_resource_mismatch_total
tenant_hostname_change_total
tenant_session_revocation_total
```

---

## 19. Outbox

Eventos del hostname, sesión y contexto se escriben dentro de la transacción.

Consumers:

- cache invalidator;
- session revoker;
- redirect expiry worker;
- audit projector;
- alerting;
- observability.

No publicar antes del commit.

---

## 20. Retry y DLQ

Colas:

```text
tenant-hostname-change
tenant-hostname-redirect-expiry
tenant-session-revocation
tenant-context-cache-invalidation
tenant-security-alert
```

Política inicial:

```text
retries: 5
backoff: exponencial con jitter
idempotency: obligatoria
DLQ: obligatoria
```

---

## 21. Pruebas backend

- parser de authority;
- exact match;
- unknown 404;
- blocked/retired 404 indistinguible;
- 423 único;
- redirect GET/HEAD;
- 409 TENANT_HOST_MOVED para mutaciones y paths sensibles;
- query allowlist;
- contextVersion;
- Level A-D;
- session revocation;
- RLS;
- job context;
- cache poisoning;
- negative cache;
- outbox recovery;
- idempotencia.

---

## 23. Frontera de la superficie secundaria de descubrimiento

La entrada secundaria mediante Civitas + SSO se considera una superficie independiente del Tenant Resolution v1 del Organization Portal.

El Backend/BFF tenant no debe implementar:

- listado global de organizaciones dentro del portal;
- cambio de tenant sobre la sesión activa;
- sesión compartida entre hostnames;
- endpoint tenant que devuelva organizaciones alternativas;
- redirect interno hacia otro tenant sin navegación completa.

Una futura superficie de descubrimiento puede devolver únicamente destinos autorizados para la identidad autenticada. Al elegir un destino, debe producir una navegación completa al hostname tenant; el BFF de destino vuelve a validar TenantContext, identidad y membership antes de crear su propia sesión host-only.

La existencia de esa superficie es opcional y no modifica el acceso normal comunicado por cada organización.

---

## 24. Definición final

> El Backend/BFF convierte un `effectiveHost` validado por el ingress en un TenantContext autoritativo, lo vincula a sesión y membership, y exige coincidencia con ruta y recurso. La resolución pública, la autenticación y los procesos internos utilizan contratos distintos pero convergen en el mismo organizationId tenant-bound.

## 23. Reglas reconciliadas de hostname primary y outbox

### Bloqueo y retiro

```text
block primary active
→ exige organizationTransition = suspended | deactivated
  o un replacement active en la misma transacción
→ en otro caso 409
```

```text
retire active
→ prohibido
→ 409
```

La validación final se ejecuta mediante constraint trigger diferido para asegurar:

- exactamente un primary active cuando la organización está `active` o `restricted_active`;
- target active/primary de la misma organización para todos los aliases `redirecting`.

### Outbox global

Se reutiliza el outbox global de Civitas identificado contractualmente como:

```text
integration_outbox_events
```

El writer se invoca dentro de la misma transacción que modifica hostname, sesión, handoff o contextVersion. Los consumers usan `event_id`/idempotency key y el mismo envelope global; no existe un outbox privado de Tenant Resolution.

### No-store de autenticación

Toda respuesta de `/api/auth/*`, incluidos 4xx, 410 y 204, incorpora `private, no-store` y `Pragma: no-cache`.

## 24. Compatibilidad con la arquitectura actual

No se modifica el Core Manager para convertirlo en portal tenant.

```text
Core Manager actual
→ conserva SPA, bearer y rutas Owner

Tenant BFF nuevo
→ resuelve hostname
→ mantiene sesión cookie
→ invoca application services existentes
```

`requireOrg` no se reutiliza como resolver. Se separan:

```text
TenantResolutionMiddleware
SessionTenantEnforcement
RouteTenantEnforcement
ResourceTenantEnforcement
```

La API central `/api/v1/o/{organizationId}/...` continúa existiendo internamente.

---

## 25. CSRF y same-origin

Para mutaciones autenticadas:

```text
Origin exacto
Sec-Fetch-Site same-origin
X-CSRF-Token ligado a sessionId
Content-Type allowlist
sessionCookie válida
```

El token CSRF se rota al crear/reautenticar sesión y no se guarda en localStorage. El BFF compara mediante tiempo constante.

`POST /api/auth/handoff` queda fuera de este mecanismo y se gobierna por su ticket atómico de un solo uso.

CORS:

- no middleware `cors()` global sobre el tenant-bff;
- no wildcard de subdominios;
- respuestas same-origin sin ACAO por defecto;
- preflight no esperado para el cliente normal.

---

## 26. Reutilización de fundaciones

```text
organizationId → operational_tenants.id
outbox → integration_outbox_events
audit → audit_logs
idempotency → idempotency_records
```

Las escrituras de estado, outbox y auditoría comparten transacción. No se crean tablas generales paralelas.

---

## 27. RLS ejecutable

Cada transacción del runtime tenant ejecuta:

```sql
BEGIN;
SET LOCAL app.organization_id = '<uuid>';
-- repositorios tenant-scoped
COMMIT;
```

Las tablas de sesión/transacción tienen `ENABLE` y `FORCE ROW LEVEL SECURITY`. El pool no usa `SET` persistente.

---

## 28. Topología de despliegue

```text
organization-portal-frontend
→ contenido estático

tenant-bff
→ /api/* y callback central

central-api
→ application services

worker
→ contextos firmados
```

API, BFF y workers permanecen en red privada y usan `expose`, no `ports` públicos.
