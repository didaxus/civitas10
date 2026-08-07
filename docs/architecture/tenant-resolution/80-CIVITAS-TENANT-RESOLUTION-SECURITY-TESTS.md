# CIVITAS — Security and Isolation Test Plan for Tenant Resolution

**Código:** TR-80  
**Estado:** Gate de seguridad previo a producción  
**Objetivo:** demostrar aislamiento entre tenants en edge, BFF, sesión, API, base, caché, jobs y UI

---

## 1. Principio

El paquete no está listo por compilar. Debe demostrar:

```text
tenant1
≠ tenant2
```

en cada capa y ante inputs adversariales.

---

## 2. Entornos de prueba

Hostnames mínimos:

```text
tenant1.portal.didaxus.test
tenant2.portal.didaxus.test
unknown.portal.didaxus.test
old-tenant1.portal.didaxus.test
blocked.portal.didaxus.test
```

Organizaciones:

```text
org_tenant1
org_tenant2
```

Usuarios:

```text
user_tenant1_only
user_tenant2_only
user_both_but_independent_sessions
owner_global
```

Recursos:

```text
resource_tenant1
resource_tenant2
```

---

## 3. Edge y Host Header

Casos:

```text
SNI tenant1 + Host tenant1
SNI tenant1 + Host tenant2
SNI tenant1 + Host attacker.com
Host duplicado
Host con coma
Host con espacios
Host con tab
Host con CR/LF
Host con userinfo
Host IP literal
Host con puerto inválido
HTTP/2 :authority distinto de Host
Forwarded malicioso
X-Forwarded-Host malicioso
X-Civitas-Effective-Host malicioso
```

Expectativa:

- solo la combinación válida llega al resolver;
- headers aportados por cliente se eliminan;
- discrepancias se rechazan;
- no hay redirect controlado por attacker;
- no existe fallback al primer virtual host.

---

## 4. Normalización

Probar:

```text
Tenant1.PORTAL.DIDAXUS.TEST
tenant1.portal.didaxus.test.
tenant1.portal.didaxus.test.:443
tenant1.portal.didaxus.test:443
a.b.portal.didaxus.test
tenant1.portal.didaxus.test.evil.com
portal.tenant1.didaxus.test
tenant1.didaxus.test
```

El parser usa una librería de authority, no `split(":")`.

---

## 5. Registry

- exact match tenant1;
- exact match tenant2;
- wildcard sin registro → 404;
- blocked → 404;
- retired → 404;
- deactivated → 404;
- suspended → 423;
- provisioning → 423;
- restricted_active → 200 restricted;
- dos active primary bloqueados por DB;
- slug histórico no reasignable;
- redirect target de otra organización rechazado;
- reserved slug rechazado.

---

## 6. Cache isolation

### HTTP cache

Probar que:

```text
tenant1 /api/tenant/context
```

nunca aparece en tenant2.

Verificar:

```http
Cache-Control: private, no-store
Pragma: no-cache
Vary: Host
```

Casos:

- Cloudflare cache;
- Traefik middleware cache;
- CDN rule accidental;
- browser back/forward;
- service worker inexistente o aislado.

### Redis/cache interna

- key incluye hash de hostname;
- payload incluye hostname y organizationId;
- valor con tenant incorrecto se invalida;
- negative cache corto;
- activar hostname invalida negative cache;
- cambio de status invalida cache;
- fallo Redis consulta DB;
- fallo DB no usa stale como autoridad.

---

## 7. Redirect safety

### Permitidos

```text
GET /settings/governance
HEAD /
```

desde host antiguo durante ventana:

```text
307
Location: nuevo host
```

### Bloqueados

```text
POST /api/...
PUT /api/...
PATCH /api/...
DELETE /api/...
GET /callback
GET /auth/handoff
GET /recovery/token
GET /invite/token
GET /?code=...
GET /?state=...
GET /?token=...
GET /?returnTo=...
```

Expectativa:

```text
409 TENANT_HOST_MOVED
```

No se repite método ni cuerpo.

Probar:

- path traversal;
- query encoding doble;
- keys con mayúsculas;
- array query;
- `%63ode`;
- query duplicada;
- fragment no enviado al servidor;
- target FK de misma organización.

---

## 8. Bootstrap público

- no requiere sesión;
- no exige membership;
- no acepta organizationId;
- ignora headers tenant;
- 200 solo active/restricted_active;
- 404 neutral;
- 423 único;
- 503 fail closed;
- no-store;
- no incluye billing ni razón interna;
- no incluye IDs de otro tenant.

---

## 9. Enforcement Level B

