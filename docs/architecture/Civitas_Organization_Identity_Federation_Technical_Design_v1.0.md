# CIVITAS ORGANIZATION IDENTITY FEDERATION

> **Historical legacy strings: explicitly marked.** Any `academic.section` or `academic.grade_level` below is retained only as historical/migration evidence; it is not an active alias.


## LDAP-backed Enterprise SSO, JIT Provisioning, Directory Synchronization and RBAC/PBAC/ABAC Reconciliation

**Documento:** CIV-ARCH-IDF-001  
**Versión:** 1.0  
**Estado:** Proposed - architecture and implementation contract  
**Repositorio:** `lssmanager/civitas10`  
**Issue principal:** `#154 Organization Identity Federation`  
**Fecha de corte:** 18 de julio de 2026  
**Audiencia:** Product Architecture, Security Engineering, Backend, Frontend, Platform, DevOps, QA y administradores empresariales de Didaxus

> Este documento es una especificación técnica autónoma. Conserva las decisiones relevantes aunque los issues de origen estén cerrados, reestructurados o archivados. La implementación futura debe enlazar sus cambios a este contrato o registrar explícitamente una ADR que lo reemplace.

<!-- PAGEBREAK -->

# Control del documento

## Propósito

Definir la capacidad faltante de **Organization Identity Federation** para Civitas: conectar el directorio de cada organización cliente mediante un proveedor de identidad OIDC o SAML, aprovisionar identidades sin CSV ni contraseñas locales, mapear grupos y atributos externos a roles canónicos de Civitas, derivar asignaciones PBAC/ABAC dentro de límites controlados y mantener el acceso sincronizado durante todo el ciclo de vida del usuario.

La especificación no describe solamente una pantalla. Define una capacidad de plataforma con contratos de autoridad, persistencia, APIs, workers, auditoría, seguridad, experiencia de administración, reconciliación y pruebas.

## Alcance normativo

Las palabras **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT** y **MAY** se interpretan como requisitos normativos:

- **MUST / MUST NOT:** requisito obligatorio para considerar compatible la implementación.
- **SHOULD / SHOULD NOT:** recomendación fuerte; una excepción exige justificación técnica y evidencia.
- **MAY:** opción permitida que no modifica los invariantes.

## Jerarquía de fuentes

Cuando exista contradicción, se aplica esta precedencia:

1. ADR vigente y explícitamente aceptada en el repositorio.
2. Este documento, mientras no exista una ADR posterior que lo reemplace.
3. Contratos canónicos compilados de Civitas.
4. Issues de implementación y prompts de ejecución.
5. Código existente, únicamente cuando no contradiga los niveles anteriores.
6. Comportamiento accidental o legacy, que nunca se considera contrato.

## Historial de revisiones

| Versión | Fecha | Estado | Resumen |
|---|---|---|---|
| 1.0 | 2026-07-18 | Proposed | Consolidación de #154 y de los contratos de identidad, Governance, RBAC, PBAC, ABAC, auditoría y registry. |

## Tabla de contenido

1. Resumen ejecutivo  
2. Contexto y problema  
3. Decisiones arquitectónicas  
4. Autoridades y fuentes canónicas  
5. Protocolos y patrones de integración  
6. Arquitectura objetivo  
7. Identity Governance Workspace y wizard  
8. Contrato de claims y atributos externos  
9. Mapeo RBAC, PBAC y ABAC  
10. Modelo de datos  
11. Contratos API  
12. Flujos runtime  
13. Reconciliación y ciclo de vida  
14. Seguridad y threat model  
15. Auditoría y observabilidad  
16. Pruebas y aceptación  
17. Plan de implementación  
18. Operación y soporte  
19. Riesgos y decisiones abiertas  
20. Referencias

# 1. Resumen ejecutivo

## 1.1 Decisión central

Civitas incorporará una capacidad organizacional denominada **Organization Identity Federation**. Cada colegio, universidad o institución conservará sus usuarios, credenciales, MFA, grupos y ciclo de vida en su directorio corporativo. Civitas no importará contraseñas y no exigirá archivos CSV como flujo principal.

La cadena de confianza será:

```text
LDAP / Active Directory / Google Workspace / Entra ID del cliente
                         |
                         | administrado por TI del cliente
                         v
            IdP empresarial OIDC o SAML
                         |
                         | autenticación y atributos externos
                         v
                       Logto
        identidad, organization membership, roles y tokens
                         |
                         | contratos de Civitas
                         v
              Civitas Identity Governance
  mapping, PBAC, ABAC, reconciliación, auditoría y módulos
                         |
          +--------------+------------------+
          |              |                  |
          v              v                  v
        Moodle          CRM              Analytics
   learning runtime   capability       capability
```

LDAP no se conectará directamente al frontend ni a Moodle. El LDAP estará detrás del IdP del cliente. El IdP expondrá OIDC o SAML hacia Logto. Civitas mediará toda operación administrativa contra Logto mediante backend y credenciales M2M.

## 1.2 Experiencia objetivo

Cuando la organización ya tenga un IdP preparado, el onboarding deberá ser un wizard breve:

1. Seleccionar OIDC o SAML.
2. Registrar discovery URL o metadata SAML y credenciales.
3. Verificar dominio, issuer, firma, audience y callback.
4. Ejecutar login de prueba.
5. Inspeccionar claims y grupos recibidos.
6. Mapear IDs de grupos externos a roles canónicos y, opcionalmente, a plantillas de Data Scope.
7. Configurar política de aprovisionamiento y reconciliación.
8. Ejecutar dry-run con usuarios de prueba.
9. Activar la conexión.

El objetivo de cinco minutos aplica a la configuración de Civitas cuando el cliente ya entrega metadata válida, credenciales, grupos coherentes y una cuenta de prueba. No es una promesa de reparar en cinco minutos un directorio sin segmentación, sin claims o sin IdP compatible.

## 1.3 Resultado de negocio

Una vez activada la federación:

- Los estudiantes, profesores, padres y administrativos usan sus credenciales institucionales.
- Los usuarios se crean o vinculan al primer acceso, o se preaprovisionan mediante sincronización.
- El administrador no asigna manualmente 200 profesores; mapea una vez el grupo externo de profesores.
- Los cambios de grupo pueden agregar o retirar roles gestionados por federación.
- Las relaciones académicas pueden producir Data Scope sin crear roles combinatorios.
- Moodle y otros módulos confían en Logto/Civitas, no en integraciones independientes con cada LDAP.
- La organización conserva la administración de sus identidades y Didaxus conserva la autoridad sobre su catálogo de roles, permisos, ceilings, políticas y módulos.

## 1.4 Restricción crítica

Un claim externo es una **señal autenticada**, no una autorización final. El flujo correcto es:

```text
external group or attribute
        -> validated organization mapping
        -> canonical Civitas role candidate
        -> Owner ceiling
        -> Tenant activation
        -> contextual policies
        -> Data Scope/resource validation
        -> effective allow or deny
```

Nunca se permitirá:

```text
external claim role=admin -> unconditional organization_admin
```

## 1.5 Limitación actual de Logto que condiciona el diseño

Logto soporta Enterprise SSO OIDC/SAML, asociación de conectores SSO a organizaciones y JIT con roles predeterminados. Sin embargo, la documentación pública no establece que el JIT nativo haga mapeo arbitrario `external group -> different organization role` por usuario. La implementación MUST iniciar con un spike que verifique, en la versión OSS desplegada, dónde quedan disponibles los claims upstream y si pueden consumirse de manera estable.

Mientras esa verificación no exista, el diseño admite tres estrategias compatibles:

1. Claims accesibles desde la identidad SSO de Logto y consumidos por un adapter backend.
2. Consulta segura al directorio mediante Microsoft Graph, Google Admin SDK, SCIM u otra API del proveedor.
3. Conector/broker de federación que normalice atributos antes de Logto.

No se autoriza asumir en producción que `groups` estará siempre presente en el token de Civitas.

# 2. Contexto y problema

## 2.1 Estado actual de Civitas

El repositorio establece estas fronteras:

- Logto es canónico para identidad, autenticación, organizaciones, memberships, roles, permisos y tokens.
- Civitas DB es canónica para estado operacional, auditoría, mappings técnicos, connector bindings, reconciliación, colas y reglas cross-system.
- Moodle, CRM, Community, Analytics y demás sistemas son adapters de capacidades; no son fuentes canónicas del tenant.
- El resource OAuth único es `https://civitas.didaxus.com/api`.
- Los roles organizacionales usan claves `organization_*`.
- Los permisos tenant usan IDs canónicos con namespace `org` y segmentos semánticos aprobados; wildcards están prohibidos.
- `owner_global` permanece separado de los roles de organización.

El flujo existente de alta de organización cubre creación de la organización en Logto, bootstrap del administrador y asignación inicial del rol administrativo. No define la federación empresarial por organización, la interpretación de claims, el mapeo de grupos, el lifecycle de identidades ni la reconciliación.

## 2.2 Brecha funcional

La navegación actual de Governance cubre roles, permisos, taxonomía, grupos, Data Scope, aliases, preview y auditoría, pero no incluye una capacidad operativa de:

