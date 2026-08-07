# CIVITAS — Edge, DNS, TLS y Trusted Proxy Contract

**Código:** TR-40  
**Estado:** Contrato de infraestructura  
**Ámbito:** Cloudflare, TLS, Tunnel, Traefik/Coolify y autoridad HTTP efectiva

---

## 1. Objetivo

Definir la cadena cerrada que transforma una solicitud pública en un `effectiveHost` confiable para el BFF.

```text
Internet
→ Cloudflare DNS/TLS
→ Cloudflare Tunnel
→ Traefik
→ BFF ingress
→ Tenant Resolver
```

El edge transporta solicitudes. Solo Civitas autoriza tenants mediante coincidencia exacta en el registro.

---

## 2. DNS

Registro wildcard:

```text
Tipo: CNAME
Nombre: *.portal
Destino: <TUNNEL_UUID>.cfargotunnel.com
Proxy status: Proxied
```

No se crean registros por organización.

El wildcard también puede transportar hostnames inexistentes. Por eso:

```text
DNS success
≠ tenant autorizado
```

---

## 3. TLS

Cobertura obligatoria:

```text
*.portal.didaxus.com
```

Es un wildcard de subdominio profundo y debe estar activo antes de exponer el portal.

Opciones operativas:

- Total TLS;
- certificado Advanced;
- certificado personalizado.

Gate:

```text
certificado activo
+ cadena válida
+ renovación monitorizada
```

Sin esta cobertura, Tenant Resolution no está listo para producción.

---

## 4. Cloudflare Tunnel

Ingress conceptual:

```yaml
ingress:
  - hostname: auth.didaxus.com
    service: http://traefik:80

  - hostname: auth-callback.didaxus.com
    service: http://traefik:80

  - hostname: civitas.didaxus.com
    service: http://traefik:80

  - hostname: courses.didaxus.com
    service: http://traefik:80

  - hostname: "*.portal.didaxus.com"
    service: http://traefik:80

  - service: http_status:404
```

Reglas:

- hosts exactos antes del wildcard;
- catch-all final 404;
- no crear hostname por tenant;
- Tunnel solo conecta con Traefik privado;
- puertos de BFF y servicios no se exponen públicamente.

---

## 5. Traefik v3

Router tenant congelado hasta verificar la versión externa de Traefik/Coolify:

```text
HostRegexp(`^[a-z0-9](?:[a-z0-9-]{1,61})[a-z0-9]\.portal\.didaxus\.com$`)
```

`Host(`*.portal.didaxus.com`)` solo puede sustituirlo después de confirmar Traefik 3.7+ y superar el edge gate. El contrato no asume la versión del Traefik administrado por Coolify.

La regla de Traefik decide qué aplicación recibe la solicitud. No valida que el tenant exista.

Routers exactos de servicios centrales conservan mayor prioridad.

---

## 6. Hostname efectivo

Fuente canónica dentro del BFF:

```text
Host de HTTP/1.1
o :authority de HTTP/2
recibido desde Traefik confiable
```

El BFF no usa para elegir tenant:

```text
Forwarded
X-Forwarded-Host
X-Original-Host
X-Host
X-Tenant-ID
X-Civitas-Tenant
```

Cadena obligatoria:

1. Cloudflare valida TLS para el hostname solicitado.
2. Tunnel entrega tráfico a Traefik.
3. Traefik aplica router `*.portal.didaxus.com`.
4. Traefik elimina headers de forwarding aportados por el cliente.
5. BFF acepta conexiones únicamente desde el peer Traefik allowlisted.
6. El ingress adapter parsea `Host` o `:authority`.
7. Se crea `requestContext.effectiveHost`, inmutable.
8. El resto de la aplicación no vuelve a leer headers para resolver tenant.

---

## 7. Headers entrantes

Traefik debe eliminar o sobrescribir:

```text
Forwarded
X-Forwarded-Host
X-Original-Host
X-Civitas-Effective-Host
X-Civitas-Tenant
X-Tenant-ID
```

Los headers necesarios para IP cliente se aceptan únicamente desde Cloudflare/Traefik y no participan en Tenant Resolution.

No se configura:

```js
app.set("trust proxy", true)
```

Se usan:

- número exacto de hops; o
- CIDRs exactos; o
- conexión privada/mTLS.

---

## 8. Parser de authority

El parser debe:

- aceptar un único valor;
- rechazar comas;
- rechazar espacios, tabs, CR y LF;
- separar puerto mediante parser estándar;
- convertir hostname a minúsculas;
- eliminar punto DNS final antes del puerto;
- normalizar IDNA cuando corresponda;
- rechazar IP literals;
- rechazar userinfo;
- rechazar labels vacíos;
- exigir exactamente `<slug>.portal.didaxus.com`;
- aplicar slug de 3 a 63 caracteres.