- cookie tenant1 en host tenant1;
- cookie tenant1 no enviada a tenant2;
- copiar cookie manualmente a tenant2 no crea sesión válida;
- session organization mismatch;
- session hostnameId mismatch;
- contextVersion stale;
- sessionBindingVersion stale;
- membership revoked;
- membership de otra organización;
- sesión expirada;
- sesión revocada por cambio de hostname.

Todos deben denegar sin cambiar tenant.

---

## 10. Enforcement Level C

```text
Host tenant1
Session tenant1
Route organizationId tenant2
```

Debe denegar y auditar.

Casos:

- URL path;
- query;
- body;
- GraphQL variables si aplica;
- batch endpoints;
- websocket subscribe;
- SSE stream.

---

## 11. Enforcement Level D

```text
Host tenant1
Session tenant1
Route tenant1
Resource tenant2
```

Probar:

- read;
- update;
- delete;
- nested resource;
- bulk operation;
- export;
- search;
- count;
- aggregation;
- background report.

Respuesta neutral y evento de seguridad.

---

## 12. PostgreSQL y repositorios

- `organization_id` requerido;
- composite FK;
- query sin context falla;
- RLS evita tenant2;
- Owner role separado;
- resolver role no lee recursos funcionales;
- worker role requiere context;
- migrator no usado en runtime;
- transaction no puede cambiar `app.organization_id`;
- SQL injection no modifica context;
- views y functions respetan tenant.

---

## 13. Jobs, events y outbox

- job sin organizationId;
- organizationId manipulado;
- signature inválida;
- resourceId de otro tenant;
- contextVersion stale;
- replay;
- duplicate delivery;
- DLQ reprocess;
- cron global iterando tenants;
- owner operation convertida en tenant job.

Ningún worker se considera confiable por ser interno.

---

## 14. OIDC

Probar:

```text
state fixation
state replay
state expirado
code replay
nonce mismatch
PKCE mismatch
issuer mismatch
audience mismatch
algoritmo no permitido
callback host injection
returnPath externo
target hostname unknown
target hostname retired
contextVersion stale
membership revoked
```

El callback exacto debe ser:

```text
auth-callback.didaxus.com
```

No aceptar wildcard tenant callback.

---

## 15. Handoff

- handoff de tenant1 enviado a tenant2;
- handoff expirado;
- handoff consumido;
- handoff modificado;
- targetHostname distinto;
- hostnameId distinto;
- organizationId distinto;
- replay concurrente;
- form-action injection;
- referer leakage;
- cache del HTML;
- CSP relajada.

Solo una solicitud puede consumir el handoff.

---

## 16. Cookies

Verificar:

```text
nombre __Host-civitas_session
Secure
HttpOnly
Path=/
sin Domain
SameSite=Strict
```

Casos:

- subdomain cookie injection;
- cookie con mismo nombre y Path distinto;
- cookie antigua tras hostname change;
- logout;
- browser restart;
- sesión paralela tenant1/tenant2;
- social connector;
- enterprise SSO;
- callback central;
- handoff POST.

---

## 17. Hostname change

- slug reservado;
- slug usado históricamente;
- run concurrente;
- TLS no disponible;
- router no disponible;
- nuevo hostname activado;
- anterior redirecting;
- exactamente un primary active;
- sesiones revocadas;
- auth transactions revocadas;
- 30 días;
- expiry worker idempotente;
- old GET 307;
- old POST 409 TENANT_HOST_MOVED;
- old callback 409 TENANT_HOST_MOVED;
- después de expiry 404;
- old slug no reasignable.

---

## 18. UI

- bootstrap antes de sesión;
- no flash de tenant anterior;
- no localStorage authority;
- no `hostname.split`;
- no route organizationId;
- 404 sin login;
- 423 copy fijo;
- 503 retry limitado;
- mismatch limpia caches;
- branding solo después de active;
- no selector;
- no links a otros tenants;
- no tenant callback React route.

---

## 19. Rate limiting y enumeration

- miles de subdominios aleatorios;
- distribución por IP;
- misma IP contra muchos hosts;
- mismo host desde muchas IPs;
- bypass con mayúsculas;
- bypass con trailing dot;
- IPv6;
- HTTP/2 multiplexing;
- negative cache poisoning.

El ataque a unknown hosts no debe degradar tenants activos.

---

## 20. Observabilidad

Cada denegación debe producir:

```text
requestId
effectiveHost
enforcementLevel
decision
reason
```

Sin:

- cookies;
- tokens;
- state;
- handoff;
- PII innecesaria.

Alertas:

- mismatch repetido;
- host header injection;
- cross-tenant resource attempts;
- handoff replay;
- change run failure;
- cache contamination.

---