- Configurar Enterprise SSO por organización.
- Verificar dominios y metadata.
- Inspeccionar claims reales.
- Mapear grupos externos.
- Definir políticas de JIT y deprovisioning.
- Diferenciar asignaciones manuales y federadas.
- Resolver drift entre el directorio y Logto.
- Gestionar incidentes de certificados, secretos o claims.

La ruta legacy `owner/role-mapping` no resuelve esta necesidad: es global, está inactiva y su semántica no debe mezclarse con mappings externos específicos de una organización.

## 2.3 Problema de escala

Sin federación y mappings, un colegio con miles de usuarios afrontaría uno o más de estos anti-patrones:

- CSV periódicos de usuarios.
- Contraseñas temporales o locales.
- Duplicación de cuentas en Civitas y Moodle.
- Asignación manual de roles usuario por usuario.
- Baja tardía de usuarios que abandonaron la institución.
- Nombres de roles inconsistentes entre instituciones.
- Roles combinatorios como `teacher_math_7b`.
- Integración independiente de cada módulo con el IdP.

La capacidad propuesta elimina esos anti-patrones sin ceder el control de autorización al directorio externo.

## 2.4 Objetivos

La implementación MUST:

- Ofrecer OIDC y SAML por organización.
- Vincular un Enterprise SSO Connector de Logto con una organización.
- Permitir JIT y, en fases posteriores, Directory Sync/SCIM.
- Usar identificadores externos inmutables.
- Mapear grupos externos a roles canónicos autorizados.
- Mapear atributos o grupos a Data Scope únicamente mediante templates publicados.
- Aplicar PBAC antes de materializar o activar asignaciones.
- Mantener provenance de cada asignación.
- Revocar únicamente lo que la fuente federada administra.
- Auditar toda mutación y reconciliación.
- Fallar cerrado ante datos ambiguos, stale o cross-tenant.
- Integrarse con el Governance Workspace route-backed.

## 2.5 Non-goals

Esta capacidad MUST NOT:

- Convertir Civitas en un LDAP server.
- Almacenar contraseñas del colegio.
- Permitir que el tenant cree roles o permisos canónicos.
- Reemplazar Logto como autoridad de identidad y RBAC.
- Convertir nombres de grupos en permisos automáticos.
- Tratar email como identificador inmutable universal.
- Crear roles por materia, grado, sección o campus.
- Dar acceso a Moodle por fuera de la autorización de Civitas.
- Usar el frontend como enforcement final.
- Guardar secretos OIDC/SAML en texto plano en PostgreSQL.
- Hacer Management API calls de Logto en cada request funcional normal.

# 3. Decisiones arquitectónicas

## 3.1 LDAP detrás de un IdP

LDAP es un protocolo/directorio, no el protocolo de SSO que consumirá Civitas. El colegio debe exponer su directorio mediante un IdP compatible:

| Directorio fuente | Capa IdP típica | Protocolo hacia Logto |
|---|---|---|
| Active Directory on-premises | Entra ID, ADFS, Keycloak, Authentik, Shibboleth | OIDC o SAML |
| OpenLDAP | Keycloak, Authentik, Shibboleth u otro broker | OIDC o SAML |
| Google Workspace | Google Workspace Enterprise SSO | OIDC |
| Microsoft Entra ID | Enterprise application / app registration | OIDC o SAML |
| Otro SaaS IdP | Okta, Ping, OneLogin u otro | OIDC o SAML |

Civitas MAY publicar guías por proveedor, pero el contrato interno seguirá siendo provider-neutral.

## 3.2 OIDC preferido, SAML soportado

OIDC SHOULD ser la opción preferida para nuevas integraciones por su modelo JSON/JWT, discovery estándar y mejor alineación con la arquitectura OAuth de Logto. SAML MUST ser soportado para instituciones que ya lo usan o cuyo proveedor no expone OIDC adecuado.

La elección de protocolo no modifica el modelo de autorización. Ambos deben producir una representación normalizada de identidad y atributos.

## 3.3 JIT no equivale a Directory Sync

JIT se ejecuta por una acción del usuario, normalmente el primer login. Directory Sync puede ejecutarse sin que el usuario inicie sesión y puede imponer altas, cambios y bajas.

Por tanto:

- JIT es suficiente para onboarding y vinculación inicial.
- Login-time reconciliation mejora la actualización al volver a entrar.
- SCIM o provider API sync es necesario para bajas oportunas de usuarios que no vuelven a iniciar sesión.
- Un usuario retirado del directorio puede conservar acceso hasta que expire sesión/token o se ejecute reconciliación si solo existe JIT.

## 3.4 Roles predeterminados

`organization_student` MUST NOT ser el rol JIT predeterminado de un conector que admita población mixta.

Política recomendada:

- Conector exclusivo de estudiantes: MAY usar `organization_student` como default si la restricción está demostrada.
- Conector mixto: usar ningún rol funcional, un rol mínimo `organization_member` o estado `pending_mapping`.
- Roles privilegiados: nunca se asignan por fallback.

## 3.5 Mappings por organización

Cada mapping se interpreta dentro del tuple:

```text
logto_organization_id
+ identity_connection_id
+ external_group_id or external_attribute_value
+ mapping_version
```

Un grupo denominado `Admins` en el Colegio X no tiene relación semántica automática con `Admins` en el Colegio Y.

## 3.6 Identificadores estables

OIDC:

```text
external subject key = issuer + sub
```

SAML:

```text
external subject key = IdP entityID + persistent NameID
```

Cuando el NameID no sea persistente, el wizard MUST exigir un atributo inmutable acordado con el colegio. El email solo MAY usarse para linking inicial si está verificado y la política de colisión está explícitamente configurada.

## 3.7 Asignaciones con provenance

Toda asignación de rol o scope debe registrar fuente:

```text
manual
federated_jit
federated_login_reconciliation
directory_sync_scim
provider_api_sync
bootstrap_profile
support_override
```

Una fuente solo puede revocar asignaciones que ella administra, salvo que una política explícita declare modo authoritative.

# 4. Autoridades y fuentes canónicas

## 4.1 Matriz de autoridad

| Dominio | Autoridad canónica | Responsabilidad |
|---|---|---|
| Credenciales, password, upstream MFA | IdP del cliente | Autenticar al usuario según políticas del cliente. |
| Usuarios Logto, identities, organizations, memberships | Logto | Identidad y tenant context. |
| Roles y permisos canónicos | Catálogo Civitas provisionado en Logto | Definir potencial de RBAC. |
| Conexión Enterprise SSO | Logto, administrada por backend Civitas | Autenticación federada. |
| Mapeo external group -> canonical role | Civitas DB | Traducción controlada por organización. |
| Owner ceilings | Civitas DB | Límite máximo por organización/rol/permiso. |
| Tenant activation | Civitas DB | Activación dentro del ceiling. |
| Taxonomía, units, relationships, Data Scope | Civitas DB y capability adapters | ABAC/ReBAC y recursos autorizados. |
| Cursos, actividades, calificaciones | Moodle/LMS adapter | Runtime educativo, bajo contracts de Civitas. |
| Auditoría, drift, outbox, reconciliación | Civitas DB | Evidencia y consistencia operacional. |

## 4.2 Pipeline de autorización

```text
verified identity and token
  -> correct issuer / signature / audience / expiry
  -> organization_id matches route and resource tenant
  -> active canonical permission in token scope
  -> complete canonical role path
  -> Owner ceiling
  -> Tenant activation
  -> contextual policies and delegation
  -> Data Scope template + assignments
  -> resource ownership validation
  -> allow or deny with first reason and provenance
```

El mapping federado no reemplaza ese pipeline. Solo crea, actualiza o propone facts de entrada: membership, role assignment y Data Scope assignment.

## 4.3 Regla de no duplicación

Civitas DB MUST NOT crear tablas canónicas paralelas de usuarios, organizaciones, roles o permissions. Puede mantener:

- referencias Logto;
- external identities;
- mappings;
- snapshots de reconciliación;
- provenance;
- cache UX;
- estado operacional.

## 4.4 Owner y tenant

Owner define:

- roles canónicos disponibles;
- permisos potenciales;
- ceilings;
- templates de mappings autorizados;
- roles elegibles para autoaprovisionamiento;
- restricciones sobre roles sensibles;
- políticas de soporte y break-glass.

Tenant admin define, dentro de esos límites:

- conexión asignada a su organización, cuando el plan lo permite;
- claim o atributo que contiene grupos;
- mappings de IDs externos a roles permitidos;
- mappings a templates ABAC publicados;
- fallback y revisión;
- modo de reconciliación permitido.

# 5. Protocolos y patrones de integración

## 5.1 OIDC

OIDC es una capa de identidad sobre OAuth 2.0. El IdP autentica al usuario y emite claims. Para cada conexión, Civitas MUST validar y fijar:

- issuer exacto HTTPS;
- discovery document;
- authorization endpoint;
- token endpoint;
- JWKS URI;
- client ID;
- client authentication method;
- redirect URI exacta;
- allowed signing algorithms;
- scopes solicitados;
- `state`, `nonce` y PKCE cuando aplique;
- `sub` como identificador local al issuer;
- política de claims requeridos.

Ejemplo de claim upstream normalizado:

```json
{
  "issuer": "https://idp.colegiox.edu.co",
  "subject": "00u-immutable-user-id",
  "email": "profesor@colegiox.edu.co",
  "emailVerified": true,
  "displayName": "María Gómez",
  "groups": [
    {"id": "grp-teachers-8f12", "displayName": "Teachers"},
    {"id": "grp-math-02aa", "displayName": "Mathematics"}
  ],
  "assurance": {
    "acr": "urn:example:mfa",
    "amr": ["pwd", "mfa"]
  }
}
```

La representación anterior es un contrato interno; no implica que todos los IdP entreguen exactamente esos campos.

## 5.2 SAML 2.0

Para SAML, Civitas/Logto MUST validar:

- IdP entity ID;
- metadata firmada o descargada por canal confiable;
- SSO endpoint;
- certificados de firma activos y próximos;
- SP entity ID;
- ACS URL exacta;
- firma de Response y/o Assertion según política;
- audience restriction;
- recipient/destination;
- `InResponseTo` para SP-initiated flow;
- `NotBefore` y `NotOnOrAfter` con clock skew limitado;
- persistent NameID o atributo inmutable;
- atributos requeridos y sus NameFormat.

Ejemplo conceptual:

```xml
<saml:AttributeStatement>
  <saml:Attribute Name="groups">
    <saml:AttributeValue>grp-teachers-8f12</saml:AttributeValue>
    <saml:AttributeValue>grp-math-02aa</saml:AttributeValue>
  </saml:Attribute>
</saml:AttributeStatement>
```

Los IDs externos SHOULD ser valores estables y no display names.

## 5.3 SCIM 2.0

SCIM es el mecanismo recomendado para sincronización continua cuando el cliente lo soporte. Una fase posterior MAY exponer a cada conexión un endpoint tenant-bound:

```text
https://civitas.didaxus.com/scim/v2/connections/{opaqueConnectionId}
```

La autenticación del endpoint SCIM MUST estar ligada a una sola organización y conexión. SCIM no define por sí mismo el modelo multi-tenant, por lo que Civitas debe aplicar aislamiento explícito.

Recursos mínimos futuros:

```text
GET  /ServiceProviderConfig
GET  /ResourceTypes
GET  /Schemas
GET  /Users
POST /Users
PATCH /Users/:id
GET  /Groups
POST /Groups
PATCH /Groups/:id
```

SCIM no se requiere para el MVP JIT, pero el modelo de datos no debe impedirlo.

## 5.4 Provider API synchronization

Cuando SCIM no esté disponible:

- Microsoft Entra: Microsoft Graph MAY resolver memberships, especialmente cuando exista group overage.
- Google Workspace: Admin SDK Directory API MAY resolver users, groups y memberships.
- Otros IdP: adapter específico con credenciales server-side y scopes mínimos.

Las credenciales de provider API son distintas de las credenciales OIDC/SAML y deben gestionarse como un connector separado.

## 5.5 Group claim overage

La implementación MUST asumir que el claim de grupos puede estar incompleto. Microsoft Entra limita el número de grupos emitidos y usa señales de overage. El resolver debe:

1. Detectar la señal de overage.
2. No interpretar ausencia de `groups` como “cero grupos” cuando exista overage.
3. Consultar el API autorizado del proveedor o enviar el usuario a revisión.
4. Registrar `external_groups_incomplete`.
5. Fallar cerrado para roles nuevos y evitar revocación masiva basada en información incompleta.

## 5.6 Nested groups

Cada conexión debe declarar:

```text
groupMembershipMode = direct | transitive | provider_defined
```

La UI debe mostrar esa semántica. Cambiarla requiere impact preview y nueva versión de mapping.

# 6. Arquitectura objetivo

## 6.1 Componentes

```text
+-------------------------------------------------------------+
| Civitas Frontend                                            |
| Identity & Provisioning Wizard / Governance / Audit         |
+-------------------------------+-----------------------------+
                                |
                                v
+-------------------------------------------------------------+
| Civitas API                                                 |
| - IdentityFederationController                              |
| - IdentityConnectionService                                 |
| - ExternalClaimNormalizer                                   |
| - FederationMappingService                                  |
| - ProvisioningPolicyService                                 |
| - ReconciliationService                                     |
| - AuthorizationPolicyEvaluator                              |
| - Audit / Outbox                                            |
+-------------+------------------+-----------------------------+
              |                  |
              v                  v
+-------------------------+   +--------------------------------+
| Logto Management Adapter|   | Provider Directory Adapters    |
| SSO connectors, JIT,    |   | Graph, Google Admin, SCIM      |
| users, memberships,roles|   | or custom enterprise directory |
+------------+------------+   +---------------+----------------+
             |                                |
             v                                v
+-------------------------+       +----------------------------+
| Logto                   |       | Customer IdP / Directory   |
| authentication + tokens |       | LDAP, Entra, Google, etc.  |
+-------------------------+       +----------------------------+
              |
              v
+-------------------------------------------------------------+
| Capability adapters: LMS, CRM, Analytics, Community, etc.   |
+-------------------------------------------------------------+
```

## 6.2 Módulos backend propuestos

```text
backend/identity-federation/
├── contracts/
│   ├── identity-connection.schema.ts
│   ├── normalized-external-identity.schema.ts
│   ├── federation-mapping.schema.ts
│   ├── provisioning-policy.schema.ts
│   └── reconciliation.schema.ts
├── domain/
│   ├── identity-connection.service.ts
│   ├── claim-normalizer.service.ts
│   ├── role-mapping.service.ts
│   ├── scope-mapping.service.ts
│   ├── provisioning-orchestrator.service.ts
│   └── reconciliation.service.ts
├── adapters/
│   ├── logto-enterprise-sso.adapter.ts
│   ├── logto-organization.adapter.ts
│   ├── entra-directory.adapter.ts
│   ├── google-directory.adapter.ts
│   └── scim.adapter.ts
├── repositories/
│   └── postgres-*.repository.ts
├── routes/
├── workers/
└── tests/
```

Los nombres son propuestos. La implementación debe ajustarse al layout real sin crear un segundo registry o un segundo motor de autorización.

## 6.3 Integración con module registry

Identity Federation es una capacidad de plataforma, no un adapter de negocio como Moodle. Si se integra al module manifest, el manifest solo declara ownership y lifecycle:

```json
{
  "moduleKey": "identity-federation",
  "capabilities": ["identity.federation", "identity.provisioning"],
  "lifecycle": "active"
}
```

El manifest MUST NOT contener secretos, mappings, roles, permisos ni provider code.

## 6.4 Lifecycle de la conexión

Estados canónicos:

```text
draft
validating
ready
active
degraded
suspended
rotating_credentials
decommissioning
archived
```

Transiciones importantes:

```text
draft -> validating -> ready -> active
active -> degraded -> active
active -> suspended -> active
active -> rotating_credentials -> active
active -> decommissioning -> archived
```

Cada transición exige actor/source, reason, version, timestamp y audit event.

# 7. Identity Governance Workspace y wizard

## 7.1 Topología de navegación

Extensión propuesta al Organization Governance Workspace:

```text
/owner/organizations/:organizationId
└── Governance
    ├── Identity & provisioning
    │   ├── Connection
    │   ├── Claims and mappings
    │   ├── Provisioning policy
    │   └── Reconciliation
    ├── Access policy
    ├── Organization model
    └── Control and evidence
```

Tenant surface:

```text
/o/:organizationId/settings/governance/identity
/o/:organizationId/settings/governance/identity/claims
/o/:organizationId/settings/governance/identity/provisioning
/o/:organizationId/settings/governance/identity/reconciliation
```

Owner surface:

```text
/owner/organizations/:organizationId/governance/identity
```

No debe existir un segundo overview de Governance.

## 7.2 Candidate permissions

Estos permisos son candidatos y MUST permanecer `planned` hasta tener catálogo, handlers, policies, tests y consumidores reales:

| Surface | Candidate permission | Uso |
|---|---|---|
| Owner | `owner.identity_federation.read` | Ver cualquier conexión organizacional. |
| Owner | `owner.identity_federation.manage` | Crear, suspender o reparar conexiones. |
| Owner | `owner.identity_federation.support` | Intervención auditada con razón. |
| Tenant | `org.identity_federation.read` | Ver la conexión de su organización. |
| Tenant | `org.identity_federation.manage` | Configurar dentro de policy owner. |
| Tenant | `org.identity_mappings.read` | Ver mappings externos. |
| Tenant | `org.identity_mappings.manage` | Gestionar mappings autorizados. |
| Tenant | `org.identity_reconciliation.read` | Ver drift y runs. |
| Tenant | `org.identity_reconciliation.execute` | Ejecutar dry-run/run controlado. |

No se provisionará ningún permiso por el solo hecho de aparecer aquí.

## 7.3 Wizard paso a paso

### Paso 0 - Preflight

Mostrar requisitos:

- Protocolo soportado.
- Metadata/issuer.
- Credenciales.
- Dominio institucional.
- Cuenta de prueba.
- Claim/atributo de grupos o alternativa de directory API.
- Confirmación de que Didaxus no solicita contraseñas de usuarios.

### Paso 1 - Selección del proveedor

Opciones:

```text
Microsoft Entra ID (OIDC)
Microsoft Entra ID (SAML)
Google Workspace (OIDC)
Okta (OIDC)
Generic OpenID Connect
Generic SAML 2.0
```

