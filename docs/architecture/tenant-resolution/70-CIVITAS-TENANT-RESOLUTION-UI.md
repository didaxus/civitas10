# CIVITAS — Implementación UI de Tenant Resolution

**Código:** TR-70  
**Estado:** Contrato frontend  
**Documento fuente:** `00-CIVITAS-TENANT-RESOLUTION.md`  
**Stack objetivo:** React 19, TypeScript, React Router, Vite 8 y Tailwind CSS 4  
**No implementa:** DNS, trusted proxy, resolver backend, sesiones server-side, OIDC callback central, RLS ni redirects de infraestructura

---

## 1. Propósito

La UI del Organization Portal consume un `TenantContext` autoritativo y no monta autenticación, autorización, branding, cachés, navegación ni módulos antes de que el backend confirme un tenant activo.

Namespace:

```text
{tenantSlug}.portal.didaxus.com
```

---

## 2. Principio

```text
hostname del navegador
→ GET /api/tenant/context
→ TenantContext
→ auth/session
→ authorization
→ branding
→ router
```

Prohibido:

```ts
window.location.hostname.split(".")
```

para derivar slug, organizationId, permisos o configuración.

El hostname puede mostrarse como dato informativo, pero no se convierte en autoridad frontend.

---

## 3. Aplicaciones

### Civitas Core Manager

```text
civitas.didaxus.com
```

No monta el bootstrap tenant.

### Organization Portal

```text
<slug>.portal.didaxus.com
```

Monta `TenantBootstrapBoundary` antes de todos los providers tenant.

---

## 4. Árbol de bootstrap

```text
OrganizationPortalRoot
└── RootFatalErrorBoundary
    └── TenantBootstrapBoundary
        ├── TenantResolvingScreen
        ├── TenantNotFoundScreen
        ├── TenantLockedScreen
        ├── TenantUnavailableScreen
        └── ActiveTenantApplication
            ├── TenantContextProvider
            ├── SessionBoundary
            ├── AuthorizationProvider
            ├── OrganizationBrandProvider
            ├── TenantRuntimeErrorBoundary
            └── OrganizationPortalRouter
```

La configuración de sign-in puede cargarse después de `TenantContext`; el callback OIDC central no es un componente React del tenant.

---

## 5. Endpoint

```http
GET /api/tenant/context
```

No envía:

- slug;
- organizationId;
- hostname;
- tenant header;
- query de selección.

Respuesta activa:

```json
{
  "status": "active",
  "tenant": {
    "organizationId": "org_01J...",
    "tenantSlug": "colegio1",
    "hostname": "colegio1.portal.didaxus.com",
    "hostnameId": "host_01J...",
    "hostnameStatus": "active",
    "organizationStatus": "active",
    "accessMode": "full",
    "contextVersion": 17,
    "resolvedAt": "2026-07-26T02:00:00Z",
    "requestId": "req_..."
  }
}
```

---

## 6. Estado frontend

```ts
export type TenantBootstrapState =
  | { status: "idle" }
  | { status: "resolving" }
  | { status: "active"; context: TenantContext }
  | { status: "not_found"; requestId?: string }
  | { status: "locked"; requestId?: string; retryAfter?: number }
  | { status: "unavailable"; requestId?: string; retryAfter?: number };

export type TenantRuntimeSecurityState =
  | { status: "normal" }
  | { status: "mismatch"; requestId?: string }
  | { status: "session_stale"; requestId?: string }
  | { status: "hostname_moved"; canonicalHostname?: string; requestId?: string };

export type TenantContext = {
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

La redirección 307 debe cerrarse en edge/BFF antes de entregar la SPA. La UI no construye destinos de hostname.

---

## 7. `TenantBootstrapBoundary`

Responsabilidades:

1. ejecutar una única resolución inicial;
2. usar `AbortController`;
3. aplicar timeout;
4. mapear HTTP;
5. montar aplicación solo en 200 válido;
6. ofrecer retry solo en 503;
7. no usar contexto local cacheado como autoridad;
8. no modelar mismatch dentro del bootstrap público; los 409 pertenecen al TenantRuntimeErrorBoundary.

Mapeo:

```text
200 → active
404 → not_found
423 → locked
503 → unavailable
```

---

## 8. Pantalla resolving

Copy:

```text
Preparando su espacio de trabajo
```

Reglas:

- branding Didaxus/Civitas neutral;
- no logo tenant;
- no nombre inferido;
- no login;
- no navegación;
- no módulos.

Tailwind:

```tsx
<main className="grid min-h-screen place-items-center bg-bg px-6 text-text">
  <section className="w-full max-w-md rounded-card border border-border bg-surface p-6 text-center shadow-sm">
    <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-border border-t-primary" />
    <h1 className="mt-4 text-lg font-semibold">
      Preparando su espacio de trabajo
    </h1>
  </section>
