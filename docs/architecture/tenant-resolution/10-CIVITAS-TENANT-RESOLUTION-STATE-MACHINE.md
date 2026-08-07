# CIVITAS — State machine de Tenant Resolution

**Código:** TR-10  
**Estado:** Normativo

---

## 1. Clasificación de hostname

```text
unclassified
→ platform
→ tenant_candidate
→ unknown
```

| Desde | Evento | Hacia |
|---|---|---|
| `unclassified` | exact match de plataforma | `platform` |
| `unclassified` | patrón `<slug>.portal.didaxus.com` | `tenant_candidate` |
| `unclassified` | no coincide | `unknown` |

`platform` no participa en Tenant Resolution organizacional.

---

## 2. OrganizationHostname

Estados:

```text
reserved
active
redirecting
retired
blocked
```

| Desde | Evento | Hacia | Actor |
|---|---|---|---|
| inexistente | reservar slug | `reserved` | Owner |
| `reserved` | activar | `active` | Owner/sistema |
| `active` | iniciar cambio | hostname anterior a `redirecting` | sistema |
| `active` | bloquear primary con organización suspendida/deactivated o reemplazo activo en la misma transacción | `blocked` | Owner/security + sistema |
| `redirecting` | vence ventana | `retired` | worker |
| `redirecting` | bloquear | `blocked` | Owner/security |
| `blocked` | retirar definitivamente | `retired` | Owner |

Reglas:

- una organización tiene exactamente un hostname primary `active`;
- un hostname histórico nunca vuelve a `active`;
- un slug utilizado nunca se reasigna;
- `redirectTargetHostname` pertenece a la misma organización y al finalizar la transacción es el único hostname primary `active`.
- un hostname `active` no puede retirarse directamente; debe pasar por `redirecting` o `blocked`;
- bloquear el único primary exige suspender/deactivar la organización o activar un reemplazo dentro de la misma transacción.

---

## 3. Organization operational status

Estados:

```text
provisioning
active
restricted_active
suspended
deactivated
```

| Desde | Evento | Hacia |
|---|---|---|
| `provisioning` | activation approved | `active` |
| `active` | aplicar restricciones | `restricted_active` |
| `restricted_active` | levantar restricciones | `active` |
| `active` | suspender | `suspended` |
| `restricted_active` | suspender | `suspended` |
| `suspended` | reactivar | `active` o `restricted_active` |
| cualquiera no deactivated | desactivar | `deactivated` |

Cada transición incrementa `contextVersion`.

---

## 4. Tenant bootstrap

Estados:

```text
resolving
active
locked
not_found
unavailable
```

| Condición | Estado | HTTP |
|---|---|---:|
| hostname active + org active | `active` | 200 |
| hostname active + org restricted_active | `active` restringido | 200 |
| org provisioning/suspended | `locked` | 423 |
| unknown/blocked/retired/deactivated | `not_found` | 404 |
| registry o dependencia crítica falla | `unavailable` | 503 |

No existe estado público que revele `blocked` o `retired`.

---

## 5. Redirecting hostname

### GET/HEAD seguro

```text
redirecting
→ 307
```

### Método, ruta o query sensible

```text
redirecting
→ 409 TENANT_HOST_MOVED
```

`421` se reserva para discrepancias de autoridad/SNI, no para indicar cambio funcional de hostname.

No hay redirect automático para `/api`, `/auth`, `/callback`, OIDC o secretos en query.

---

## 6. Enforcement

```text
Level A:
hostname + registry + org status

Level B:
A + session + membership

Level C:
B + route organizationId

Level D:
C + resource organizationId
```

Mismatch:

```text
deny
→ audit
→ no autocorrection
→ no tenant switch
```

---

## 7. Hostname change run

Estados:

```text
draft
validating
approved
executing
redirecting
completed
blocked
failed
cancelled
```

| Desde | Evento | Hacia |
|---|---|---|
| inexistente | Owner inicia | `draft` |
| `draft` | validar slug/TLS/routing | `validating` |
| `validating` | pasa | `approved` |
| `validating` | falla recuperable | `blocked` |
| `blocked` | corregir y revalidar | `validating` |
| `blocked` | cancelar | `cancelled` |
| `approved` | ejecutar | `executing` |
| `executing` | nuevo host activo + sesiones revocadas | `redirecting` |
| `redirecting` | 30 días cumplidos | `completed` |
| `draft`/`validating` | cancelar | `cancelled` |
| cualquier ejecución | fallo no recuperable | `failed` |

---

## 8. Sesión

Estados:

```text
created
active
stale_context
revoked
expired
```

| Evento | Resultado |
|---|---|
| handoff válido | `created → active` |
| contextVersion cambia | `active → stale_context` |
| hostname change | sesiones del binding anterior → `revoked` |
| logout | `revoked` |
| TTL | `expired` |

Una cookie presente no implica sesión válida.

---

## 9. AuthTransaction

Estados:

```text
created
redirected
callback_received
validated
handoff_issued
consumed
expired
failed
```

El handoff es de un solo uso y está ligado al tenant hostname original.

---


## 10. AuthHandoff

Estados:

```text
issued
consumed
expired
revoked
```

| Desde | Evento | Hacia | Actor |
|---|---|---|---|
| inexistente | callback validado emite ticket | `issued` | callback BFF |
| `issued` | tenant BFF consume atómicamente | `consumed` | tenant BFF |
| `issued` | vence TTL | `expired` | worker/sistema |
| `issued` | cambia hostname, contextVersion o membership | `revoked` | sistema |

Reglas:

- `consumed`, `expired` y `revoked` son terminales;
- un ticket solo puede consumirse una vez;
- organizationId, hostnameId, subjectId, membershipId, contextVersion y sessionBindingVersion deben coincidir.

---

## 11. TenantExecutionContext

Estados de validación:

```text
issued
verified
rejected
expired
```

Jobs y eventos no avanzan sin contexto `verified`.

---

## 12. Estados visibles de UI

| Estado técnico | Copy público |
|---|---|
| `resolving` | Preparando su espacio de trabajo |
| `not_found` | Espacio no encontrado |
| `locked` | Contacte al administrador de su organización |
| `unavailable` | No pudimos preparar el espacio de trabajo |
| mismatch | No fue posible validar el contexto de esta organización |

---

## 13. Eventos canónicos

```text
tenant.hostname.reserved
tenant.hostname.activated
tenant.hostname.change_started
tenant.hostname.redirect_started
tenant.hostname.retired
tenant.hostname.blocked
tenant.context.version_changed
tenant.bootstrap.succeeded
tenant.bootstrap.not_found
tenant.bootstrap.locked
tenant.context.mismatch
tenant.session.revoked
tenant.auth.handoff_issued
tenant.auth.handoff_consumed
tenant.cross_tenant.denied
```

## 13. CSRF de sesión BFF

Estado de validación por mutación autenticada:

```text
pending
→ accepted
→ rejected_origin
→ rejected_fetch_metadata
→ rejected_token
→ rejected_content_type
```

Una mutación solo llega al handler cuando:

```text
sessionCookie válida
+ Origin exacto
+ Sec-Fetch-Site same-origin
+ CSRF token de sesión
+ Content-Type permitido
```

`POST /api/auth/handoff` no usa este lifecycle; utiliza `AuthHandoff` de un solo uso.