La selección define un formulario y validadores, no una nueva semántica de autorización.

### Paso 2 - Connection metadata

OIDC:

```text
issuer / discovery URL
client ID
client secret or private-key auth
redirect URI generated by Civitas
requested scopes
allowed domains
```

SAML:

```text
IdP entity ID
metadata URL or XML upload
signing certificate(s)
SP entity ID generated by Civitas/Logto
ACS URL generated by Civitas/Logto
NameID policy
allowed domains
```

Los secretos se envían al backend y nunca regresan al navegador.

### Paso 3 - Validación técnica

Validar sin activar:

- HTTPS y allowlist de egress.
- Discovery/metadata schema.
- Issuer/entity ID.
- Endpoints y redirects.
- Algoritmos permitidos.
- Certificados y fechas de expiración.
- Callback accesible.
- Creación o actualización del connector en modo plan.

### Paso 4 - Login de prueba

El administrador inicia sesión con una cuenta representativa. La prueba crea un `test session` aislado; no asigna roles ni membresías productivas.

Mostrar un claim inspector redactado:

```json
{
  "subject": "00u-immutable-id",
  "email": "m***@colegiox.edu.co",
  "groups": [
    {"id": "grp-teachers-8f12", "displayName": "Teachers"}
  ],
  "claimsComplete": true
}
```

### Paso 5 - Claim contract

Seleccionar:

- Subject identifier.
- Email y verified flag.
- Display name.
- Group claim.
- Department/campus/grade claims opcionales.
- Direct vs transitive membership.
- Overage detection.
- Required vs optional attributes.

La configuración queda versionada.

### Paso 6 - Role mappings

Ejemplo:

| External group ID | Display name | Canonical role | Mode | Privilege |
|---|---|---|---|---|
| `grp-students-77bc` | Students | `organization_student` | automatic | standard |
| `grp-teachers-8f12` | Teachers | `organization_teacher` | automatic | standard |
| `grp-directors-11da` | Directors | `organization_director` | approval or automatic by policy | sensitive |
| `grp-itadmins-d920` | IT Admins | `organization_admin` | approval required | privileged |

El selector solo muestra roles permitidos por Owner y delegation policies.

### Paso 7 - Data Scope mappings

Ejemplo:

| External value | Mapping target | Semántica |
|---|---|---|
| `grp-math-02aa` | `academic.subject=mathematics` | ABAC dimension |
| `grp-grade7-03bb` | `academic.grade=grade-7` | ABAC dimension |
| `grp-section7b-04cc` | organization unit `section-7b` | Unit scope |
| `grp-campusnorth-05dd` | organization unit `campus-north` | Unit scope |

Solo se pueden seleccionar templates publicados y valores activos.

### Paso 8 - Provisioning policy

Configurar:

```text
join mode: JIT | preprovision | hybrid
fallback: deny | pending review | organization_member
role sync: additive | managed | authoritative
scope sync: additive | managed | authoritative
remove absent assignments: true/false
suspend on directory disable: true/false
review privileged mappings: always/first-time/never-by-owner-policy
login-time reconciliation: enabled/disabled
scheduled reconciliation: cadence
```

### Paso 9 - Dry-run

Seleccionar usuarios de prueba y mostrar desired vs actual:

```text
User: professor@colegiox.edu.co
Current: no organization membership
Desired:
  membership Colegio X
  role organization_teacher
  scope academic.subject=mathematics
  scope academic.section=7B
Blocked:
  organization_admin - not present
Result: safe to apply
```

### Paso 10 - Activación

Activación atómica:

1. Persistir versión del connection contract.
2. Configurar/bind connector en Logto.
3. Configurar JIT association.
4. Publicar mappings.
5. Incrementar policy version.
6. Emitir outbox events.
7. Auditar before/after.
8. Ejecutar smoke test.
9. Marcar `active` solo si todos los gates pasan.

## 7.4 Estados UX obligatorios

```text
loading
empty
not_configured
validating
ready_to_activate
active
degraded
suspended
credentials_expiring
claims_changed
reconciliation_required
denied
unavailable
error
```

No usar una pantalla vacía como equivalente de “todo correcto”.

# 8. Contrato de claims y atributos externos

## 8.1 NormalizedExternalIdentity

```ts
type NormalizedExternalIdentity = {
  connectionId: string;
  organizationId: string;
  protocol: "oidc" | "saml";
  issuer: string;
  subject: string;
  email?: string;
  emailVerified?: boolean;
  displayName?: string;
  groups: Array<{
    id: string;
    displayName?: string;
    source: string;
  }>;
  attributes: Record<string, string | string[]>;
  claimsComplete: boolean;
  incompletenessReason?: "overage" | "provider_error" | "not_configured";
  authenticatedAt: string;
  assurance?: {
    acr?: string;
    amr?: string[];
  };
};
```

## 8.2 Claim allowlist

La conexión debe definir una allowlist. Claims no declarados:

- no se persisten por defecto;
- no aparecen en auditoría;
- no se reenvían a módulos;
- no participan en autorización.

## 8.3 Data minimization

Persistencia recomendada:

- issuer y subject: necesarios.
- external group IDs: necesarios para mapping/provenance.
- display names: cache UX, no identidad.
- email: solo cuando sea necesario para linking y notificación.
- raw token/assertion: no persistir; MAY retenerse cifrado y por minutos en una sesión de diagnóstico owner-only si existe necesidad operacional documentada.

## 8.4 Claim contract version

Cada interpretación de claims tiene versión:

```text
claimContractVersion = 4
mappingVersion = 9
provisioningPolicyVersion = 6
authzPolicyVersion = 27
```

La decisión efectiva debe registrar esas versiones.

## 8.5 Cambio de claim

Si el IdP cambia `groups` por `memberOf`, Civitas debe detectar:

```text
required_claim_missing
```

y pasar la conexión a `degraded`, evitando revocaciones masivas hasta que exista evidencia completa.

# 9. Mapeo RBAC, PBAC y ABAC

## 9.1 RBAC

El mapping transforma una señal externa en una asignación de rol canónico potencial:

```text
external group grp-teachers-8f12
  -> organization_teacher
```

Antes de aplicar:

- el rol existe en el catálogo;
- pertenece a surface organization;
- está permitido para autoaprovisionamiento;
- el actor puede configurar el mapping;
- el target role no viola delegation ceiling;
- el mapping está active y versionado;
- la conexión pertenece a la misma organización.

## 9.2 PBAC

El mapping no amplía el Owner ceiling. Ejemplo:

```text
external group = Directors
canonical role = organization_director
Owner ceiling denies lms.grades.manage
```

Resultado:

```text
membership and role MAY be assigned
lms.grades.manage remains denied
```

## 9.3 ABAC/Data Scope

Los grupos externos pueden aportar facts para templates ABAC:

```text
Teacher + Mathematics + Section 7B
```

Se materializa como:

```text
role path: organization_teacher
scope template: teacher-assigned-subject-section
subject dimension value: mathematics
unit: section-7b
source: federated_jit
```

No se crea `organization_teacher_math_7b`.

## 9.4 Multi-role semantics

Si un usuario recibe varios roles, Civitas conserva complete-path OR:

```text
path A must pass role + ceiling + activation + policy + scope
OR
path B must pass role + ceiling + activation + policy + scope
```

Está prohibido tomar el permiso de un rol y el Data Scope de otro para construir una autorización que ningún path completo permite.

## 9.5 Conflictos de mapping

Casos:

- Un grupo mapea a múltiples roles: permitido solo si explícito y no privilegiado por accidente.
- Múltiples grupos mapean al mismo rol: se conserva provenance múltiple; el rol se retira cuando no queda ninguna fuente activa.
- Un mapping concede y otro deniega: los mappings no conceden denies de permisos; el evaluator aplica ceilings/policies. Una política de exclusión MAY bloquear la asignación.
- Un usuario pertenece a Student y Teacher: se permiten ambos roles únicamente si la política organizacional lo acepta; de lo contrario, queda `mapping_conflict` para revisión.

## 9.6 Privileged roles

Roles sensibles MUST tener política explícita:

```text
organization_admin
organization_director
organization_accountant
organization_billing
organization_payroll
```

Controles posibles:

- grupo externo dedicado y protegido;
- approval de dos personas;
- MFA requerido;
- validez temporal;
- notificación al Owner;
- review periódico;
- prohibition de auto-role en first login.

`owner_global` nunca es elegible.

## 9.7 Manual vs federated

Ejemplo:

```text
organization_teacher
  source A: federated group Teachers
  source B: manual assignment by tenant admin
```

Si el usuario sale de Teachers, la reconciliación elimina source A, pero el rol permanece por source B. La vista debe mostrar el resultado y su provenance.

# 10. Modelo de datos

## 10.1 Principios

- Todos los registros tenant-scoped incluyen `logto_organization_id NOT NULL`.
- IDs Logto se almacenan como `varchar`, no se asumen UUID.
- IDs internos MAY ser UUID.
- Display names son cache, nunca identidad.
- Secrets no se almacenan en tablas normales.
- Toda mutación sensible usa optimistic concurrency y audit/outbox.
- Índices y constraints deben impedir cross-tenant references.

## 10.2 organization_identity_connections