</main>
```

---

## 9. 404 neutral

Copy:

```text
Espacio no encontrado
```

Agrupa:

- unknown;
- blocked;
- retired;
- deactivated.

No revela:

- nombre;
- estado interno;
- si existió;
- hostname alternativo;
- selector;
- login genérico.

---

## 10. 423 locked

Copy fijo:

> **Contacte al administrador de su organización.**

Aplica a:

- provisioning;
- suspended.

La UI no distingue la razón.

Puede mostrar:

- cerrar sesión si existe cookie local;
- requestId;
- contacto Didaxus.

No monta módulos.

---

## 11. 503

Copy:

```text
No pudimos preparar el espacio de trabajo.
Intente nuevamente en unos minutos.
```

Reglas:

- respetar `Retry-After`;
- backoff;
- máximo de retries;
- botón manual;
- no montar app parcialmente;
- no usar último tenant conocido.

---

## 12. Mismatch boundary

Se activa ante:

- contextVersion stale;
- session tenant mismatch;
- route mismatch;
- resource mismatch comunicado por API.

Acciones:

```text
cancelar requests
limpiar caches tenant
limpiar autorización
detener módulos
mostrar mensaje genérico
permitir recarga completa
```

Copy:

```text
No fue posible validar el contexto de esta organización.
Recargue la página o contacte soporte.
```

No muestra IDs ajenos.

---

## 13. Rutas visibles

No contienen organizationId:

```text
/
/settings/governance
/settings/governance/access-policy/roles
/settings/governance/access-policy/role-names
/settings/governance/organization-model/structure
/settings/governance/identity-provisioning
/settings/branding
/lms/grades
/lms/groups
```

Retirar del Organization Portal:

```text
/o/:organizationId/*
/:orgId
```

Las rutas Owner continúan con organizationId dentro de Core Manager.

---

## 14. Router

```tsx
function OrganizationPortalRouter() {
  return (
    <Routes>
      <Route element={<OrganizationShell />}>
        <Route index element={<OrganizationDashboardPage />} />
        <Route path="settings/governance" element={<TenantGovernancePage />} />
        <Route path="settings/branding" element={<TenantBrandingPage />} />
        <Route path="lms/grades" element={<TenantGradesPage />} />
        <Route path="lms/groups" element={<TenantGroupsPage />} />
        <Route path="*" element={<PortalNotFoundPage />} />
      </Route>
    </Routes>
  );
}
```

Los componentes obtienen `organizationId` desde `useTenantContext()`.

---

## 15. TenantContextProvider

Reglas:

- solo se monta después de bootstrap;
- valor inmutable durante la página;
- no expone `setTenant`;
- no lee localStorage;
- no implementa selector;
- cambio de hostname requiere navegación completa.

---

## 16. Cliente API

```ts
export function createTenantApiClient(context: TenantContext) {
  return {
    request: <T>(path: string, init?: RequestInit) =>
      request<T>(`/api${path}`, {
        ...init,
        credentials: "same-origin",
        headers: {
          ...init?.headers,
          "X-Civitas-Tenant-Context-Version":
            String(context.contextVersion),
        },
      }),
  };
}
```

El header no elige tenant.

El cliente público no acepta `organizationId` como opción.

---

## 17. Caché frontend

Keys:

```text
["tenant", organizationId, contextVersion, "governance"]
["tenant", organizationId, contextVersion, "lms", "groups"]
["tenant", organizationId, contextVersion, "branding"]
```

Ante mismatch:

- cancelar;
- eliminar keys del tenant;
- no migrar data a otro tenant;
- recargar.

No persistir TenantContext como fallback autoritativo.

---

## 18. Navegación

Usar links locales:

```tsx
<Link to="/settings/governance">Gobernanza</Link>
```

No construir hosts tenant ni rutas `/o/${organizationId}`.

El menú no contiene:

- selector;
- campo slug;
- links a otros tenants;
- link ordinario a `/owner`.

---

## 19. Branding

Antes del bootstrap:

```text
Didaxus/Civitas neutral
```

Después:

```text
OrganizationBrandProvider
→ perfil publicado del tenant resuelto
```

Branding nunca participa en la resolución.

---

## 20. Sesión y sign-in

Orden:

```text
TenantContext activo
→ POST /api/auth/sign-in
→ navegación a Logto
→ callback central
→ handoff POST al BFF tenant
→ cookie creada
→ 303 a ruta local
→ GET /api/auth/session
```

La UI no implementa `/callback` tenant.

Debe existir una pantalla transitoria neutral si el BFF redirige después del handoff.

---

## 21. `SameSite=Strict`

La UI no modifica la cookie.

E2E debe probar:

- login;
- SSO;
- retorno;
- logout;
- sesión después de handoff;
- acceso directo a ruta profunda.

---

## 22. Tailwind

Estados de sistema usan solo tokens Civitas:

```text
bg-bg
bg-surface
text-text
text-muted
border-border
bg-primary
```

No aplicar colores tenant a:

- resolving;
- 404;
- 423;
- 503;
- mismatch;
- root error.

---

## 23. Archivos propuestos

```text
frontend/apps/organization-portal/src/
├── bootstrap/
├── context/
├── routing/
├── shell/
├── states/
├── boundaries/
├── api/
└── tests/
```

Fallback temporal:

```text
frontend/src/tenant-runtime/
```

No duplicar ambas implementaciones.

---

## 24. Gates

```text
no tenant route params
no tenant selector
no localStorage tenant authority
no hostname parsing to organizationId
bootstrap before session/router
same-origin API
semantic Tailwind
no tenant callback route
```

Script:

```text
npm run ui:tenant-resolution:check
```

---

## 25. Pruebas unitarias

- mapeo HTTP;
- timeout y retry;
- provider solo en active;
- 404 sin login;
- 423 sin módulos;
- absence de selector;
- no hostname split;
- rutas sin org params;
- API client sin org selector;
- mismatch limpia caches.

---

## 26. E2E multi-host

```text
colegio1.portal.didaxus.com → tenant1
colegio2.portal.didaxus.com → tenant2
inventado.portal.didaxus.com → 404
retired → 404
blocked → 404
suspended → 423
provisioning → 423
registry unavailable → 503
old safe GET → 307 antes de SPA
old POST → 409 TENANT_HOST_MOVED
cookie tenant1 no enviada a tenant2
context stale → boundary
```

---

## 27. Criterios de aceptación

1. Bootstrap precede a sesión, branding y router.
2. UI no deriva organizationId.
3. Rutas visibles no contienen organizationId.
4. API es same-origin.
5. 404 no filtra estados.
6. 423 usa copy fijo.
7. 503 es recuperable.
8. Mismatch detiene módulos.
9. No existe selector.
10. Preview/branding se monta después de tenant.
11. Tests usan dos hostnames reales del namespace local.
12. No existe callback tenant en React.

---

## 28. Definición final

> El Organization Portal no selecciona ni infiere tenants. Consume un TenantContext same-origin antes de montar sesión, branding, navegación o módulos. Los estados inválidos se representan con superficies neutrales Didaxus/Civitas y cualquier inconsistencia detiene la aplicación sin cambiar de organización.

---

## 29. Core Manager — administración Owner de hostnames

El Core Manager debe incluir una superficie separada del Organization Portal:

```text
/owner/organizations/:organizationId/tenant-hostname
```

Debe mostrar:

```text
hostname primary actual
tenant slug
organization status
contextVersion
sessionBindingVersion
aliases redirecting
aliases retired
fecha de expiración de redirect
sesiones activas que serán revocadas
auditoría
```

### Reserva inicial

Flujo:

```text
Ingresar slug
→ validar formato
→ comprobar reserva e historial
→ previsualizar hostname completo
→ reservar
→ activar
```

Copy:

> El hostname será `{slug}.portal.didaxus.com`. Un slug utilizado no podrá asignarse a otra organización.

### Cambio de hostname

Wizard Owner:

```text
1. Nuevo slug
2. Validación
3. Impacto
4. Confirmación con reautenticación
5. Ejecución y seguimiento
```

La pantalla de impacto debe explicar:

- cierre de sesiones del hostname anterior;
- redirect de navegación GET/HEAD durante 30 días;
- no redirect de APIs, callbacks ni mutaciones;
- retiro definitivo posterior;
- imposibilidad de reutilizar el slug anterior.

Acción principal:

```text
Cambiar hostname e invalidar sesiones
```

No debe presentarse como una edición simple de texto.

### Estados del change run

```text
Borrador
Validando
Listo para ejecutar
Ejecutando
Redirección activa
Completado
Requiere atención
Fallido
Cancelado
```

La UI hace polling al endpoint del run y no simula éxito antes del commit backend.

### Bloqueo y retiro

Las acciones:

```text
Bloquear hostname
Retirar hostname
```

requieren:

- permiso Owner;
- reautenticación;
- razón;
- confirmación;
- preview del impacto;
- auditoría.

La UI Owner puede ver el estado real. La UI pública continúa mostrando 404 neutral.

### Slugs reservados

Superficie:

```text
/owner/settings/reserved-tenant-slugs
```

Permite:

- listar;
- añadir;
- retirar una reserva nunca utilizada;
- mostrar razón y actor.

No permite liberar un slug usado históricamente.

---

## 30. Acceso a múltiples organizaciones

El Organization Portal no incluye selector ni mecanismo para cambiar de organización.

Cada organización es responsable de comunicar a sus usuarios la URL de su propio portal:

```text
https://{tenantSlug}.portal.didaxus.com
```

La organización puede publicar esta URL en:

- su página web institucional;
- su intranet o portal interno;
- comunicaciones institucionales;
- correos de invitación o bienvenida;
- códigos QR;
- marcadores;
- documentación institucional.

Cuando una persona pertenece a más de una organización, cada organización le comunica independientemente su correspondiente URL de acceso.

La UI del Organization Portal no debe incluir:

- selector de organizaciones;
- menú de cambio de tenant;
- campo para introducir slug;
- links automáticos hacia otros tenants;
- reutilización de la sesión actual para otra organización.

### Superficie pública secundaria de Civitas

Civitas podrá ofrecer una superficie pública secundaria de recuperación o descubrimiento de portales mediante SSO.

Esta alternativa:

- no constituye el flujo predeterminado;
- no forma parte del Core Manager;
- no aparece dentro del Organization Portal;
- no funciona como selector interno del portal tenant;
- no sustituye los enlaces institucionales;
- no crea una sesión compartida.

Cuando el usuario elige una organización desde esa superficie secundaria, Civitas realiza una navegación completa hacia el hostname organizacional. La autenticación y la sesión continúan siendo independientes y `host-only` para cada organización.

Flujo:

```text
usuario no recuerda la URL
→ abre la superficie pública secundaria de Civitas
→ usa SSO
→ visualiza portales disponibles
→ elige una organización
→ navegación completa a https://{tenantSlug}.portal.didaxus.com
→ BFF tenant crea sesión independiente
```

Este launcher o directorio secundario debe desarrollarse como una superficie y fase separadas, con su propio route registry, autorización y threat model. No se añade como componente de `OrganizationShell`.

### Regla UX final

```text
Entrada predeterminada:
enlace comunicado por la organización

Entrada secundaria:
Civitas + SSO para recuperar o localizar el portal

Cambio de organización dentro del portal:
no permitido
```

### Criterios de aceptación

1. El portal no contiene selector de organizaciones.
2. La documentación institucional puede enlazar directamente al hostname tenant.
3. Una cuenta con acceso a dos organizaciones mantiene dos sesiones host-only independientes.
4. La entrada secundaria requiere navegación completa al hostname elegido.
5. La entrada secundaria no pertenece al Core Manager ni al Organization Portal.
6. La ausencia de la superficie secundaria no impide utilizar el acceso normal comunicado por la organización.

## 30. TenantRuntimeSecurityState

`mismatch` no forma parte de `TenantBootstrapState`.

```text
TenantBootstrapState:
idle | resolving | active | not_found | locked | unavailable

TenantRuntimeSecurityState:
normal | mismatch | session_stale | hostname_moved
```

El `TenantRuntimeErrorBoundary` recibe 409 posteriores al bootstrap; 421 queda limitado a fallos de autoridad que normalmente no entregan la SPA, cancela requests, limpia caches tenant y desmonta módulos sin alterar el TenantContext.

---

## 31. TenantRouteRegistry

Existe una única fuente para router, menú, breadcrumbs, deep links y lifecycle:

```ts
type TenantNavigationEntry = {
  routeId: string;
  path: string;
  label: string;
  requiredCapabilities: string[];
  lifecycle: "active" | "planned" | "disabled" | "unavailable";
  parentRouteId?: string;
};
```

Registry mínimo:

```text
home                                      /
governance                                /settings/governance
governance.roles                          /settings/governance/access-policy/roles
governance.roleNames                      /settings/governance/access-policy/role-names
governance.structure                      /settings/governance/organization-model/structure
governance.identityProvisioning           /settings/governance/identity-provisioning
branding                                  /settings/branding
lms.grades                                /lms/grades
lms.groups                                /lms/groups
```

Reglas:

- el router se genera desde este registry;
- breadcrumbs se derivan de `parentRouteId`;
- navegación usa capacidades, no roles;
- rutas `planned` no renderizan páginas vacías;
- rutas conocidas sin autorización reciben una superficie neutral gobernada por backend.

---

## 32. `restricted_active`

```text
accessMode = restricted
→ banner persistente y neutral
→ menú desde capacidades efectivas
→ mutaciones no permitidas ocultas o deshabilitadas
→ navegación directa revalidada por backend
```

Copy:

> Algunas funciones de esta organización están temporalmente restringidas.

La UI no revela facturación, seguridad ni razones administrativas.

---

## 33. UX de 409 `TENANT_HOST_MOVED`

Cuando una operación recibe `409 TENANT_HOST_MOVED`:

> La dirección de esta organización cambió. Por seguridad, esta operación no fue reenviada. Abra el nuevo espacio e inténtelo nuevamente.

Acciones:

```text
Abrir espacio actual
Volver
Copiar referencia de soporte
```

La UI nunca reenvía automáticamente el body. Solo muestra el hostname canónico cuando el backend lo autoriza.

## 34. Aplicaciones y builds separados

```text
core-manager-frontend
→ civitas.didaxus.com
→ SPA Logto existente

organization-portal-frontend
→ *.portal.didaxus.com
→ sin @logto/react
→ sesión BFF
```

No se implementa el Organization Portal agregando rutas tenant al build global actual.

---

## 35. Cliente CSRF

Después de obtener una sesión, el BFF entrega un token CSRF no sensible mediante una respuesta same-origin o endpoint dedicado. El cliente lo conserva en memoria.

Las mutaciones envían:

```http
X-CSRF-Token: <token de sesión>
Content-Type: application/json
```

El cliente no habilita CORS ni construye origins alternativos. Ante `403 CSRF_VALIDATION_FAILED` desmonta la acción y no reintenta automáticamente.

---

## 36. Source of truth de rutas

`TenantRouteRegistry` genera realmente:

- React Router;
- menú;
- breadcrumbs;
- deep links;
- route IDs para OpenAPI/autorización.

No puede coexistir con una lista manual distinta.
