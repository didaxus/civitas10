# CIVITAS — Contrato canónico de Tenant Resolution

**Código:** TR-00  
**Estado:** Congelable para implementación  
**Autoridad:** fuente superior del paquete Tenant Resolution  
**Fase:** Tenant Resolution v1  
**Namespace tenant:** `{tenantSlug}.portal.didaxus.com`

---

## 1. Precedencia documental

```text
00 Contrato canónico
→ 10 State machine
→ 20A Tenant BFF OpenAPI + 20B Owner OpenAPI
→ 20 OpenAPI combinado de referencia
→ 30 SQL de esquema + 31 RLS
→ 35 Integración con el repositorio
→ 40 Edge Contract
→ 50 Backend/BFF
→ 60 Session/OIDC
→ 70 UI
→ 80 Security Tests
→ 90 Consistency Check
→ 95 Reconciliación de auditoría
→ 96 Plan de implementación
```

Los documentos derivados implementan este contrato y no pueden redefinirlo.

---

## 2. Propósito

Tenant Resolution establece la frontera de aislamiento entre organizaciones antes de montar autenticación, sesión, autorización, branding, cachés, navegación, módulos y acceso a recursos.

Para toda solicitud externa dirigida al Organization Portal, el hostname efectivo es el selector primario e inmutable del tenant.

Los procesos internos sin hostname deben recibir un `TenantExecutionContext` explícito y verificable. Nunca pueden inventar el tenant desde input libre.

---

## 3. Namespace canónico

Los portales organizacionales utilizan exclusivamente:

```text
{tenantSlug}.portal.didaxus.com
```

Ejemplos:

```text
colegio1.portal.didaxus.com
instituto-norte.portal.didaxus.com
fundacion-educativa.portal.didaxus.com
```

Servicios de plataforma:

```text
civitas.didaxus.com         → Civitas Core Manager
auth.didaxus.com            → Logto
auth-callback.didaxus.com   → callback OIDC central
courses.didaxus.com         → Moodle
matomo.didaxus.com          → Matomo
webmail.didaxus.com         → Webmail
assets.didaxus.com          → assets Didaxus
```

Separación:

```text
*.portal.didaxus.com
= exclusivamente Organization Portals

*.didaxus.com
= servicios centrales
```

No se admiten dominios personalizados en Tenant Resolution v1.

---

## 4. Clasificación previa del hostname

Antes de resolver un tenant, el sistema clasifica el hostname:

```text
PlatformHostname
TenantHostname
UnknownHostname
```

- `PlatformHostname`: coincidencia exacta con un servicio central registrado.
- `TenantHostname`: coincide con el patrón tenant y debe buscarse exactamente en el registro autoritativo.
- `UnknownHostname`: cualquier otro hostname.

Un wildcard DNS, TLS, Tunnel o Traefik transporta solicitudes, pero no crea ni autoriza tenants.

---

## 5. Patrón tenant

Formato exacto:

```text
<slug>.portal.didaxus.com
```

El slug:

- tiene entre 3 y 63 caracteres;
- usa `a-z`, `0-9` y `-`;
- no empieza ni termina en `-`;
- es globalmente único;
- nunca se reasigna después de haber sido utilizado.

Rechazar:

```text
portal.didaxus.com
colegio1.didaxus.com
a.b.portal.didaxus.com
colegio1.portal.didaxus.com.evil.com
portal.colegio1.didaxus.com
```

---

## 6. Registro autoritativo

Entidad:

```text
OrganizationHostname
```

Regla:

```text
una organización
→ exactamente un hostname primary active
→ cero o más aliases históricos redirecting o retired
```

Estados:

```text
reserved
active
redirecting
retired
blocked
```

`blocked`, `retired` e inexistente son externamente indistinguibles y responden 404.

El `redirectTargetHostname` debe referenciar el hostname primary active de la misma organización.

---

## 7. Slugs reservados

Lista mínima dentro del namespace portal:

```text
www
api
admin
owner
support
status
login
logout
auth
callback
assets
cdn
mail
security
privacy
legal
portal
```

La lista puede ampliarse por Owner. Una reserva nunca crea un tenant.

---

## 8. Resolución pública y niveles de enforcement

### Nivel A — Resolución pública

Aplicable antes del login:

```text
effectiveHost
→ hostname registry
→ organization operational status
→ TenantContext público
```

No exige sesión ni membership.

### Nivel B — Sesión autenticada

```text
hostname tenant
=
session tenant
=
membership activa
```

### Nivel C — API con organizationId interno

```text
hostname tenant
=
session tenant
=
route organizationId
```

### Nivel D — Recurso tenant-bound

```text
hostname tenant
=
session tenant
=
route tenant
=
resource.organizationId
```

Una validación de nivel inferior no reemplaza los niveles posteriores.

---

## 9. TenantContext

```ts
type TenantContext = {
  organizationId: string;
  tenantSlug: string;
  hostname: string;
  hostnameId: string;
  hostnameStatus: "active";
  organizationStatus: "active" | "restricted_active";
  accessMode: "full" | "restricted";
  contextVersion: number;
  resolvedAt: string;
  requestId: string;
};
```

`contextVersion` es monotónica y cambia cuando se modifica:

- binding hostname-organización;
- hostname primary;
- estado del hostname;
- estado operativo de la organización;
- política de sesión;
- política de acceso que afecta al bootstrap.

El header de versión es un hint de obsolescencia. Nunca selecciona ni cambia el tenant.

---

## 10. Estados operativos de organización

```text
provisioning
active
restricted_active
suspended
deactivated
```

| Estado | Bootstrap | Login | Lectura | Mutaciones |
|---|---:|---:|---:|---:|
| `provisioning` | 423 | no | no | no |
| `active` | 200 | sí | sí | sí |
| `restricted_active` | 200 | sí | sí | solo capacidades permitidas |
| `suspended` | 423 | no | no | no |
| `deactivated` | 404 | no | no | no |

Para `provisioning` y `suspended`, la UI muestra:

> **Contacte al administrador de su organización.**

No se revelan razones internas.

---

## 11. Endpoint de bootstrap

```http
GET /api/tenant/context
```

Propiedades:

- same-origin;
- no recibe slug ni organizationId;
- se resuelve desde el hostname efectivo;
- disponible antes de autenticación;
- `Cache-Control: private, no-store`;
- `Pragma: no-cache`;
- no usa un tenant cacheado como fallback autoritativo.

Respuestas:

```text
200 active/restricted_active
404 unknown/blocked/retired/deactivated
423 provisioning/suspended
503 registry o infraestructura no disponible
```

---

## 12. Política de redirección por cambio de hostname

Ventana:

```text
30 días
```

### Redirect automático permitido

Solo:

```text
GET
HEAD
```

y únicamente para navegación ordinaria sin rutas o parámetros sensibles.

Respuesta:

```text
307 Temporary Redirect
```

### No redirect automático

Métodos:

```text
POST
PUT
PATCH
DELETE
```

Rutas:

```text
/api/*
/callback
/auth/*
/oidc/*
/sign-in
/sign-out
/recovery/*
/invite/*
```

Parámetros sensibles:

```text
code
state
token
id_token
access_token
refresh_token
invite
email
returnTo
signature
expires
```

En estos casos el BFF responde:

```text
409 Conflict
code: TENANT_HOST_MOVED
canonicalHost: <hostname canónico validado>
```

El cliente no repite automáticamente el método ni el cuerpo. Debe abrir el hostname canónico y reiniciar expresamente la operación.

`421 Misdirected Request` queda reservado exclusivamente para discrepancias reales de autoridad o conexión, por ejemplo SNI/Host o `:authority` incompatibles detectados en edge/BFF.

No se conserva automáticamente una query sensible.

---

## 13. Sesión

Cookie BFF:

```http
Set-Cookie: __Host-civitas_session=...;
  Path=/;
  Secure;
  HttpOnly;
  SameSite=Strict
```

Prohibido:

```text
Domain=.didaxus.com
Domain=.portal.didaxus.com
```

La sesión se vincula a:

```text
organizationId
hostnameId
contextVersion
sessionBindingVersion
```

Cambiar el slug invalida en el BFF todas las sesiones asociadas al binding anterior. Una navegación completa no sustituye esta invalidación.

`SameSite=Strict` debe superar pruebas E2E de federación antes de producción.

---

## 14. Estrategia OIDC congelada

Callback central:

```text
https://auth-callback.didaxus.com/callback
```

Flujo:

```text
tenant portal inicia login
→ BFF crea AuthTransaction
→ state + nonce + PKCE ligados al tenant hostname
→ Logto auth.didaxus.com
→ callback central exacto
→ valida code/state/nonce
→ crea handoff de un solo uso
→ POST firmado al tenant /auth/handoff
→ BFF tenant consume handoff
→ establece __Host-civitas_session
→ redirige a ruta interna segura
```

No se usan wildcard redirect URIs como contrato objetivo.

No se acepta `returnTo` arbitrario. Solo rutas internas allowlisted.

---

## 15. API same-origin

Cada portal consume:

```text
https://<slug>.portal.didaxus.com/api/...
```

La API interna puede conservar rutas con `organizationId`, pero ese valor es una restricción adicional y nunca la fuente primaria.

---

## 16. Caché

### HTTP público

Inicialmente:

```http
Cache-Control: private, no-store
Pragma: no-cache
```

para HTML bootstrap, `/api/tenant/context`, `/auth/*`, respuestas mismatch y respuestas suspended.

### Caché interna

Clave:

```text
tenant-resolution:{normalizedHostname}
```

Debe incluir:

```text
organizationId
hostnameId
hostnameStatus
organizationStatus
contextVersion
expiresAt
```

Negative caching para hostnames inexistentes usa TTL corto y configurable.

Debe invalidarse ante cualquier cambio de hostname u organización.

---

## 17. Proxy y autoridad efectiva

La aplicación no confía en headers de forwarding aportados por el cliente.

Contrato:

```text
Cloudflare
→ TLS/SNI y DNS

Cloudflare Tunnel
→ transporte privado

Traefik
→ router exacto/wildcard
→ elimina Forwarded/X-Forwarded-Host/X-Civitas-Effective-Host entrantes
→ conserva Host/:authority validado

BFF ingress
→ acepta tráfico solo desde Traefik confiable
→ parsea autoridad con parser formal
→ crea effectiveHost inmutable
```

No se permite:

```js
app.set("trust proxy", true)
```

Debe configurarse con hops o CIDRs exactos cuando sea necesario para IP cliente, sin usarlo para elegir tenant.

---

## 18. DNS, TLS y routing

Cloudflare DNS:

```text
CNAME *.portal → <TUNNEL_UUID>.cfargotunnel.com
Proxy: Proxied
```

TLS obligatorio:

```text
*.portal.didaxus.com
```

Debe cubrirse mediante Total TLS, certificado Advanced o certificado personalizado.

Traefik v3:

```text
Host(`*.portal.didaxus.com`)
```

El BFF aplica además el patrón exacto de un solo label tenant.

No se crea un registro DNS o router por organización.

---

## 19. Procesos internos

```ts
type TenantExecutionContext = {
  organizationId: string;
  source:
    | "owner_operation"
    | "job"
    | "event"
    | "resource"
    | "hostname";
  contextVersion: number;
  correlationId: string;
  issuedAt: string;
  signature?: string;
};
```

Workers, outbox consumers y cron jobs:

- reciben contexto desde un recurso tenant-bound o envelope firmado;
- validan organizationId en cada lookup;
- nunca aceptan un `X-Tenant-ID` libre;
- no se consideran exentos de aislamiento.

---

## 20. Persistencia y capa de datos

Controles:

- `organization_id` no nullable;
- foreign keys compuestas;
- repositorios tenant-scoped;
- PostgreSQL RLS obligatorio para tablas tenant runtime; excepciones de control plane requieren rol separado, privilegios mínimos y auditoría;
- rol Owner separado y auditado;
- tests contra queries sin filtro;
- ninguna operación interna queda exenta por defecto.

---

## 21. UI

Orden obligatorio:

```text
tenant bootstrap
→ configuración auth
→ sesión
→ autorización
→ branding publicado
→ shell
→ módulos
```

Antes de resolver tenant, solo se muestra branding Didaxus/Civitas neutral.

Las rutas visibles del portal no contienen `organizationId`.

---

## 22. Observabilidad

Métricas:

```text
tenant_resolution_success_total
tenant_resolution_not_found_total
tenant_resolution_locked_total
tenant_resolution_unavailable_total
tenant_resolution_mismatch_total
tenant_redirect_total
tenant_authority_mismatch_total
cross_tenant_access_denied_total
```

No registrar cookies, tokens ni códigos OIDC.

---

## 23. Custom domains

```text
Tenant Resolution v1:
solo *.portal.didaxus.com

Custom domains:
fase futura independiente
```

---

## 24. Acceso y descubrimiento de múltiples organizaciones

### Entrada predeterminada

La URL de acceso la comunica cada organización. Civitas no funciona como directorio principal ni como puerta predeterminada para todos los portales.

Cada organización entrega independientemente su propia entrada:

```text
https://colegio1.portal.didaxus.com
https://instituto-norte.portal.didaxus.com
```

La organización puede publicar o distribuir la URL mediante:

- su página web institucional;
- su portal interno o intranet;
- el correo de bienvenida o invitación;
- enlaces enviados por administradores y docentes;
- códigos QR;
- marcadores;
- documentación institucional.

Cuando una persona pertenece a más de una organización, cada organización le comunica de forma independiente la URL de su portal.

### Regla del Organization Portal

El Organization Portal:

- no incluye selector de organizaciones;
- no permite cambiar silenciosamente de tenant;
- no contiene links automáticos hacia otros tenants;
- no comparte sesión, membership, roles, scopes ni recovery entre organizaciones;
- no convierte una cuenta organizacional en una identidad global.

Cada organización se abre mediante una navegación completa a su hostname y conserva una sesión `host-only` independiente.

### Entrada secundaria por Civitas

Civitas podrá ofrecer una superficie pública secundaria de recuperación o descubrimiento de portales mediante SSO.

Esta alternativa:

- no es la entrada predeterminada;
- no pertenece al Civitas Core Manager de Owner;
- no aparece dentro de los Organization Portals;
- no funciona como selector embebido dentro de un tenant;
- no sustituye los enlaces institucionales;
- no crea una sesión compartida entre organizaciones;
- no permite cambiar de tenant sin navegación completa;
- no convierte a Civitas en la puerta usual de todas las organizaciones.

Flujo conceptual:

```text
usuario no recuerda la URL
→ entra a una superficie pública secundaria de Civitas
→ usa SSO
→ Civitas identifica los portales disponibles para esa identidad
→ usuario elige una organización
→ navegación completa al hostname organizacional
→ el BFF de ese hostname crea una sesión independiente
```

La superficie secundaria requiere un contrato, threat model y lifecycle propios. No se implementa silenciosamente dentro del Organization Portal ni modifica la autoridad del hostname.

Regla final:

```text
Entrada predeterminada:
enlace comunicado por la organización

Entrada secundaria:
Civitas + SSO para recuperar o localizar el portal

Cambio de organización dentro del portal:
no permitido
```

---

## 25. Definición final

> En solicitudes externas al Organization Portal, Civitas determina el tenant desde un hostname efectivo validado con el formato `{tenantSlug}.portal.didaxus.com`. El hostname se comprueba contra un registro autoritativo y se refuerza posteriormente con sesión, membership, ruta y ownership del recurso. Los procesos internos reciben un contexto tenant explícito. No existe selección manual de tenant, no se comparten sesiones entre organizaciones y toda discrepancia falla de forma cerrada.

## 25. Reconciliación de sesión, locking y hostname primary

### Seguridad HTTP

- las operaciones Owner utilizan el esquema Bearer/JWT de la superficie administrativa;
- `GET /api/auth/session` y `POST /api/auth/sign-out` utilizan exclusivamente la cookie `__Host-civitas_session`;
- `sign-in`, `handoff` y bootstrap no heredan Bearer;
- todas las respuestas `/api/auth/*`, incluidos errores, usan `Cache-Control: private, no-store` y `Pragma: no-cache`.

### Respuesta 423

La respuesta externa utiliza únicamente:

```text
TENANT_LOCKED
```

`provisioning` y `suspended` solo se distinguen en auditoría, Core Manager y observabilidad restringida.

### Hostname primary

- una organización `active` o `restricted_active` conserva exactamente un primary `active` al finalizar cada transacción;
- bloquear el único primary exige suspender/deactivar la organización o activar un reemplazo en la misma transacción;
- un hostname `active` no se retira directamente;
- todo hostname `redirecting` apunta al primary `active` de la misma organización.