```sql
id uuid primary key
logto_organization_id varchar not null
logto_sso_connector_id varchar null
protocol varchar not null check (protocol in ('oidc','saml'))
provider_kind varchar not null
name varchar not null
status varchar not null
issuer_or_entity_id varchar not null
subject_strategy varchar not null
group_membership_mode varchar not null
claim_contract_version bigint not null
mapping_version bigint not null
provisioning_policy_version bigint not null
configuration_fingerprint varchar not null
secret_reference varchar null
last_validated_at timestamptz null
last_successful_login_at timestamptz null
created_by_logto_user_id varchar not null
updated_by_logto_user_id varchar not null
created_at timestamptz not null
updated_at timestamptz not null

unique (logto_organization_id, id)
```

`secret_reference` apunta a Logto o a un secret manager; nunca contiene el secret.

## 10.3 organization_identity_domains

```sql
id uuid primary key
connection_id uuid not null
authority_domain varchar not null
routing_priority integer not null
domain_verified boolean not null default false
verification_method varchar null
verified_at timestamptz null
status varchar not null
unique (connection_id, authority_domain)
```

## 10.4 organization_identity_claim_mappings

```sql
id uuid primary key
logto_organization_id varchar not null
connection_id uuid not null
normalized_field varchar not null
external_claim_name varchar not null
value_type varchar not null
required boolean not null
transform_key varchar null
version bigint not null
created_at timestamptz not null
updated_at timestamptz not null
```

Transforms son funciones registradas y revisadas, no scripts tenant free-form.

## 10.5 organization_external_groups

```sql
id uuid primary key
logto_organization_id varchar not null
connection_id uuid not null
external_group_id varchar not null
external_display_name varchar null
external_parent_id varchar null
membership_mode varchar not null
status varchar not null
last_observed_at timestamptz not null
source_version varchar null
unique (connection_id, external_group_id)
```

## 10.6 organization_external_role_mappings

```sql
id uuid primary key
logto_organization_id varchar not null
connection_id uuid not null
external_group_id varchar not null
logto_role_id varchar not null
canonical_role_key varchar not null
mode varchar not null
approval_policy varchar not null
status varchar not null
version bigint not null
created_by_logto_user_id varchar not null
updated_by_logto_user_id varchar not null
created_at timestamptz not null
updated_at timestamptz not null
unique (connection_id, external_group_id, logto_role_id)
```

Constraint de service layer:

```text
canonical_role_key != owner_global
role belongs to organization template
role is within Owner-published mapping ceiling
```

## 10.7 organization_external_scope_mappings

```sql
id uuid primary key
logto_organization_id varchar not null
connection_id uuid not null
external_group_id varchar not null
scope_template_id varchar not null
scope_template_version varchar not null
target_kind varchar not null
dimension_value_id uuid null
unit_id uuid null
resource_ref varchar null
status varchar not null
version bigint not null
created_at timestamptz not null
updated_at timestamptz not null
check (num_nonnulls(dimension_value_id, unit_id, resource_ref) = 1)
```

## 10.8 organization_provisioning_policies

```sql
logto_organization_id varchar primary key
connection_id uuid not null
join_mode varchar not null
fallback_mode varchar not null
role_sync_mode varchar not null
scope_sync_mode varchar not null
remove_absent_managed_assignments boolean not null
suspend_disabled_users boolean not null
privileged_role_mode varchar not null
login_reconciliation_enabled boolean not null
scheduled_reconciliation_enabled boolean not null
reconciliation_interval_minutes integer null
grace_period_minutes integer not null
version bigint not null
updated_by_logto_user_id varchar not null
updated_at timestamptz not null
```

## 10.9 organization_external_identities

Operational linking table, no canonical duplicate user profile:

```sql
id uuid primary key
logto_organization_id varchar not null
connection_id uuid not null
external_issuer varchar not null
external_subject varchar not null
logto_user_id varchar null
link_status varchar not null
email_cache varchar null
last_authenticated_at timestamptz null
last_reconciled_at timestamptz null
unique (connection_id, external_subject)
```

## 10.10 organization_federated_assignment_sources

```sql
id uuid primary key
logto_organization_id varchar not null
logto_user_id varchar not null
assignment_kind varchar not null
assignment_key varchar not null
source_kind varchar not null
source_connection_id uuid null
source_external_group_id varchar null
mapping_id uuid null
mapping_version bigint not null
state varchar not null
valid_from timestamptz not null
valid_until timestamptz null
created_at timestamptz not null
updated_at timestamptz not null
```

`assignment_key` referencia rol, Data Scope assignment u otra entidad controlada.

## 10.11 organization_identity_reconciliation_runs

```sql
id uuid primary key
logto_organization_id varchar not null
connection_id uuid not null
mode varchar not null
trigger_source varchar not null
status varchar not null
started_at timestamptz not null
completed_at timestamptz null
mapping_version bigint not null
policy_version bigint not null
total_subjects integer not null default 0
created_count integer not null default 0
updated_count integer not null default 0
removed_count integer not null default 0
blocked_count integer not null default 0
error_count integer not null default 0
correlation_id varchar not null
```

## 10.12 organization_identity_reconciliation_items

```sql
id uuid primary key
run_id uuid not null
external_subject_hash varchar not null
logto_user_id varchar null
decision varchar not null
reason_code varchar not null
before_summary jsonb null
after_summary jsonb null
redaction_class varchar not null
created_at timestamptz not null
```

No almacenar raw tokens ni assertions.

## 10.13 Auditoría

Usar el audit/outbox canónico existente. No crear un audit silo si ya existe contrato compartido. Eventos mínimos:

```text
identity.connection.created
identity.connection.validated
identity.connection.activated
identity.connection.suspended
identity.claim_contract.changed
identity.mapping.created
identity.mapping.changed
identity.mapping.deleted
identity.provisioning.user_linked
identity.provisioning.membership_added
identity.provisioning.role_added
identity.provisioning.role_removed
identity.provisioning.scope_added
identity.provisioning.scope_removed
identity.reconciliation.started
identity.reconciliation.completed
identity.reconciliation.blocked
identity.secret.rotated
identity.certificate.expiring
```

# 11. Contratos API

## 11.1 Convenciones

- Todas las rutas organization-scoped validan `organization_id` contra el token y la ruta.
- Owner routes y tenant routes permanecen separadas.
- Cada mutation acepta `If-Match` o `expectedVersion`.
- Operaciones reintentables aceptan `Idempotency-Key`.
- Respuestas usan reason codes estables.
- No se exponen secrets después de guardarlos.

## 11.2 Owner APIs

```http
GET  /owner/organizations/:organizationId/identity/connections
POST /owner/organizations/:organizationId/identity/connections
GET  /owner/organizations/:organizationId/identity/connections/:connectionId
PUT  /owner/organizations/:organizationId/identity/connections/:connectionId
POST /owner/organizations/:organizationId/identity/connections/:connectionId/validate
POST /owner/organizations/:organizationId/identity/connections/:connectionId/activate
POST /owner/organizations/:organizationId/identity/connections/:connectionId/suspend
POST /owner/organizations/:organizationId/identity/connections/:connectionId/support-reconcile
```

## 11.3 Tenant APIs

```http
GET  /o/:organizationId/identity/connection
GET  /o/:organizationId/identity/claims
PUT  /o/:organizationId/identity/claim-contract
GET  /o/:organizationId/identity/role-mappings
POST /o/:organizationId/identity/role-mappings
PUT  /o/:organizationId/identity/role-mappings/:mappingId
DELETE /o/:organizationId/identity/role-mappings/:mappingId
GET  /o/:organizationId/identity/scope-mappings
POST /o/:organizationId/identity/scope-mappings
PUT  /o/:organizationId/identity/provisioning-policy
POST /o/:organizationId/identity/test-login-session
POST /o/:organizationId/identity/dry-run
POST /o/:organizationId/identity/reconciliation-runs
GET  /o/:organizationId/identity/reconciliation-runs
GET  /o/:organizationId/identity/reconciliation-runs/:runId
```

## 11.4 Create connection request

```json
{
  "protocol": "oidc",
  "providerKind": "generic_oidc",
  "name": "Colegio X SSO",
  "issuer": "https://idp.colegiox.edu.co",
  "clientId": "civitas-production",
  "clientSecret": "write-only-secret",
  "allowedDomains": ["colegiox.edu.co"],
  "requestedScopes": ["openid", "profile", "email", "groups"]
}
```

Response:

```json
{
  "id": "connection-uuid",
  "organizationId": "logto-org-id",
  "status": "draft",
  "protocol": "oidc",
  "redirectUri": "https://auth.didaxus.com/callback/enterprise-sso/...",
  "secretConfigured": true,
  "version": 1
}
```

## 11.5 Dry-run request

```json
{
  "subjects": [
    {"externalSubject": "00u-user-1"},
    {"externalSubject": "00u-user-2"}
  ],
  "mappingVersion": 9,
  "policyVersion": 27
}
```

Response:

```json
{
  "safeToApply": false,
  "results": [
    {
      "externalSubject": "hash:2d7...",
      "desiredRoles": ["organization_teacher"],
      "desiredScopes": ["academic.subject:mathematics"],
      "blocked": [],
      "warnings": []
    },
    {
      "externalSubject": "hash:8aa...",
      "desiredRoles": [],
      "blocked": ["external_groups_incomplete"],
      "warnings": ["provider_group_overage"]
    }
  ]
}
```

