# CIVITAS — Session and OIDC Contract for Tenant Resolution

**Código:** TR-60  
**Estado:** Contrato técnico de sesión e identidad  
**Proveedor de identidad:** Logto en `auth.didaxus.com`  
**Callback objetivo:** `https://auth-callback.didaxus.com/callback`

---

## 1. Objetivo

Definir cómo una identidad autenticada en Logto se convierte en una sesión BFF host-only para un Organization Portal específico sin compartir cookies, callbacks o contexto entre tenants.

---

## 2. Principios

1. Tenant Resolution ocurre antes de iniciar autenticación.
2. La transacción OIDC queda ligada criptográficamente al hostname tenant original.
3. El callback es central y exacto.
4. El tenant portal recibe un handoff de un solo uso.
5. La sesión final pertenece a un único hostname y organización.
6. No existe selector global de organizaciones.
7. No se acepta `returnTo` libre.
8. El navegador no recibe access tokens persistentes.

---

## 3. Hostnames

```text
auth.didaxus.com
→ Logto

auth-callback.didaxus.com
→ callback central BFF

<slug>.portal.didaxus.com
→ Organization Portal y sesión tenant
```

No se configura como arquitectura objetivo:

```text
https://*.portal.didaxus.com/callback
```

El callback central evita depender de wildcard redirect URIs.

---

## 4. Inicio de sesión

Desde el tenant:

```http
POST /api/auth/sign-in
```

El BFF ya dispone de:

```text
TenantContext
effectiveHost
hostnameId
organizationId
contextVersion
```

Crea:

```ts
type AuthTransaction = {
  id: string;
  organizationId: string;
  hostnameId: string;
  tenantHostname: string;
  contextVersion: number;
  stateHash: string;
  nonceHash: string;
  pkceVerifierCiphertext: string;
  returnPath: string;
  status: "created";
  expiresAt: string;
};
```

---

## 5. `state`

El `state` debe ligar:

```text
transactionId
tenantHostname
hostnameId
contextVersion
issuedAt
expiresAt
random entropy
```

Se almacena únicamente su hash o una representación protegida.

La validación debe rechazar:

- state desconocido;
- state expirado;
- state usado;
- tenantHostname distinto;
- contextVersion incompatible;
- callback repetido.

---

## 6. PKCE y nonce

Requisitos:

- PKCE S256;
- verifier solo en backend y cifrado en reposo;
- nonce ligado a la transacción;
- validación de issuer, audience, nonce y tiempos;
- algoritmo de firma allowlisted;
- clock skew limitado;
- no aceptar tokens de otro Logto tenant o aplicación.

---

## 7. Redirect URI

Exacta:

```text
https://auth-callback.didaxus.com/callback
```

No se deriva desde `Host` del cliente.

No se acepta redirect URI enviada por frontend.

---

## 8. Callback central

Flujo:

```text
GET/POST auth-callback.didaxus.com/callback
→ no-store
→ localizar AuthTransaction por state
→ verificar status y expiry
→ intercambiar code server-side
→ validar tokens
→ volver a resolver hostname target
→ verificar organizationId y contextVersion
→ verificar membership
→ emitir handoff
```

El callback central no establece la cookie tenant porque pertenece a otro hostname.

---

## 9. Handoff de un solo uso

```ts
type AuthHandoff = {
  id: string;
  transactionId: string;
  organizationId: string;
  hostnameId: string;
  targetHostname: string;
  subjectId: string;
  membershipId: string;
  contextVersion: number;
  sessionBindingVersion: number;
  expiresAt: string;
  status: "issued";
};
```

Características:

- entropía alta;
- se persiste solo hash;
- TTL recomendado: 60 segundos;
- un solo uso;
- target hostname exacto;
- organizationId y hostnameId ligados;
- invalidado si cambia contextVersion;
- no contiene access token reutilizable.

---

## 10. Entrega del handoff

El callback central devuelve una página HTML mínima con formulario auto-submit:

```html
<form
  method="post"
  action="https://colegio1.portal.didaxus.com/api/auth/handoff"
>
  <input type="hidden" name="handoff" value="..." />
</form>
```

Headers:

```http
Cache-Control: private, no-store
Pragma: no-cache
Referrer-Policy: no-referrer
Content-Security-Policy:
  default-src 'none';
  form-action https://colegio1.portal.didaxus.com;
  frame-ancestors 'none';
  base-uri 'none'
```

El hostname del `form-action` procede de la AuthTransaction validada, no de input libre.

No se usa query string para transportar el handoff.

---

## 11. Consumo en tenant BFF

```http
POST /api/auth/handoff
```

El BFF:

1. resuelve TenantContext desde el hostname actual;
2. hashea el handoff recibido;
3. realiza `UPDATE ... WHERE status='issued' AND expires_at > now() RETURNING`;
4. verifica organizationId, hostnameId, contextVersion y targetHostname;
5. verifica membership;
6. crea sesión;
7. marca handoff consumed;
8. marca AuthTransaction consumed;
9. establece cookie;
10. responde `303` a una ruta interna allowlisted.

Todo dentro de una transacción o unidad atómica equivalente.

---

## 12. Cookie de sesión

```http
Set-Cookie: __Host-civitas_session=<opaque>;
  Path=/;
  Secure;
  HttpOnly;
  SameSite=Strict
```

Nunca incluir:

```text
Domain
```

El valor es opaco y referencia una sesión server-side.

La sesión almacena:

```text
organizationId
hostnameId
contextVersion
sessionBindingVersion
subjectId
membershipId
issuedAt
expiresAt
```

---

## 13. SameSite=Strict

Objetivo canónico:

```text
SameSite=Strict
```

Debe validarse con pruebas reales de:

- Logto;
- SSO empresarial;
- conectores sociales habilitados;
- callback central;
- handoff POST;
- logout;
- recuperación de cuenta;
- navegación de retorno.

El handoff no depende de una cookie tenant previa. La cookie nueva se establece en la respuesta del tenant BFF y se usa en la navegación same-site posterior.

Si una cookie transaccional temporal requiere otra política, debe:

- ser distinta de la sesión principal;
- tener TTL mínimo;
- estar limitada al callback central;
- no compartir Domain;
- no reducir la cookie principal.

---

## 14. Return path

Permitido:

```text
/
/settings/...
/lms/...
```

Reglas:

- solo path relativo;
- debe comenzar `/`;
- no `//`;
- no esquema;
- no hostname;
- no CR/LF;
- allowlist por route registry;
- longitud limitada;
- fallback `/`.

No se acepta:

```text
returnTo=https://...
```

---

## 15. Membership

Antes de crear sesión:

```text
identity subject
+ organizationId
→ membership activa
```

No se infiere membership desde:

- dominio de correo;
- slug;
- organización indicada por frontend;
- claims no validados;
- pertenencia a otra organización.

---

## 16. Session enforcement

En cada solicitud autenticada:

```text
cookie session
→ session server-side
→ status active
→ hostnameId coincide
→ organizationId coincide
→ contextVersion vigente
→ sessionBindingVersion vigente
→ membership activa
```

Fallo:

```text
401
o
409 TENANT_CONTEXT_STALE
```

Nunca cambia el tenant automáticamente.

---

## 17. Cambio de hostname

Cuando se ejecuta un cambio:

- se incrementa `sessionBindingVersion`;
- se revocan sesiones del hostname anterior;
- se invalidan AuthTransactions no consumidas del binding anterior;
- se invalidan handoffs pendientes;
- el host anterior no puede completar callbacks ni handoffs;
- el login debe reiniciarse desde el host nuevo.

---

## 18. Logout

```http
POST /api/auth/sign-out
```

Debe:

- revocar sesión server-side;
- expirar cookie host-only;
- limpiar estado BFF;
- no cerrar sesiones de otros tenants;
- no usar redirect externo libre.

Logout global de Logto, si se implementa, es una operación separada y no convierte las sesiones tenant en compartidas.

---

## 19. Recuperación e invitaciones

Rutas sensibles:

```text
/recovery/*
/invite/*
```

No participan en redirect automático de hostname antiguo.

Los tokens:

- son de un solo uso;
- están ligados al organizationId y hostnameId;
- expiran;
- no se copian a query del hostname nuevo;
- requieren reiniciar o emitir enlace nuevo después de cambio de hostname.

---

## 20. Seguridad del callback

Probar:

- state fixation;
- state replay;
- code replay;
- nonce mismatch;
- PKCE mismatch;
- issuer mismatch;
- audience mismatch;
- redirect URI mismatch;
- target hostname desconocido;
- hostname blocked/retired;
- contextVersion stale;
- membership revocada;
- handoff replay;
- form-action injection;
- returnPath externo.

---

## 21. Observabilidad

Eventos:

```text
tenant_auth_started
tenant_auth_callback_received
tenant_auth_validated
tenant_auth_handoff_issued
tenant_auth_handoff_consumed
tenant_auth_handoff_failed
tenant_session_created
tenant_session_stale
tenant_session_revoked
tenant_logout_completed
```

No registrar code, state plaintext, nonce, verifier, handoff plaintext, tokens ni cookie.

---

## 23. Acceso a varias organizaciones y sesiones independientes

Cuando una persona tiene acceso a más de una organización, cada portal mantiene una sesión BFF independiente:

```text
colegio1.portal.didaxus.com
→ __Host-civitas_session exclusiva de colegio1

instituto-norte.portal.didaxus.com
→ __Host-civitas_session exclusiva de instituto-norte
```

La entrada secundaria de recuperación o descubrimiento mediante Civitas + SSO no crea una cookie compartida ni una sesión global de Organization Portal.

Después de elegir una organización:

```text
superficie secundaria
→ navegación completa al hostname tenant
→ nuevo flujo de handoff o sign-in ligado a ese hostname
→ sesión host-only independiente
```

La superficie secundaria no puede transferir automáticamente:

- sesión;
- membership;
- roles;
- scopes;
- recovery state;
- tokens de otra organización.

No existe cambio de tenant dentro de una sesión activa. Para entrar a otra organización, el usuario abre la URL comunicada por esa organización o utiliza la superficie secundaria de descubrimiento y navega completamente al hostname correspondiente.

---

## 24. Definición final

> Logto autentica la identidad en `auth.didaxus.com`, el callback central valida una transacción ligada al tenant y entrega un handoff de un solo uso al BFF del hostname original. Solo ese BFF crea la cookie `__Host-civitas_session`, vinculada al hostname y organizationId resueltos.

## 23. Persistencia y seguridad HTTP reconciliadas

La persistencia de cada handoff contiene obligatoriamente:

```text
organizationId
hostnameId
targetHostname
subjectId
membershipId
contextVersion
sessionBindingVersion
```

El consumo atómico compara todos esos valores antes de crear la sesión.

OpenAPI separa los esquemas:

```text
Owner/admin → bearerAuth
GET /api/auth/session → sessionCookie
POST /api/auth/sign-out → sessionCookie
sign-in/handoff → anónimos dentro del TenantContext resuelto
```

Todas las respuestas de autenticación, exitosas o fallidas, son `private, no-store`.

## 23. Aplicaciones Logto separadas

```text
Civitas Core Manager
→ aplicación SPA existente
→ @logto/react
→ se conserva

Civitas Organization Portal BFF
→ nueva aplicación Traditional Web confidencial
→ app secret solo en backend
→ redirect URI exacta:
  https://auth-callback.didaxus.com/callback
```

No se reutiliza el cliente SPA para custodiar el secreto ni ejecutar el callback BFF.

---

## 24. Protección CSRF de sesión

`SameSite=Strict` es una defensa adicional, no suficiente entre subdominios hermanos.

Toda mutación autenticada exige:

```text
sessionCookie
+ X-CSRF-Token
+ Origin exacto
+ Sec-Fetch-Site same-origin
+ Content-Type permitido
```

El token CSRF está ligado a la sesión server-side y se compara en tiempo constante.

Excepciones:

- handoff: ticket de un solo uso y target exacto;
- webhook: firma propia y sin cookie.

---

## 25. No-store universal

Todas las respuestas `/api/auth/*`, tanto exitosas como fallidas, incluyen:

```http
Cache-Control: private, no-store
Pragma: no-cache
```