Ejemplos válidos:

```text
colegio1.portal.didaxus.com
Colegio1.PORTAL.DIDAXUS.COM:443
colegio1.portal.didaxus.com.:443
```

Resultado:

```text
colegio1.portal.didaxus.com
```

No implementar con `split(":")`.

---

## 9. SNI, Host y :authority

Pruebas obligatorias:

```text
SNI tenant1 + Host tenant1 → permitido
SNI tenant1 + Host tenant2 → rechazado
SNI platform + Host tenant → rechazado
Host duplicado → rechazado
:authority distinto de Host → rechazado
hostname sin SNI válido → rechazado por edge
```

La aplicación no debe corregir discrepancias.

---

## 10. Cache HTTP

Respuestas no compartidas:

```text
HTML del Organization Portal
/api/tenant/context
/api/auth/*
423
mismatch
```

Headers:

```http
Cache-Control: private, no-store
Pragma: no-cache
Vary: Host
```

`Vary: Host` no sustituye `no-store`; es defensa adicional.

No habilitar cache compartida hasta demostrar una key que incluya:

```text
effectiveHost
contextVersion
response class
deployment version
```

---

## 11. Rate limiting y negative caching

### Hostnames desconocidos

- negative cache interna corta;
- TTL sugerido: 30–60 segundos;
- no cache HTTP pública;
- invalidación inmediata al reservar o activar.

### Rate limiting

Dimensiones:

```text
source IP
effectiveHost
hostname prefix pattern
route class
```

Objetivos:

- limitar enumeración de slugs;
- limitar subdominios aleatorios;
- proteger registry y base;
- no afectar tenants activos por ataques a hostnames inexistentes.

---

## 12. Respuesta de host desconocido

Traefik puede enrutar cualquier host bajo wildcard, pero el BFF responde:

```text
404 Espacio no encontrado
```

No:

- abre login;
- redirige a Core Manager;
- muestra selector;
- intenta coincidencia aproximada;
- crea registros.

---

## 13. Local development

Opciones soportadas:

### Hosts file

```text
127.0.0.1 colegio1.portal.didaxus.test
127.0.0.1 colegio2.portal.didaxus.test
```

### DNS local wildcard

```text
*.portal.didaxus.test → 127.0.0.1
```

El entorno local debe usar un namespace separado y explícito.

Nunca se permite un fallback como:

```text
localhost?tenant=colegio1
```

para pruebas de seguridad o E2E.

---

## 14. Observabilidad edge

Registrar:

```text
rayId
requestId
SNI
authority
router
source peer
effectiveHost
normalization result
rejection reason
```

No registrar cookies, authorization headers ni query sensible.

---

## 15. Gates

```text
TLS wildcard active
Tunnel catch-all 404
Traefik v3 rule validated
BFF port private
forwarded headers stripped
trusted peers allowlisted
authority parser tests passing
SNI/Host mismatch tests passing
bootstrap no-store verified
```

---

## 16. Definición final

> Cloudflare, Tunnel y Traefik transportan solicitudes destinadas a `*.portal.didaxus.com`. El BFF acepta únicamente tráfico desde el ingress confiable, obtiene una autoridad HTTP validada y crea un `effectiveHost` inmutable. Ningún header aportado libremente por el cliente puede seleccionar o modificar el tenant.

## 17. Separación física y puertos

Servicios productivos:

```text
core-manager-frontend
organization-portal-frontend
tenant-bff
central-api
worker
```

Regla de Compose/Coolify:

```yaml
expose:
  - "3000"
```

No:

```yaml
ports:
  - "3000:3000"
```

El mismo control aplica a workers y servicios internos. Tunnel entra por Traefik; el host no publica esos puertos.

---

## 18. Política CORS y CSRF

Para rutas cookie-authenticated del BFF:

```text
Access-Control-Allow-Origin: ausente por defecto
Origin: debe coincidir exactamente con effectiveHost
Sec-Fetch-Site: same-origin
X-CSRF-Token: obligatorio en mutaciones
```

No se usa una expresión CORS para todos los subdominios portal.

`POST /api/auth/handoff` es una excepción de origen cruzado cerrada mediante handoff de un solo uso, target exacto y CSP `form-action`.

---

## 19. Uso de 409 y 421

```text
hostname histórico + GET/HEAD seguro
→ 307

hostname histórico + mutación/ruta sensible
→ 409 TENANT_HOST_MOVED

SNI/Host/:authority incompatibles
→ 421 TENANT_AUTHORITY_MISMATCH
```

`421` no se usa como señal funcional para que el cliente repita una mutación contra otro hostname.