## 11.6 Logto adapter operations

El backend adapter puede usar Management API para:

- crear/listar/actualizar SSO connectors;
- asociar connector a JIT de la organización;
- listar JIT SSO connectors;
- crear/vincular users según capacidad aprobada;
- agregar/remover members;
- asignar/remover organization roles;
- consultar roles y memberships durante jobs de reconciliación.

El frontend nunca recibe M2M credentials.

## 11.7 Reason codes

```text
identity_connection_not_found
identity_connection_not_active
identity_connection_wrong_organization
identity_metadata_invalid
identity_issuer_mismatch
identity_signature_invalid
identity_audience_invalid
identity_subject_missing
identity_subject_unstable
identity_required_claim_missing
identity_claim_type_invalid
identity_groups_incomplete
identity_group_overage
identity_external_group_unknown
identity_mapping_missing
identity_mapping_conflict
identity_mapping_target_forbidden
identity_privileged_role_requires_approval
identity_owner_ceiling_denied
identity_tenant_activation_denied
identity_scope_template_unavailable
identity_cross_tenant_reference
identity_reconciliation_stale_version
identity_provider_unavailable
identity_logto_unavailable
identity_secret_expiring
identity_certificate_expiring
identity_manual_assignment_preserved
identity_assignment_source_remaining
```

# 12. Flujos runtime

## 12.1 Primer login JIT

```text
1. Usuario introduce correo o selecciona SSO.
2. Logto enruta al Enterprise SSO Connector.
3. IdP autentica al usuario.
4. Logto valida response/assertion y crea o vincula identity.
5. JIT agrega membership a la organización según configuración.
6. Civitas recibe post-login context o ejecuta reconciliation al primer request.
7. Claim normalizer obtiene grupos/atributos completos.
8. Mapping engine calcula desired roles/scopes.
9. PBAC/delegation valida targets.
10. Backend M2M materializa role assignments en Logto.
11. Civitas persiste Data Scope assignments y provenance.
12. Policy version/outbox/cache se actualizan.
13. Se emite un token organizacional actualizado; si el rol cambió después de la emisión inicial,
    el cliente debe renovar el organization token antes de acceder.
14. Usuario llega al portal Civitas/Moodle con acceso efectivo.
```

## 12.2 Token freshness

Una asignación de rol en Logto puede requerir renovar el token para que aparezcan scopes nuevos. Por tanto:

- Después del provisioning inicial, el frontend MUST solicitar/refrescar el organization token.
- Si los scopes siguen stale, mostrar estado `access_updating` y reintentar con límite.
- Revocaciones Civitas PBAC/ABAC deben tener efecto sin esperar un token nuevo.
- Revocaciones de scopes Logto requieren invalidar sesión/token conforme al mecanismo disponible.

## 12.3 Login recurrente

```text
1. Validar identidad y token.
2. Si login-time reconciliation está habilitado, obtener external groups.
3. Comparar desired vs managed actual.
4. Aplicar solo cambios seguros.
5. Si claims están incompletos, no ejecutar removals destructivos.
6. Registrar run y reason codes.
7. Continuar con autorización normal.
```

La reconciliación no debe añadir latencia excesiva al request principal. Puede realizarse de forma síncrona solo para el mínimo requerido y continuar en worker para cambios no críticos.

## 12.4 Usuario retirado del grupo Teachers

```text
Directory: Teachers membership removed
  -> scheduled or login reconciliation
  -> mapping source no longer present
  -> remove federated source for organization_teacher
  -> if no other source remains, remove role in Logto
  -> invalidate authorization context
  -> audit before/after
```

## 12.5 Usuario deshabilitado

Opciones por policy:

- Suspender membership organizacional.
- Retirar roles managed.
- Cerrar sesiones mediante Logto si está soportado.
- Conservar audit/provenance.
- No borrar automáticamente el usuario global si participa en otra organización.

## 12.6 Account linking

Reglas:

1. Match exacto por connection + external subject.
2. Si no existe, MAY buscar email verificado para linking controlado.
3. Si hay múltiples candidatos, bloquear y solicitar revisión.
4. No vincular por display name.
5. Registrar actor y evidence.
6. Nunca fusionar usuarios entre organizaciones por heurística silenciosa.

## 12.7 Provider outage

- Autenticación puede fallar en Logto según el IdP.
- Reconciliación pasa a failed/degraded.
- No ejecutar removals por ausencia de datos.
- Mantener el último estado conocido durante grace period si la política lo permite.
- El evaluator de acceso sigue usando Logto/PBAC/ABAC actuales.
- Alertar si el outage supera SLO.

# 13. Reconciliación y ciclo de vida

## 13.1 Desired state vs actual state

```text
Desired state
  = normalized external identity
  + active mappings
  + provisioning policy
  + Owner constraints

Actual state
  = Logto membership/roles
  + Civitas Data Scope assignments
  + source provenance
```

Reconciliation calcula un plan, lo valida y luego aplica.

## 13.2 Modos

### Additive

Solo agrega asignaciones. No elimina. Adecuado para piloto, pero puede acumular acceso obsoleto.

### Managed

Agrega y elimina únicamente asignaciones cuya source sea esta conexión/mapping.

### Authoritative

El directorio define todo el subconjunto administrado. Requiere aprobación Owner y fuerte protección contra claims incompletos.

Default recomendado: `managed`.

## 13.3 Algoritmo

```text
load connection and versions
validate lifecycle == active
fetch external subject(s)
normalize claims
assert completeness for destructive operations
resolve role and scope mappings
apply Owner ceilings/delegation/template constraints
load actual assignments and provenance
compute add/remove/preserve/block plan
persist run + items
apply in deterministic order
increment policy version
write outbox and audit
publish invalidation
verify post-state
complete run
```

## 13.4 Orden de operaciones

Agregar:

1. Link/create identity.
2. Add organization membership.
3. Add role assignments in Logto.
4. Add Civitas scope assignments.
5. Refresh token when necessary.

Retirar:

1. Disable dependent scope assignments.
2. Remove role source.
3. Remove Logto role only if no source remains.
4. Remove membership only if policy and no non-federated source require it.
5. Invalidate contexts.

## 13.5 Idempotencia

La misma entrada, mappingVersion y policyVersion debe producir cero cambios en la segunda ejecución.

Idempotency key sugerida:

```text
organizationId:connectionId:externalSubject:sourceVersion:mappingVersion
```

## 13.6 Concurrencia

- Advisory lock por organization + connection durante apply masivo.
- Lock por subject durante JIT.
- Optimistic version en mappings/policy.
- Outbox en la misma transacción local.
- Compensación explícita cuando la mutación Logto ocurre y la persistencia local falla.

## 13.7 Drift

Tipos:

```text
missing_in_logto
unexpected_logto_role
missing_scope_assignment
orphaned_federated_source
external_group_deleted
mapping_target_archived
claim_contract_changed
manual_override_detected
```

Cada drift tiene severidad, suggested action y ownership.

# 14. Seguridad y threat model

## 14.1 Trust boundaries

- Browser no es trusted.
- Tenant admin es un actor autenticado, pero no tiene autoridad Owner.
- IdP externo es trusted solo para la conexión y atributos configurados.
- Group claim no es trusted fuera de issuer/connection.
- Logto Management API credentials son altamente privilegiadas.
- Provider directory credentials son altamente privilegiadas y separadas.

## 14.2 Amenazas y controles

| Amenaza | Control obligatorio |
|---|---|
| Tenant mapea grupo a `owner_global` | Rechazo de catálogo, API y DB/service invariant. |
| Claim `admin` concede admin automático | Mapping allowlist + privileged approval. |
| Cross-tenant connector ID | Composite ownership check en cada operación. |
| OIDC issuer mix-up | Issuer exacto y callback state binding. |
| Token replay | nonce/state, expiración, session binding y revocación disponible. |
| SAML signature wrapping | Librería robusta, selección segura de assertion firmada y schema validation. |
| Audience confusion | Validar OIDC aud/azp y SAML AudienceRestriction. |
| SSRF por discovery/metadata URL | HTTPS, DNS/IP egress policy, bloquear loopback/private metadata endpoints, timeout y size limit. |
| XML bomb / oversized metadata | Parser seguro, entity expansion disabled, size/depth limits. |
| Secret exposure | Write-only, secret manager/Logto, redaction total. |
| Group overage interpretado como cero | Completeness flag y no destructive removals. |
| Email collision | issuer+subject primary; review para ambiguous email. |
| Stale mapping | optimistic version y fail closed. |
| Privilege-fragment union | complete-path OR. |
| Frontend bypass | backend enforcement para todas las mutations. |
| Mass deprovision por provider outage | grace period y destructive gate on complete data. |
| Mapping to archived taxonomy | Resolver y FK/constraint tenant-safe. |
| Audit leak | redaction/classification y tenant-scoped queries. |

## 14.3 OIDC requirements

- Authorization Code + PKCE para clientes públicos.
- TLS obligatorio.
- Exact redirect URI.
- Algoritmos asimétricos permitidos por policy.
- JWKS cache con rotation y kid handling.
- `iss`, `aud`, `exp`, `iat`, `nonce`, `azp` cuando aplique.
- No aceptar `none` algorithm.
- No seguir discovery redirects arbitrarios.