### Outbox

Tenant Resolution reutiliza las fundaciones existentes de Civitas: `operational_tenants` como identidad organizacional canónica, `integration_outbox_events` para outbox, `audit_logs` para auditoría e `idempotency_records` para idempotencia. No crea una segunda organización canónica, otro outbox, otro ledger general de idempotencia ni otro sistema de auditoría.

## 26. Arquitectura compatible con `didaxus/civitas10`

Tenant Resolution es una fase independiente y no reemplaza superficialmente la SPA existente.

```text
civitas.didaxus.com
→ Core Manager SPA existente
→ @logto/react / bearer
→ operaciones Owner y globales

{slug}.portal.didaxus.com
→ Organization Portal nuevo
→ tenant-bff
→ cookie host-only
→ API same-origin

auth-callback.didaxus.com
→ callback central del tenant-bff
```

Se conserva:

- Core Manager actual;
- API central `/api/v1/o/{organizationId}/...`;
- catálogo de capacidades y autorización RBAC/PBAC/ABAC;
- `operational_tenants`;
- `audit_logs`;
- `integration_outbox_events`;
- `integration_inbox_receipts`;
- `integration_dead_letters`;
- `idempotency_records`.

El Organization Portal no expone `organizationId` en sus URLs, hooks o API pública. El BFF invoca la misma application layer con un `TenantExecutionContext` validado.

---

## 27. Protección CSRF del BFF

`SameSite=Strict` no reemplaza una defensa CSRF porque los subdominios hermanos de `didaxus.com` son cross-origin pero pueden continuar siendo same-site.

Todas las mutaciones autenticadas por cookie deben exigir simultáneamente:

```text
Origin exacto = https://<tenant>.portal.didaxus.com
Sec-Fetch-Site = same-origin
X-CSRF-Token ligado a la sesión
Content-Type allowlisted
cookie __Host-civitas_session válida
```

Excepciones cerradas:

```text
POST /api/auth/handoff
→ handoff de un solo uso
→ targetHostname exacto
→ CSP form-action exacta
→ consumo atómico

webhooks
→ firma propia
→ nunca cookie de sesión
```

No se permite CORS wildcard para `*.portal.didaxus.com`. Las rutas BFF son same-origin y no emiten `Access-Control-Allow-Origin` por defecto.

---

## 28. OpenAPI y estado de implementación

El contrato HTTP se separa en:

```text
20A-CIVITAS-TENANT-BFF-OPENAPI.yaml
→ bootstrap, sign-in, handoff, session y sign-out
→ sessionCookie + CSRF

20B-CIVITAS-TENANT-OWNER-OPENAPI.yaml
→ registry, cambios de hostname y slugs reservados
→ bearer + capacidades Owner
```

`20-CIVITAS-TENANT-RESOLUTION-OPENAPI.yaml` es una vista combinada generada para revisión.

Todas las operaciones incluyen metadata `x-civitas-*` y permanecen con estado `planned` hasta integrarse en el OpenAPI compuesto del repositorio.

---

## 29. Persistencia y RLS compatibles con el repositorio

`organization_tenant_states.organization_id` referencia `operational_tenants.id` y usa UUID. El paquete no crea tablas paralelas de auditoría, outbox o idempotencia.

Las tablas de sesión y transacción tenant usan RLS real:

```text
ENABLE ROW LEVEL SECURITY
FORCE ROW LEVEL SECURITY
organization_id = current_setting('app.organization_id', true)::uuid
```

Cada operación tenant abre una transacción y ejecuta:

```sql
SET LOCAL app.organization_id = '<uuid>';
```

El valor no se persiste en la conexión reutilizable del pool.

---

## 30. Topología productiva

Servicios separados:

```text
core-manager-frontend
organization-portal-frontend
tenant-bff
central-api
worker
```

En producción, API, BFF y workers usan redes privadas y `expose`; no publican puertos del host. Cloudflare Tunnel termina únicamente en Traefik.

Hasta verificar Traefik 3.7 o superior, el router usa `HostRegexp` exacto. `Host(`*.portal.didaxus.com`)` solo puede habilitarse después de un gate de versión y sintaxis.
