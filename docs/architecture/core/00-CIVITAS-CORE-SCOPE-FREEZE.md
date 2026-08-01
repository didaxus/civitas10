# CIVITAS Core 1.0 — Congelamiento de alcance antes de módulos

**Código:** CORE-FREEZE-001  
**Estado:** Normativo  
**Repositorio:** `didaxus/civitas10`  
**Objetivo:** terminar un Civitas completamente operable sin módulos de negocio y dejar contratos estables para desarrollarlos o conectarlos después.

## 1. Decisión congelada

Civitas Core 1.0 se considera **100 % operable** cuando puede crear, gobernar, configurar, activar y administrar organizaciones de forma segura aunque no exista todavía ningún módulo de negocio ni runtime externo conectado.

A la fecha de este congelamiento:

- ningún módulo de negocio se considera desarrollado;
- ningún runtime modular se considera implementado, conectado o verificable;
- ninguna herramienta MCP de módulo está activa;
- ninguna superficie REST modular está activa por el solo hecho de estar documentada;
- cualquier código modular existente se clasifica como contrato, scaffold, fake, prototipo o experimento hasta que exista evidencia específica de integración;
- un build o despliegue exitoso de Civitas no prueba que Ágora, Plasma, LMS, Analytics, Billing u otro runtime esté operativo.

Los módulos y runtimes permanecen en:

```text
contractStatus = planned
implementationStatus = not_implemented
runtimeStatus = not_bound
activationStatus = inactive
```

## 2. Definición de Civitas Core 1.0 operable

Civitas Core 1.0 debe funcionar sin depender de Ágora, Plasma, Moodle, Mautic, Matomo, un LRS, Stripe, Mercado Pago, Wompi, Bancolombia, DIAN ni otro proveedor.

El release Core 1.0 incluye:

1. Tenant Resolution y aislamiento por hostname.
2. Civitas Core Manager para Owner/Didaxus.
3. Organization Portal host-local para cada organización.
4. Identidad, sesiones, organizaciones y memberships materializadas en Logto.
5. Desired state, correlación, mappings y reconciliación gobernados por Civitas.
6. Usuarios, invitaciones, altas, suspensiones y reactivaciones.
7. Roles canónicos, permisos, Owner Ceilings y Tenant Activations.
8. PBAC, ABAC/Data Scope y decisiones fail-closed.
9. Onboarding completo, reanudable, versionado y aprobable.
10. Branding organizacional URL-first con validación, publicación y rollback.
11. Suscripciones, entitlements, límites, cupos y usage ledger por módulo.
12. Auditoría, outbox, idempotencia, concurrencia y operaciones asíncronas del Core.
13. Navegación, accesibilidad, estados de error y recuperación en ambas superficies.
14. Catálogo de módulos y contratos de contribución, todos inactivos.

## 3. Las dos superficies canónicas

### 3.1 Civitas Core Manager

**Host principal:** `civitas.didaxus.com`  
**Actor principal:** Owner/Didaxus y personal interno explícitamente delegado.

Responsabilidades:

- directorio global de organizaciones;
- creación, bootstrap, suspensión y archivo de organizaciones;
- aprobación de onboarding y activación;
- gestión de hostnames y excepciones permitidas;
- aprobación inicial de branding;
- catálogo de módulos, subscriptions y entitlements;
- límites, usage ledger y estado comercial;
- Owner Ceilings, Tenant Activations y gobierno de permisos;
- auditoría, operaciones y estado global;
- soporte de reconciliación y recuperación.

Rutas visibles de referencia:

```text
/owner/organizations/...
/owner/organization-onboardings/...
/owner/module-catalog/...
/owner/subscriptions/...
/owner/entitlements/...
/owner/usage/...
/owner/audit/...
/owner/operations/...
```

### 3.2 Organization Portal

**Host:** `{tenantSlug}.portal.didaxus.com`  
**Actor principal:** Organization Admin y actores organizacionales autorizados.

Responsabilidades:

- perfil institucional;
- onboarding delegado y reanudable;
- branding permitido;
- administradores, usuarios e invitaciones;
- configuración de identidad y provisioning;
- roles y permisos dentro del Owner Ceiling;
- Data Scope y estructura autorizada;
- consulta de subscriptions, entitlements, límites y uso;
- catálogo de módulos disponibles o planificados;
- auditoría visible para la organización.

Reglas:

- la URL visible no contiene `organizationId`;
- JavaScript no selecciona el tenant;
- el tenant se deriva del hostname, la sesión BFF y `TenantContext`;
- el portal no enlaza al directorio global de organizaciones;
- un mismatch de tenant detiene la operación y obliga a recargar el contexto correcto.

## 4. Identidad, memberships y acceso

Logto es autoridad para:

- identidad;
- autenticación;
- organización de identidad;
- membership materializada;
- sesión, MFA y emisión de tokens.

Civitas es autoridad para:

- onboarding y estado operativo;
- desired membership state;
- mappings y provenance;
- roles canónicos y role potential;
- Owner Ceiling y Tenant Activation;
- PBAC, ABAC/Data Scope y decisión efectiva;
- subscriptions, entitlements y uso;
- auditoría de negocio.

Civitas no crea una segunda identidad ni una segunda membership paralela. Conserva referencias verificables a `logtoOrganizationId` y `organization_membership_id`.

## 5. Onboarding incluido en Core 1.0

El onboarding completo es un aggregate persistente y no una sesión temporal del navegador.

Flujo mínimo:

```text
crear aggregate
→ bootstrap institucional
→ reservar tenantSlug y OrganizationHostname
→ crear organización y administradores mínimos en Logto
→ configurar métodos de acceso
→ configurar provisioning y lifecycle
→ configurar estructura, roles y Data Scope
→ configurar branding
→ revisar subscriptions, entitlements y límites
→ ejecutar dry-runs
→ generar activation plan inmutable
→ revisión y aprobación Owner
→ activation run
→ publicación o acceso restringido
→ receipt y handoff a superficies permanentes
```

Debe soportar:

- autosave durable;
- ETag/If-Match;
- pausa y reanudación;
- deep links;
- handoff entre actores;
- findings y solicitudes de cambio;
- aprobación separada de ejecución;
- dos organizaciones en pruebas negativas cross-tenant.

## 6. Branding incluido en Core 1.0

El branding organizacional es parte del Core, no un módulo.

Incluye:

- solicitud de origin;
- aprobación inicial Owner;
- challenge y verificación por Organization Admin;
- validación SSRF-safe y CORS anónimo;
- browser probe obligatorio;
- assets URL-first, sin almacenamiento permanente en Civitas;
- working draft;
- preview aislado;
- publicación inicial;
- actualizaciones posteriores;
- rollback por referencia;
- runtime health;
- auditoría e inmutabilidad de publicaciones.

El branding del login puede usar identidad visual de la organización. Después del login, Civitas conserva la identidad visual Didaxus/Civitas y únicamente presenta contexto organizacional acotado.

## 7. Cupos, entitlements y sincronización de sillas

No existe una silla global facturable automática.

Cadena canónica:

```text
module subscription
→ module entitlement
→ module-specific billing policy
→ module usage ledger
```

Core 1.0 debe implementar:

- subscriptions por organización y módulo;
- entitlements y límites aprobados;
- cupos operativos;
- asignación y liberación idempotente;
- eventos de uso;
- usage ledger con `moduleId`, `dimensionKey`, cantidad, provenance, versión de política y periodo;
- overage, gracia, bloqueo o warning según política;
- reconciliación y evidencia.

Una membership no genera facturación automáticamente. Una política comercial versionada interpreta eventos de membership o uso cuando corresponda.

Los proveedores de pago, facturación electrónica y conciliación financiera quedan fuera de Core 1.0.

## 8. Qué significa “listo para módulos”

Civitas está listo para módulos cuando dispone de contratos versionados, no cuando los módulos están implementados.

Cada módulo futuro debe poder contribuir:

- `ModuleManifest`;
- capabilities;
- permisos y Data Scope;
- subscription y entitlement dimensions;
- UI contribution;
- REST contract;
- MCP tool manifests;
- events y operations;
- runtime binding;
- health y compatibility;
- secrets requirements;
- rollback y decommissioning.

Lifecycle separado:

```text
catalogued
→ entitled
→ installation_pending
→ pending_configuration
→ configured
→ active
→ degraded
→ suspended
→ deprecated
→ removed
```

`entitled`, `installed`, `configured`, `active` y `runtime bound` no son equivalentes.

## 9. Fronteras de futuros sistemas

### Ágora / Planning

Sistema independiente para dominio pedagógico. Civitas gobierna acceso, tenant, entitlement, navegación, REST facade, MCP registry y disponibilidad. Ágora conserva dominio, persistencia, workflows e IA.

### Plasma

Sistema independiente de producción y diseño visual. Recibe handoffs versionados e inmutables desde Planning. No comparte base de datos con Civitas ni con Ágora.

### LMS

Runtime independiente que recibe estructura y recursos aprobados. Civitas expone capacidades provider-neutral; Moodle, Canvas u otros son adapters.

### CRM y Marketing

Pueden compartir un mismo proveedor, por ejemplo Mautic, pero conservan capabilities distintas. Civitas no implementa un CRM o marketing engine propio en Core 1.0.

### Analytics

Módulo futuro compuesto por capacidades gobernadas. Matomo puede aportar analítica digital; un LRS puede aportar xAPI. Ninguno se convierte en autoridad de tenant o autorización.

### Billing y Payments

El Core conserva subscriptions, entitlements y usage ledger. Facturación DIAN, Stripe, Mercado Pago, Wompi, Bancolombia y otros requieren runtime/adapters separados.

## 10. REST y MCP durante Core 1.0

### REST

- La API del Core sí es ejecutable.
- Los namespaces modulares pueden documentarse, pero permanecen sin montar o responden como capability no disponible según contrato.
- Los paths, operationIds, permisos y eventos son provider-neutral.
- No se permiten rutas como `/lms/moodle`, `/marketing/mautic` o `/payments/stripe`.

### MCP

- Existe un único contrato de Civitas MCP Runtime compartido.
- Los tool manifests modulares permanecen `planned`.
- Ningún agente accede directamente a Ágora, Plasma, LMS o proveedores.
- MCP, REST, UI y workers son adapters de entrada; no se llaman entre sí por loopback.
- Un tool solo puede activarse cuando existe application service o remote port real, consumidor, autorización, pruebas y rollback.

## 11. Gates de Core 1.0

Core 1.0 solo puede declararse operable cuando:

```text
Tenant Resolution PASS
AND Core Manager PASS
AND Organization Portal PASS
AND Identity/Membership PASS
AND Authorization PASS
AND Onboarding PASS
AND Branding PASS
AND Subscription/Entitlement/Usage PASS
AND Audit/Operations PASS
AND two-tenant E2E PASS
AND all business modules remain inactive
```

La ausencia de módulos activos no bloquea el release del Core.

## 12. Regla para issues y pull requests

Un issue del Core no puede exigir:

- implementar dominio de Ágora;
- implementar Plasma;
- implementar un LMS;
- implementar Mautic, Matomo, LRS o pasarelas de pago;
- activar tools MCP modulares;
- demostrar readiness de un runtime inexistente.

Los issues que mezclen Core, módulo, proveedor y production readiness deben dividirse o cerrarse como `not_planned/superseded`.

Toda nueva propuesta debe declarar explícitamente:

```text
ownerSystem: civitas-core | external-runtime | provider-adapter
deliveryClass: core-release | modular-contract | future-implementation
activationStatus: active | planned
```

## 13. Relación con paquetes documentales abiertos

Orden normativo:

1. Tenant Resolution — PR #247.
2. Organization Branding — PR #246.
3. Organization Onboarding — PR #248.
4. Core Scope Freeze y roadmap — este paquete.

La implementación del onboarding depende de Tenant Resolution y consume Branding como bounded context. Los tres paquetes documentales no prueban implementación hasta que sus repository compliance gates estén en PASS.