## 14.4 SAML requirements

- Validar firma con certificado esperado.
- Validar Destination, Recipient, Audience y time window.
- Validar `InResponseTo` cuando el flujo lo soporte.
- No confiar en XML unsigned sibling nodes.
- Deshabilitar DTD/external entities.
- Permitir overlap de certificados durante rotation.
- Alertar antes de expiración.

## 14.5 Secrets

Clasificación:

```text
OIDC client secret                secret
SAML private key                  secret
provider API token                secret
SCIM bearer token                 secret
federated access/refresh token    secret
raw SAML assertion                sensitive ephemeral
external group ID                 internal
mapping configuration             confidential tenant config
```

Ningún secret aparece en logs, audit, frontend state, analytics o error responses.

## 14.6 MFA y assurance

No asumir que “SSO” equivale a MFA. Opciones:

- El colegio aplica MFA upstream.
- Logto exige MFA para members de la organización.
- Civitas usa `acr/amr` solo si el chain de claims está validado y existe policy aprobada.

La política final debe evitar double-MFA innecesario sin reducir assurance.

## 14.7 Break-glass

Debe existir un acceso de emergencia Didaxus separado del IdP del cliente:

- owner-only;
- MFA fuerte;
- tiempo limitado;
- razón obligatoria;
- audit y alerta;
- no se entrega al tenant como rol normal.

# 15. Auditoría y observabilidad

## 15.1 Audit log de Governance

Filtros requeridos:

```text
actor
member
connection
canonical role
external group
permission/action
unit/taxonomy target
result
reason code
source: wizard/SSO/manual/API/SCIM/reconciliation
mapping version
policy version
date range
correlation ID
```

## 15.2 Métricas

```text
identity_federation_login_total{organization,connection,result}
identity_federation_provisioning_total{action,result}
identity_federation_reconciliation_runs_total{mode,result}
identity_federation_reconciliation_duration_seconds
identity_federation_drift_items{type,severity}
identity_federation_provider_errors_total{provider,reason}
identity_federation_claim_incomplete_total{reason}
identity_federation_privileged_mapping_blocks_total
identity_federation_certificate_days_remaining
identity_federation_secret_age_days
```

No usar email/user ID como label de alta cardinalidad.

## 15.3 Tracing

Spans sugeridos:

```text
identity.test_login
identity.claim_normalize
identity.mapping.resolve
identity.provision.plan
identity.logto.membership.apply
identity.logto.roles.apply
identity.scope.apply
identity.reconciliation.run
identity.audit.write
identity.outbox.publish
```

## 15.4 SLO inicial

- 99.9% de disponibilidad de reads de Governance.
- P95 del dry-run individual menor a 3 s sin provider API lento.
- 99% de reconciliation runs completados dentro de la ventana programada.
- Certificados alertados 30/14/7/1 días antes.
- Cero cross-tenant mutation aceptada.

# 16. Pruebas y aceptación

## 16.1 Unit tests

- Normalización OIDC/SAML.
- Identificador issuer+subject.
- Mapping por ID externo.
- Conflictos y privileged roles.
- Provenance/ref counting.
- Completeness/overage.
- PBAC/ABAC gates.
- Reason codes.

## 16.2 Contract tests

- Logto Management API adapter.
- JIT connector association endpoints.
- Organization role assignment.
- Provider Graph/Admin SDK adapters.
- SCIM schemas cuando se implemente.
- Runtime schemas frontend/backend.

## 16.3 Integration fixtures

1. Student only.
2. Teacher + mathematics + 7B.
3. Director organization-wide dentro de ceiling.
4. Same role con ceiling denegado.
5. Parent con related student.
6. User in Student + Teacher conflict.
7. Privileged admin mapping requires approval.
8. Group removed while manual role source remains.
9. Group overage.
10. Archived taxonomy target.
11. Cross-tenant group/mapping ID.
12. Provider outage during removal.
13. SAML certificate rotation.
14. OIDC JWKS rotation.
15. Stale mapping version.

## 16.4 End-to-end

```text
configure connector
-> validate
-> test login
-> inspect claims
-> create mappings
-> dry-run
-> activate
-> user signs in
-> membership and role materialize
-> token refresh
-> Moodle route allowed
-> group removed
-> reconciliation
-> access revoked
-> audit visible
```

## 16.5 Security tests

- SSRF payloads en discovery/metadata.
- XML entity expansion.
- SAML wrapping fixtures.
- Invalid audience/recipient.
- OIDC nonce/state mismatch.
- Secret redaction.
- Direct API forged org ID.
- Tenant attempt to map `owner_global`.
- Group overage destructive-plan prevention.
- Rate limiting de test login y reconciliation.

## 16.6 Accessibility

- Wizard keyboard complete.
- Stepper con labels y estado anunciado.
- Claim inspector no depende solo de color.
- Mapping tables con headers y descriptions.
- Confirmation dialogs con foco correcto.
- Mobile cambia composición, no autorización.

## 16.7 Definition of Done

- Connection lifecycle persistente.
- Wizard real con test login.
- Mappings versionados.
- JIT association en Logto.
- Primer login end-to-end.
- Reconciliation managed.
- PBAC/ABAC enforcement.
- Audit/outbox/invalidation.
- No secrets expuestos.
- Cross-tenant tests.
- Provider outage/overage tests.
- Docs y runbooks.
- Operación marcada active únicamente con evidencia real.

# 17. Plan de implementación

## 17.1 Fase 0 - Discovery spike obligatorio

Objetivos:

- Confirmar versión exacta de Logto OSS.
- Inventariar Management API disponible.
- Verificar create/update SSO connector.
- Verificar asociación JIT connector -> organization.
- Determinar dónde se exponen claims upstream y external identity profile.
- Probar OIDC y SAML con fixtures.
- Verificar si custom token scripts reciben datos suficientes; no usarlos como autoridad sin evidencia.
- Documentar fallback provider API/SCIM.

Exit gate: una matriz de capacidades verificadas, con requests/responses sanitizados.

## 17.2 Fase 1 - Contracts and persistence

- Schemas runtime.
- Migraciones.
- Repositories PostgreSQL.
- Connection lifecycle.
- Audit/outbox integration.
- Candidate permissions en estado planned.

## 17.3 Fase 2 - Logto adapter and owner setup

- M2M mediation.
- Connector plan/apply/check.
- JIT binding.
- Secret handling.
- Validation endpoints.
- Owner support surface.

## 17.4 Fase 3 - Tenant wizard and role mapping

- Route-backed UI.
- Test login.
- Claim inspector.
- Role mapping with ceilings/delegation.
- Dry-run.
- First login provisioning.

## 17.5 Fase 4 - ABAC/Data Scope mapping

- Template selectors.
- External group -> taxonomy/unit/resource mappings.
- Provenance.
- Impact preview.
- Lifecycle of archived targets.

## 17.6 Fase 5 - Reconciliation

- Login-time.
- Scheduled workers.
- Managed removals.
- Drift UI.
- Provider adapters.
- Retry/backoff/dead letter.

## 17.7 Fase 6 - SCIM enterprise lifecycle

- Tenant-bound SCIM endpoints.
- Users/Groups.
- Entra provisioning certification path.
- Deprovisioning SLAs.
- On-demand test.

## 17.8 Child issues propuestos

```text
#154-A Logto enterprise SSO and upstream claims capability spike
#154-B Identity federation schemas, migrations and lifecycle
#154-C Logto Management API adapter for SSO/JIT/roles
#154-D Organization Identity & Provisioning wizard
#154-E External group to canonical role mapping engine
#154-F External attributes to Data Scope mapping engine
#154-G Login-time and scheduled reconciliation
#154-H SCIM 2.0 service provider endpoint
#154-I Audit, diagnostics, metrics and runbooks
#154-J Security red-team and end-to-end certification
```

## 17.9 Dependency gates

```text
#127 authorization model
  -> Phase 0 verified Logto capabilities
  -> contracts/persistence
  -> Logto adapter
  -> wizard role mapping
  -> Data Scope mapping
  -> reconciliation
  -> SCIM
```

Closed issues are treated as source contracts; no reopening is required unless their implementation must change.

# 18. Operación y soporte

## 18.1 Onboarding checklist

```text
[ ] Organization exists in Logto
[ ] Bootstrap admin active
[ ] Enterprise SSO plan supported
[ ] Domains verified
[ ] Metadata/issuer validated
[ ] Test login successful
[ ] Stable subject confirmed
[ ] Group completeness confirmed
[ ] Role mappings reviewed
[ ] Privileged mappings approved
[ ] Data Scope mappings reviewed
[ ] Dry-run clean
[ ] Break-glass tested
[ ] Audit/alerts active
[ ] Activation approved
```

## 18.2 Rotación OIDC secret

1. Registrar nuevo secret sin borrar el anterior si el provider permite overlap.
2. Validar conexión.
3. Activar nuevo secret.
4. Ejecutar test login.
5. Retirar anterior.
6. Auditar fingerprint, nunca valor.

## 18.3 Rotación SAML certificate

- Soportar certificado actual + siguiente.
- Alertar expiración.
- Validar metadata refresh.
- No retirar certificado anterior antes del cutover confirmado.

