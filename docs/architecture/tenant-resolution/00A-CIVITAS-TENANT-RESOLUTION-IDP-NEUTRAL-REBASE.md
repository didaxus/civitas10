# CIVITAS — Tenant Resolution provider-neutral identity rebase

**Código:** TR-00A  
**Estado:** enmienda normativa de rebase  
**Aplica a:** PR #247 / paquete Tenant Resolution v1  
**Foundation:** #342, #343, #344, #345, #346  

## 1. Precedencia y alcance

Esta enmienda fue aprobada después de TR-00 y **sustituye únicamente las cláusulas provider-specific incompatibles** de TR-00 y sus documentos derivados. No cambia las decisiones de hostname-first tenancy, BFF host-only, callback central, RLS, CSRF, rutas visibles ni aislamiento multi-tenant.

Ante conflicto semántico:

```text
TR-00A provider-neutral identity rebase
→ TR-00 Tenant Resolution
→ documentos derivados TR-10..TR-96
```

Las referencias históricas a Logto se interpretan como referencias a la implementación activa del `Platform Identity Provider`, salvo cuando el texto describe explícitamente compatibilidad o configuración del adapter Logto.

## 2. Autoridades canónicas

```text
Civitas
- organizationId canónico
- subjectId canónico
- membership canónica / estado de acceso organizacional
- TenantContext
- hostname registry
- tenant/session binding
- autorización y resource ownership

Platform Identity Provider
- autenticación
- protocolo OIDC
- sesión del proveedor
- emisión/validación criptográfica de tokens
- identidades y memberships externas materializadas cuando el provider las soporte

Implementación activa actual
- Logto
```

Un provider ID nunca selecciona tenant ni sustituye `organizationId`, `subjectId` o una membership canónica de Civitas.

## 3. Reemplazos normativos

En todo el paquete:

```text
"Logto" como autoridad arquitectónica
→ "Platform Identity Provider (active implementation: Logto)"

"Logto Traditional Web application" como requisito de dominio
→ "confidential OIDC client/profile of the active Platform Identity Provider; Logto profile today"

"token organization" como selector de tenant
→ evidencia autenticada que debe confirmar el organizationId ya resuelto por hostname/session

provider membership ID como membership de Civitas
→ provider binding/evidence correlated to canonical Civitas membership
```

Las menciones concretas a `auth.didaxus.com`, issuer/resource o `@logto/react` pueden permanecer como **compatibilidad de la implementación Logto actual**, no como contrato portable del dominio.

## 4. Cadena de confianza obligatoria

Para el Organization Portal:

```text
Effective Hostname
→ Tenant Resolution
→ canonical organizationId
→ OIDC authentication through Platform Identity Provider
→ CanonicalAuthContext
→ canonical subjectId
→ active canonical organization membership
→ authorization
→ resource ownership
→ execution
```

El token nunca puede cambiar el tenant resuelto. Si la evidencia del token/provider afirma otra organización, el resultado es mismatch y fail-closed.

## 5. AuthTransaction y callback

El flujo objetivo queda:

```text
tenant portal
→ BFF creates tenant-bound AuthTransaction
→ state + nonce + PKCE bound to hostname/organizationId
→ active Platform Identity Provider
→ exact central callback
→ provider adapter validates code/tokens/issuer/audience/nonce/PKCE
→ CanonicalAuthContext
→ correlate provider subject through verified identity_subject_binding
→ verify canonical membership for resolved organizationId
→ issue one-use handoff
→ tenant BFF consumes handoff
→ host-only Civitas session
```

El callback no acepta `organizationId`, provider organization ID, membership ID, hostname o return URL desde input libre para seleccionar contexto.

## 6. Sesión Civitas

La sesión BFF se vincula como mínimo a:

```text
organizationId
hostnameId
contextVersion
sessionBindingVersion
subjectId
canonical membership reference/status
```

Cualquier provider subject/membership identifier se conserva solo como binding/evidence server-side cuando sea necesario para auditoría o reconciliación.

La sesión no depende de que todos los providers tengan un concepto equivalente a una "organization membership ID".

## 7. CanonicalAuthContext

TR-60 y el BFF consumen el contrato de #345. Conceptualmente:

```text
Raw provider response/token
→ provider token adapter
→ CanonicalAuthContext
→ Civitas tenant/session/authorization enforcement
```

El código común no parsea claims Logto-specific para tomar decisiones de tenant o autorización.

## 8. Core Manager vs Organization Portal

Se preserva la coexistencia:

```text
Core Manager
- puede seguir usando el perfil Logto existente durante la migración
- su acoplamiento actual es compatibilidad, no nueva autoridad de dominio

Organization Portal BFF
- usa abstracción OIDC/provider-neutral
- Logto es el primer perfil implementado
```

La futura migración de Core Manager a una abstracción frontend/provider-neutral pertenece a #342/#346 y no bloquea Tenant Resolution.

## 9. Branding y login

Tenant Resolution no es autoridad de branding del Identity Provider. Cuando el login del provider soporte branding organizacional, Civitas proyectará una `BrandPublication` mediante una capability explícita del Identity Provider. La ausencia de esa capability no cambia Tenant Resolution.

## 10. Reglas multi-tenant

Invariantes preservadas y reforzadas:

- hostname efectivo selecciona el tenant externo;
- provider/token solo confirma identidad y contexto, nunca selecciona otro tenant;
- session tenant debe coincidir con hostname tenant;
- membership debe pertenecer al mismo `organizationId` canónico;
- route/resource `organizationId` son restricciones adicionales;
- provider binding de tenant A nunca satisface tenant B;
- org switch requiere navegación completa y sesión host-only independiente;
- workers/jobs usan `TenantExecutionContext` explícito y revalidan organización al ejecutar.

## 11. Cambios al plan TR-96

`TR-006` se interpreta como:

```text
TR-006  Configurar cliente OIDC confidencial del Platform Identity Provider,
        implementar perfil Logto activo y callback central exacto
```

No como creación de una dependencia de dominio hacia Logto.

## 12. Gates adicionales

Antes de considerar el contrato portable:

- test de token/provider mismatch contra hostname tenant;
- test de provider subject binding ambiguo → fail-closed;
- test de provider membership perteneciente a otra organización → fail-closed;
- test de un fake Identity Provider sin conceptos Logto;
- vendor leakage gate: lógica común Tenant Resolution/BFF no puede requerir `logtoOrganizationId`, `logtoUserId` o cliente Logto;
- Logto parity test para el comportamiento actual.

## 13. Decisión final

> Tenant Resolution pertenece a Civitas y selecciona el tenant antes de autenticación. El Platform Identity Provider autentica y entrega evidencia criptográficamente verificable; su implementación activa es Logto. Esa evidencia se correlaciona mediante bindings con identidades canónicas de Civitas y solo puede confirmar —nunca reemplazar— el `organizationId` determinado por el hostname y la sesión.