## 21. Performance

Objetivos iniciales:

```text
resolver cache hit p95 < 10 ms
resolver DB hit p95 < 75 ms
bootstrap p95 < 250 ms dentro de región
```

Probar:

- cold cache;
- Redis unavailable;
- DB degraded;
- 1000 unknown hosts/min;
- 100 tenants activos;
- invalidación masiva.

La seguridad no se desactiva para mejorar latencia.

---

## 22. Production readiness

No-GO si falla cualquiera:

```text
Host/SNI isolation
cache isolation
cookie host-only
OIDC state binding
handoff one-time
Level C/D enforcement
session revocation
single active primary
redirect safety
RLS/repository isolation
multi-host E2E
```

---

## 23. Evidencias

CI debe conservar:

- resultados unitarios;
- E2E multi-host;
- report de headers;
- manifest de OpenAPI;
- report SQL constraints;
- screenshots de estados;
- traces de callback sin secretos;
- report de consistency check.

---

## 25. Acceso a múltiples organizaciones

Probar:

- tenant1 comunica su propia URL;
- tenant2 comunica una URL distinta;
- no existe selector dentro de tenant1;
- no existe link automático tenant1 → tenant2;
- una sesión de tenant1 no se reutiliza en tenant2;
- abrir tenant2 crea o exige su propia sesión host-only;
- el acceso directo por URL funciona sin launcher global;
- la superficie secundaria, si existe, no pertenece al Core Manager;
- la superficie secundaria no se embebe en Organization Portal;
- elegir una organización produce navegación completa;
- el launcher no transfiere cookies, roles, scopes ni recovery state;
- manipular el destino elegido no permite abrir un tenant no autorizado;
- la ausencia del launcher no rompe el acceso normal.

Gate:

```text
no organization switcher inside tenant portal
organization-provided URL is the default entry
secondary Civitas discovery is optional and separate
cross-organization session reuse is impossible
```

---

## 26. Definición final

> Tenant Resolution se aprueba para producción únicamente cuando las pruebas demuestran que un hostname, sesión, ruta, recurso, cache entry, job o handoff de una organización no puede ser reutilizado para acceder a otra organización.

## 25. Casos de reconciliación P0/P1

### OpenAPI/session

- session y sign-out aceptan `sessionCookie`, no Bearer;
- sign-in y handoff no heredan Bearer;
- todas las respuestas `/api/auth/*` incluyen no-store;
- 423 expone únicamente `TENANT_LOCKED`.

### SQL lifecycle

- `restricted_active + full` falla;
- `suspended + full` falla;
- `deactivated + full` falla;
- handoff sin subject/membership/versiones falla;
- consumo con contextVersion o sessionBindingVersion distinto falla;
- hostname change mueve old a redirecting antes de activar new;
- commit con dos primary falla;
- commit con cero primary para org active/restricted falla;
- redirect target no active/primary falla;
- retire directo de active falla;
- block primary sin transición de organización o reemplazo falla.

### UI

- bootstrap no contiene mismatch;
- runtime boundary procesa 409 TENANT_HOST_MOVED;
- todas las rutas profundas están en TenantRouteRegistry;
- breadcrumbs y menú usan el mismo registry.

## 26. CSRF y sibling subdomains

Probar mutaciones con:

- cookie válida sin CSRF token;
- token incorrecto;
- token de otra sesión;
- `Origin` de otro tenant;
- `Origin` de un servicio hermano;
- `Sec-Fetch-Site: same-site`;
- `Sec-Fetch-Site` ausente según política;
- `text/plain` y form simple;
- preflight inesperado;
- CORS wildcard;
- takeover simulado de sibling subdomain.

Solo se acepta:

```text
Origin exacto
Sec-Fetch-Site same-origin
CSRF token correcto
Content-Type permitido
```

El handoff se prueba como excepción independiente.

---

## 27. 409 frente a 421

```text
old hostname + mutación
→ 409 TENANT_HOST_MOVED
→ no auto-retry

SNI/Host/:authority mismatch
→ 421 TENANT_AUTHORITY_MISMATCH
→ rechazo en edge/BFF
```

Probar que ningún cliente repite automáticamente un body no idempotente por recibir la señal de hostname movido.

---

## 28. Integración con el repositorio

Gates negativos:

- creación de un segundo outbox;
- creación de otra tabla canónica de organización;
- ledger de idempotencia paralelo;
- auditoría paralela;
- organization_id que no referencia `operational_tenants.id`;
- API/worker con `ports` públicos;
- `cors()` global en tenant-bff;
- aplicación Logto SPA usada por el BFF;
- OpenAPI Owner sin metadata `x-civitas-*`.