## 18.4 Claims cambiados

- Detectar required claim missing/type change.
- Marcar degraded.
- Bloquear removals.
- Ejecutar test login.
- Crear nueva claimContractVersion.
- Dry-run de impacto.
- Publicar.

## 18.5 Suspender conexión

Suspender SSO no debe borrar mappings ni auditoría. La política define si:

- se impiden nuevos logins;
- se conservan sesiones actuales;
- se retiran assignments managed;
- se activa una ventana de recuperación.

## 18.6 Decommission

- Impact preview.
- Export de configuración sin secrets.
- Retiro de JIT binding.
- Retiro del connector en Logto cuando sea seguro.
- Política para identities existentes.
- Archivo de mappings y audit retention.

# 19. Riesgos y decisiones abiertas

## 19.1 Disponibilidad de claims upstream en Logto

**Estado:** P0 blocker.

Debe verificarse en la versión desplegada:

- forma de la SSO identity;
- raw profile disponible;
- persistencia de custom attributes;
- acceso desde Management API;
- disponibilidad en custom token script;
- federated token storage y sus riesgos.

No se implementará el mapping engine sobre un campo no contractual.

## 19.2 ¿Civitas será SCIM service provider?

Recomendación: sí, como fase enterprise, porque permite altas/bajas sin login y reduce adapters propietarios. Requiere decidir si Civitas crea usuarios Logto inmediatamente o mantiene staging hasta el primer login.

## 19.3 Roles privilegiados automáticos

Recomendación: `organization_admin` y roles financieros requieren approval por defecto. El Owner puede publicar perfiles que relajen la regla para clientes maduros con grupos protegidos y evidencia.

## 19.4 Default membership

Recomendación para connector mixto:

```text
membership JIT allowed
functional role fallback = pending review or organization_member
```

No usar student como universal default.

## 19.5 MFA trust

Decidir si Didaxus confía en upstream MFA para una organización y cómo se representa assurance. Hasta entonces, MFA de Logto y upstream son controles independientes.

## 19.6 Multiple connectors per organization

Debe permitirse más de uno para casos como estudiantes en Google y personal en Entra. Se necesita routing por dominio y prioridad, y prohibir que dos conexiones reclamen el mismo external subject namespace sin policy.

## 19.7 Moodle provisioning

Civitas debe mantener mapping `logto_user_id <-> moodle_user_id` operacional. Moodle no debe crear una segunda contraseña ni decidir los roles globales. Enrollment/courses se gestionan por adapter LMS después de la autorización y las relaciones académicas.

# 20. Referencias

## 20.1 GitHub - Civitas

- `#154` Organization Identity Federation: https://github.com/lssmanager/civitas10/issues/154
- `#129` Organization Governance Workspace: https://github.com/lssmanager/civitas10/issues/129
- `#127` Canonical RBAC + PBAC + ABAC operating model: https://github.com/lssmanager/civitas10/issues/127
- `#74` Canonical authorization catalog: https://github.com/lssmanager/civitas10/issues/74
- `#87` Logto bootstrap: https://github.com/lssmanager/civitas10/issues/87
- `#88` Token contract: https://github.com/lssmanager/civitas10/issues/88
- `#79` Tenant admin UI: https://github.com/lssmanager/civitas10/issues/79
- `#82` Navigation manifest: https://github.com/lssmanager/civitas10/issues/82
- `#94` Entitlement overlay: https://github.com/lssmanager/civitas10/issues/94
- `#95` Authorization Data Scope Engine: https://github.com/lssmanager/civitas10/issues/95
- `#123` Roles/ceilings/member assignments: https://github.com/lssmanager/civitas10/issues/123
- `#124` Taxonomy/units/data scopes: https://github.com/lssmanager/civitas10/issues/124
- `#125` Aliases/preview/audit: https://github.com/lssmanager/civitas10/issues/125
- `#138` Governance Audit UX: https://github.com/lssmanager/civitas10/issues/138
- `#153` Module manifest registry: https://github.com/lssmanager/civitas10/issues/153

## 20.2 Logto

- Enterprise connectors: https://docs.logto.io/connectors/enterprise-connectors
- Enterprise SSO: https://docs.logto.io/end-user-flows/enterprise-sso
- Organizations: https://docs.logto.io/organizations
- JIT provisioning: https://docs.logto.io/organizations/just-in-time-provisioning
- Authorization: https://docs.logto.io/authorization
- RBAC: https://docs.logto.io/authorization/role-based-access-control
- Custom access token claims: https://docs.logto.io/developers/custom-token-claims
- Management API: https://docs.logto.io/integrate-logto/interact-with-management-api
- Add organization JIT SSO connectors: https://openapi.logto.io/operation/operation-createorganizationjitssoconnector
- List organization JIT SSO connectors: https://openapi.logto.io/operation/operation-listorganizationjitssoconnectors
- SSO connectors API group: https://openapi.logto.io/group/endpoint-sso-connectors

## 20.3 Standards

- OpenID Connect Core 1.0: https://openid.net/specs/openid-connect-core-1_0.html
- OAuth 2.0: https://www.rfc-editor.org/rfc/rfc6749.html
- OAuth Resource Indicators RFC 8707: https://www.rfc-editor.org/rfc/rfc8707.html
- SAML 2.0 Core: https://docs.oasis-open.org/security/saml/v2.0/saml-core-2.0-os.pdf
- SCIM Core Schema RFC 7643: https://www.rfc-editor.org/rfc/rfc7643.html
- SCIM Protocol RFC 7644: https://www.rfc-editor.org/rfc/rfc7644.html

## 20.4 Provider lifecycle references

- Microsoft Entra SCIM support: https://learn.microsoft.com/en-us/entra/identity/app-provisioning/scim-support-in-entra-id
- Microsoft Entra provisioning behavior: https://learn.microsoft.com/en-us/entra/identity/app-provisioning/how-provisioning-works
- Microsoft Entra group claims/overage: https://learn.microsoft.com/en-us/security/zero-trust/develop/configure-tokens-group-claims-app-roles
- Google Workspace Admin SDK Directory API: https://developers.google.com/workspace/admin/directory/reference/rest

<!-- PAGEBREAK -->

# Appendix A - Normative decision summary

```text
A1. Logto remains canonical for identities, organizations, memberships, roles and tokens.
A2. Civitas stores mappings, policy, provenance, reconciliation and audit; no parallel identity canon.
A3. LDAP is integrated through an OIDC/SAML IdP, not directly from the browser or Moodle.
A4. External groups are mapped by immutable ID within one organization and connection.
A5. External claims never bypass RBAC/PBAC/ABAC.
A6. owner_global is never mappable by a tenant.
A7. Student is not the default for mixed connectors.
A8. Group membership is not a permission.
A9. Academic segmentation becomes Data Scope, not combinatorial roles.
A10. JIT handles first access; reconciliation/SCIM handles lifecycle enforcement.
A11. Incomplete group data blocks destructive removals.
A12. A source revokes only assignments it owns unless authoritative mode is approved.
A13. Secrets never return to the frontend or audit log.
A14. The wizard is route-backed, versioned and audited.
A15. The feature remains planned until real backend consumers and end-to-end tests exist.
```

# Appendix B - Example organization setup

## Colegio X

```text
Organization: Colegio X
Logto organization ID: org_colegio_x
Protocol: OIDC
Issuer: https://login.microsoftonline.com/<tenant>/v2.0
Domains: colegiox.edu.co
Group mode: groups assigned to application
Role sync mode: managed
Scope sync mode: managed
Privileged role mode: approval_required
```

Mappings:

```text
grp-students     -> organization_student
grp-teachers     -> organization_teacher
grp-directors    -> organization_director (approval)
grp-it-admins    -> organization_admin (approval)

grp-math         -> academic.subject:mathematics
grp-section-7b   -> unit:section-7b
grp-campus-north -> unit:campus-north
```

Expected professor result:

```text
Identity: issuer + sub
Organization membership: Colegio X
Canonical role: organization_teacher
Owner ceiling: allowed subset
Tenant activation: enabled subset
Data Scope: Mathematics, Section 7B, Campus North
LMS access: course/runtime adapter only within effective scope
```

# Appendix C - Implementation review checklist

```text
Architecture
[ ] No duplicate identity/RBAC canon
[ ] Logto and Civitas responsibilities preserved
[ ] Capability-first adapters

Security
[ ] Cross-tenant denied
[ ] owner_global impossible from mapping
[ ] OIDC/SAML validation complete
[ ] SSRF/XML protections
[ ] Secret redaction
[ ] Incomplete claims block destructive changes

Authorization
[ ] Complete-path OR
[ ] PBAC ceilings enforced
[ ] Tenant activation enforced
[ ] ABAC uses stable IDs
[ ] Manual/federated provenance preserved

Runtime
[ ] Idempotent plan/apply
[ ] Outbox and invalidation
[ ] Retry/backoff
[ ] Drift and reconciliation
[ ] Token refresh after role changes

UX
[ ] Test login and claim inspector
[ ] Dry-run and impact preview
[ ] Accessible mapping table
[ ] Explicit degraded/denied/error states

Evidence
[ ] Audit before/after
[ ] Metrics and traces
[ ] E2E provider fixture
[ ] Runbooks and rollback
```
