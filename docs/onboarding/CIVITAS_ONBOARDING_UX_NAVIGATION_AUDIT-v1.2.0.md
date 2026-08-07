# Auditoría UX de navegación

## Onboarding de organizaciones Civitas v1.2.0

## Veredicto por eje

```text
1. Orientación:                    8.5/10
2. Ruta de regreso:                7.5/10
3. Predictibilidad entre shells:   6.5/10
4. Profundidad/costo cognitivo:    6.5/10
5. Estados sin permiso:            8.0/10
6. Responsive:                     7.5/10
7. Nomenclatura:                   7.0/10
```

La arquitectura documental está preparada para iniciar foundation, pero todavía no debería convertirse directamente en componentes y rutas sin resolver los hallazgos P0 de esta auditoría.

---

# ✅ Patrones de navegación sólidos

## 1. La orientación principal ya está correctamente contratada

El encabezado debe mostrar al mismo tiempo:

* nombre humano de la organización;
* modo Owner, consultor u Organization Admin;
* estado operativo;
* paso y sección;
* modo edición, solo lectura o aprobación;
* estado de guardado.

Esto responde adecuadamente:

```text
¿En qué organización estoy?
¿Con qué autoridad estoy actuando?
¿En qué etapa estoy?
¿Puedo editar o solo revisar?
¿Mis cambios se guardaron?
```

El ejemplo:

```text
Organizations › Colegio Ejemplo › Onboarding › Inicio de sesión y acceso
Colegio Ejemplo
Organization Admin mode · Configuration · Editing
Step 3 of 8 · Saved 2 min ago
```

es un patrón de orientación fuerte.

También es correcto que el nombre de la organización sea la identidad principal y que los IDs técnicos permanezcan en detalles de soporte.

## 2. Owner y Organization Admin tienen superficies distintas

La separación de rutas es coherente:

```text
Owner:
 /owner/organization-onboardings/:onboardingId/:visibleStepKey

Organization Admin:
 https://{tenantSlug}.portal.didaxus.com/onboarding/:visibleStepKey
```

La ruta del portal no contiene `organizationId`; el contexto proviene del hostname y de `TenantContext`.

Esto reduce el riesgo de que un administrador cambie accidentalmente de organización manipulando la URL o un selector.

## 3. Existe una única fuente de navegación

`OnboardingRouteRegistry` gobierna:

* router;
* stepper;
* menú;
* breadcrumbs;
* deep links;
* shortcuts;
* guards;
* pruebas.

Esta es una buena decisión porque evita que:

* el sidebar diga una cosa;
* el router permita otra;
* el breadcrumb muestre una tercera;
* los tests mantengan una lista diferente.

## 4. Los breadcrumbs dejan de depender del historial

El contrato exige:

* parent routes explícitas;
* niveles clicables;
* `aria-current="page"`;
* no depender de `navigate(-1)` como única forma de regreso.

Esto resuelve el caso de una persona que entra mediante:

* un enlace copiado;
* una invitación;
* una notificación;
* un handoff;
* una pestaña nueva.

En esos casos, “volver atrás” en el navegador no necesariamente lleva a una pantalla válida de Civitas.

## 5. El wizard actual se integra sin romper el flujo funcional

La pantalla actual de cuatro etapas se conserva dentro de los pasos 1 y 2:

```text
organization  → Organización y portal
segmentation  → Organización y portal
admins        → Administradores iniciales
review        → Confirmación del bootstrap
```

Después del bootstrap, el usuario continúa al paso `access_methods`; no se presenta la creación de Logto como finalización del onboarding.

Esta continuidad es correcta:

```text
Crear organización y administradores
→ receipt de bootstrap
→ continuar con acceso
→ provisioning
→ estructura
→ permisos
→ revisión
→ aprobación
```

El backend también conserva explícitamente `runCanonicalOrganizationProvisioning()` dentro de un planner/runner, en lugar de descartarlo.

## 6. Las acciones de salida y reanudación están contempladas

La action bar incluye:

```text
Save draft
Save and exit
Continue
Open summary
Copy link
Handoff
```

`Continue` debe esperar confirmación durable; un ETag conflictivo muestra diff y el handoff preserva onboarding, paso, sección y finding.

Esto es adecuado para un proceso que puede durar días o semanas y en el que participan el equipo Didaxus y el responsable TI del cliente.

## 7. El modelo de permisos visible está bien planteado

El contrato distingue:

```text
hidden
disabled
forbidden
planned
```

y prohíbe utilizar `ScreenGate` como el primer momento en que el usuario descubre que no tiene acceso.

La regla es sólida:

* **hidden:** no debe conocer la función o no tiene capacidad base;
* **disabled:** conoce la función, pero falta un requisito;
* **forbidden:** llegó por deep link sin autorización;
* **planned:** no aparece como enlace funcional.

## 8. Los labels principales están traducidos a lenguaje de tarea

El usuario no debería ver directamente:

```text
identity_structure_mapping
authorization_simulation
dry_run_review
```

Debería ver:

```text
Personas y estructura académica
Accesos y permisos
Revisión antes de activar
```

El patrón general es comprensible para un administrador institucional.

## 9. Existe un diseño responsive real, no solo reducción de tamaño

El contrato establece:

### Tablet

* stepper compacto;
* readiness drawer;
* breadcrumb resumido;
* action bar que no cubre el foco.

### Móvil

* selector de etapa;
* secciones como accordions;
* mappings como cards;
* CTA al blocker dominante;
* foco al encabezado al cambiar de paso.

También exige pruebas con teclado, zoom al 200 % y lector de pantalla.

## 10. El final del onboarding conecta con superficies permanentes

Teacher, Student y Parent no participan en onboarding. El receipt entrega la organización a:

* Governance;
* Modules;
* Operations;
* Audit;
* workspaces operativos posteriores.

Esta frontera evita convertir onboarding en una segunda interfaz permanente de administración.

---

# ⚠️ Fricciones de navegación

## P0-1. El breadcrumb de ejemplo no sirve para ambos actores

### Flujo afectado

```text
Organization Admin
→ portal de su organización
→ onboarding
```

El ejemplo contractual comienza con:

```text
Organizations › Colegio Ejemplo › Onboarding › Inicio de sesión y acceso
```

Para un Owner en Core Manager, `Organizations` tiene sentido.

Para un Organization Admin dentro de:

```text
colegio.portal.didaxus.com
```

`Organizations` es incorrecto: ese usuario no debe tener acceso al directorio global de organizaciones.

### Riesgo real

Un implementador puede reutilizar el breadcrumb Owner en el portal tenant y crear:

* un enlace inaccesible;
* un enlace que abre Core Manager;
* un 403;
* o una ruta sin contexto.

### Contrato requerido

Debe congelarse un breadcrumb por superficie.

#### Owner

```text
Organizations
→ Colegio Ejemplo
→ Onboarding
→ Inicio de sesión y acceso
```

#### Organization Admin

```text
Inicio
→ Configuración de la organización
→ Onboarding
→ Inicio de sesión y acceso
```

Los dos deben usar la misma gramática, pero no necesariamente el mismo root.

---

## P0-2. `parentRoute` existe, pero no se han definido sus valores

El tipo contiene:

```ts
parentRoute: string;
```

pero el documento no presenta una tabla completa como:

```text
organization_portal
Owner parent: /owner/organization-onboardings
Admin parent: /

access_methods
Owner parent: /owner/organization-onboardings/{id}
Admin parent: /onboarding

activation_plan_diff
Owner parent: /owner/organization-onboardings/{id}/dry_run_review
Admin parent: /onboarding/dry_run_review
```

### Hallazgo real

El contrato dice que siempre existe ruta de regreso, pero todavía no especifica a dónde regresa cada pantalla.

Dos desarrolladores pueden implementar destinos diferentes y ambos creer que cumplen el documento.

---

## P0-3. El registry promete deep links a secciones y findings, pero solo modela pasos

El documento afirma que el registry gobierna:

* deep links;
* shortcuts;
* sections;
* findings;
* handoffs.

Pero el tipo solo incluye:

```ts
visibleStepKey
label
route
parentRoute
requiredCapabilities
availability
applicability
actorVisibility
```

No contiene:

```ts
sectionKey
sectionRoute
findingId
findingRoute
defaultSection
resumeRoute
exitRoute
breadcrumbSegments
```

### Flujo afectado

```text
Paso 5
→ Personas y estructura académica
→ Teaching assignments
→ conflicto del profesor X
```

El usuario comparte el enlace o entrega el caso mediante handoff.

El contrato dice que el handoff preserva step, section y finding, pero no congela cómo esos valores se representan en la URL o en el registry.

### Hallazgo real

El usuario podría regresar al paso 5, pero no al conflicto exacto que estaba resolviendo.

Para pasos grandes, regresar solo al nivel del step sigue siendo perder contexto.

---

## P0-4. No está definido cómo navega el usuario dentro de los pasos grandes

Los pasos 5, 6 y 7 contienen varias áreas:

### Personas y estructura académica

* attribute mappings;
* group mappings;
* taxonomy;
* periods;
* teaching assignments.

### Accesos y permisos

* roles candidatos;
* ceilings;
* activations;
* PBAC;
* Data Scope;
* Access Preview.

### Revisión

* reconciliation;
* blockers;
* entitlements;
* usage;
* readiness;
* activation plan.

El shell central se denomina `OnboardingStepWorkspace`, pero no se define si estas subsecciones usan:

* tabs;
* riel vertical;
* submenú;
* accordion;
* índice de tareas;
* rutas secundarias.

### Hallazgo real

Un usuario nuevo entraría a “Personas y estructura académica” y no sabría dónde comenzar ni cómo pasar de mappings a teaching assignments.

Debe existir un patrón único de navegación interna para todos los pasos complejos.

---

## P0-5. La ruta de entrada al onboarding no está completamente congelada

Las rutas de detalle existen, pero no se define con precisión la pantalla índice del Owner:

```text
/owner/organization-onboardings
```

ni cómo se relaciona con:

```text
/owner/organizations
```

Quedan abiertas dos entradas posibles:

```text
Organizations
→ seleccionar organización
→ abrir onboarding
```

o:

```text
Onboardings
→ seleccionar proceso
→ abrir organización
```

### Hallazgo real

Un Owner que vuelve al día siguiente puede no saber si debe buscar:

* la organización;
* el onboarding;
* el draft;
* o la operación pendiente.

Debe existir una única entrada principal y una secundaria claramente relacionada.

Recomendación contractual:

```text
Owner sidebar:
Organizations
  ├── Directory
  └── Onboarding

Organization detail:
Overview
Governance
Operations
Onboarding
```

El onboarding puede aparecer en ambos puntos, pero ambos deben resolver al mismo aggregate y no crear dos experiencias distintas.

---

## P0-6. `applicability` puede romper el contador “Step 3 of 8”

El registry distingue:

```text
applicable
not_applicable
```

pero la orientación siempre muestra:

```text
Step 3 of 8
```

### Caso real

Una organización que no utiliza SCIM, SAML ni estructura académica completa puede tener varios bloques no aplicables.

No está definido si:

* siguen contando como pasos;
* aparecen completados automáticamente;
* se ocultan;
* aparecen “No aplica”;
* se omiten y el contador cambia a “Paso 3 de 6”.

### Hallazgo real

Una persona puede ver “faltan cinco pasos” aunque dos no le correspondan.

Debe congelarse:

```text
Paso 3 de 6 aplicables
```

o:

```text
Paso 3 de 8 · 2 no aplican
```

---

## P0-7. No está congelado el comportamiento al hacer clic en un paso bloqueado

El registry tiene:

```text
active
conditional
blocked
complete
```

pero no define:

* si un paso bloqueado puede abrirse;
* si abre una explicación;
* si navega al prerequisite;
* si un paso futuro puede consultarse en read-only;
* si los pasos completos pueden editarse;
* si editar un paso completo invalida el activation plan.

### Hallazgo real

Dos implementaciones posibles:

1. bloquear completamente el clic;
2. permitir abrir y explicar el bloqueo.

La segunda suele ser mejor para orientación, pero el contrato debe decidirlo.

---

## P0-8. La matriz de permisos no está enlazada al registry de navegación

El contrato define correctamente qué puede hacer:

* Owner;
* consultor;
* Organization Admin.

Pero todavía falta una matriz operacional:

```text
Step
+ section
+ action
+ actor
+ onboarding state
+ organization state
+ required capability
+ visible behavior
```

### Ejemplo

Organization Admin puede configurar Identity, pero no aprobar.

Debe definirse si en `approval_publication`:

* ve el paso completo en read-only;
* ve únicamente “Solicitar revisión”;
* ve el plan, pero no los botones de aprobación;
* no ve información comercial o excepciones Owner.

### Hallazgo real

“Organization Admin no aprueba” no basta para construir el menú y la pantalla.

---

## P1-9. El CTA al blocker dominante puede llevar a una sección inaccesible

El panel Overall enlaza al blocker dominante.

Pero puede ocurrir:

```text
Organization Admin
→ blocker dominante: Owner Ceiling
→ solo Owner puede resolverlo
```

### Comportamiento requerido

El CTA no debería intentar abrir una acción forbidden.

Debería mostrar:

```text
Bloqueo: se requiere aprobación de Didaxus
Responsable: Owner
Acción disponible: solicitar revisión o notificar responsable
```

El CTA debe considerar:

* actor;
* capacidad;
* responsabilidad;
* sección resolutiva;
* posibilidad real de acción.

---

## P1-10. “Autosave”, “Save draft” y “Continue” pueden parecer redundantes

La UI plantea:

* autosave;
* Save draft;
* Save and exit;
* Continue.

No se explica claramente la diferencia para el usuario.

### Preguntas reales

* ¿Autosave guarda todo o solo campos individuales?
* ¿Save draft es necesario si ya existe autosave?
* ¿Continue valida además de guardar?
* ¿Puedo cerrar cuando aparece “Saved”?
* ¿Qué significa “Saving” durante un handoff?

Debe congelarse una semántica:

```text
Autosave
→ guarda cambios locales de la sección

Save draft
→ fuerza persistencia y confirma estado durable

Continue
→ guarda + valida prerequisites + cambia de paso

Save and exit
→ guarda + vuelve a la ruta padre
```

---

## P1-11. El destino de “Save and exit” depende del actor y no está definido

### Owner

Posibles destinos:

* lista de onboardings;
* detalle de organización;
* resumen del onboarding.

### Organization Admin

Posibles destinos:

* dashboard del portal;
* resumen del onboarding;
* configuración de organización.

### Hallazgo real

La acción está definida, pero su resultado no.

Debe ser actor-aware y predecible:

```text
Owner Save and exit
→ onboarding summary o onboarding list

Organization Admin Save and exit
→ portal configuration home
```

---

## P1-12. El paso 1 tiene demasiadas responsabilidades

“Organización y portal” incluye potencialmente:

* perfil legal;
* perfil comercial;
* país;
* zona horaria;
* idioma;
* contactos;
* tenantSlug;
* hostname;
* branding;
* domain claims;
* segmentación heredada.

### Hallazgo real

Un usuario puede interpretar el paso como una sola pantalla larga, especialmente porque el contrato no congela sus subsecciones visibles.

Debe subdividirse dentro del paso:

```text
1. Información institucional
2. Contactos
3. Portal y dirección
4. Identidad visual
5. Revisión del bloque
```

Sin crear cinco pasos principales nuevos.

---

## P1-13. El receipt final ofrece demasiadas salidas sin priorización

El receipt enlaza:

* Governance;
* Modules;
* Operations;
* Audit.

Eso es correcto como cobertura, pero no define el **siguiente paso principal**.

### Caso real

Un administrador termina el onboarding y ve cuatro destinos equivalentes. No sabe qué hacer primero.

El receipt debe distinguir:

```text
Acción principal
→ Ir al portal de la organización

Acciones administrativas
→ Governance
→ Modules
→ Operations
→ Audit
```

La acción principal debe depender del actor y del estado alcanzado.

---

## P1-14. La nomenclatura sigue mezclando español e inglés

Los labels principales están en español, pero el mismo ejemplo contiene:

```text
Organizations
Onboarding
Organization Admin mode
Configuration
Editing
Saved 2 min ago
```

y otras superficies usan:

```text
Governance
Modules
Operations
Audit
Owner
Handoff
Readiness
```

### Hallazgo real

La interfaz puede terminar con frases como:

```text
Colegio Ejemplo · Organization Admin mode · Configuration · Editing
```

Eso no es lenguaje natural para un administrador escolar hispanohablante.

Debe congelarse una política de idioma:

```text
Organizations          → Organizaciones
Onboarding             → Configuración inicial
Organization Admin     → Administrador de la organización
Configuration          → En configuración
Editing                → Puede editar
Saved 2 min ago        → Guardado hace 2 minutos
Readiness              → Preparación
Handoff                → Transferir configuración
```

Los términos OIDC, SAML, SCIM y API pueden conservarse para el responsable TI, acompañados de una descripción funcional.

---

# ❌ Rupturas de patrón o pérdida de orientación

## 1. La experiencia documental todavía no existe en el repositorio

El Repository Compliance Checker declara:

```text
Repository Compliance: NOT_IMPLEMENTED
```

y reconoce que todavía faltan:

* aggregate completo;
* ocho pasos reanudables;
* rutas de onboarding;
* portal host-local para Organization Admin;
* Tenant Resolution;
* ETag completo;
* activation plan/run;
* menú filtrado por capacidades;
* E2E multi-actor.

### Hallazgo real

Un usuario que entre hoy al repositorio no encontrará el workspace descrito en v1.2.0.

Encontrará el wizard mínimo existente. Ese wizard funciona como bootstrap, pero todavía no ofrece la orientación, retorno y continuidad del contrato completo.

El documento de reconciliación clasifica correctamente ese flujo:

```text
FUNCIONA
SE CONSERVA
SE REUTILIZA
SE INTEGRA COMO BOOTSTRAP
```

## 2. No puede afirmarse consistencia entre Admin, Teacher, Student y Parent

El contrato declara expresamente:

```text
Teacher, Student y Parent no participan en onboarding.
```

Por tanto, esta auditoría no puede validar que `/admin`, `/teacher`, `/student` y `/parent` repitan exactamente el mismo patrón.

### Veredicto literal

* Owner versus Organization Admin: patrón propuesto, pero no implementado.
* Teacher versus Student versus Parent: fuera del alcance de estos documentos.
* Consistencia global de workspaces Civitas: **no demostrada por este paquete**.

No es un defecto del onboarding excluirlos. Sí sería incorrecto afirmar que la navegación completa de la plataforma ya es consistente.

## 3. “Una gramática visual” no garantiza aún el mismo comportamiento

El documento indica que Owner y Organization Admin comparten lenguaje visual, pero:

* usan dominios distintos;
* tienen sesiones distintas;
* tienen roots distintos;
* tienen capacidades distintas;
* probablemente tendrán sidebars globales distintos.

Falta una matriz que garantice que ambos conservan en la misma posición:

* organización;
* actor;
* breadcrumb;
* step rail;
* readiness;
* guardar/salir;
* ayuda;
* estado de sesión.

Sin esa matriz, pueden terminar pareciéndose visualmente pero comportándose de forma distinta.

## 4. El schema del registry no soporta todo lo que el documento le atribuye

Este es un problema contractual concreto.

El documento afirma que el registry controla:

```text
router
stepper
menú
breadcrumbs
deep links
shortcuts
guards
tests
sections
findings
```

Pero su estructura solo modela un nodo por visible step.

Por tanto, actualmente:

```text
capacidad declarada del registry
>
capacidad expresada por su schema
```

Debe ampliarse antes de implementar.

---

# 🔲 Casos no cubiertos

## Orientación y contexto

* Onboarding sin nombre de organización todavía definido.
* Organización renombrada durante el proceso.
* Owner con varias organizaciones abiertas en pestañas diferentes.
* Usuario que entra por una invitación expirada.
* Usuario que entra a un onboarding ya completado.
* Organización suspendida mientras el onboarding está abierto.
* Cambio de `tenantSlug` durante configuración.
* Read-only causado por review, no por falta de permiso.
* Vista de soporte temporal con impersonación o acceso delegado.

## Ruta de regreso

* Parent route exacta por actor y por pantalla.
* Regreso desde Activation Plan Diff.
* Regreso desde un finding individual.
* Regreso desde Teaching Assignment.
* Regreso desde Access Preview.
* Regreso desde un test login OIDC/SAML.
* Salida desde un modal con cambios no guardados.
* Destino después de `Save and exit`.
* Destino después de completar el bootstrap.
* Destino después de publicación.
* Qué ocurre al abrir un deep link después de que cambió el estado.

## Profundidad y tareas frecuentes

* Acceso directo a “resolver blockers”.
* Acceso directo a “usuarios con conflicto”.
* Acceso directo a “teaching assignments pendientes”.
* Acceso directo a “mappings sin resolver”.
* Acceso directo a “plan stale”.
* Lista de tareas asignadas al actor actual.
* “Continuar donde quedé”.
* “Último cambio solicitado”.
* “Siguiente acción requerida”.
* Ruta de resumen sin entrar en el stepper completo.

## Permisos

* Matriz step/section/action por actor.
* Permiso revocado con formulario parcialmente diligenciado.
* Organization Admin con permiso de lectura pero no edición.
* Consultor autorizado para un conjunto limitado de secciones.
* Sección parcialmente visible por PII.
* Blocker que solo puede resolver Owner.
* Deep link a sección no aplicable.
* Planned visible solo para Owner, pero oculto al tenant.
* Solicitud de acceso o escalamiento desde forbidden.

## Responsive

* Prioridad entre breadcrumb, header, step selector y readiness en una pantalla de 360 px.
* Comportamiento con teclado virtual abierto.
* Action bar con cinco o seis acciones en móvil.
* Mappings con cientos de filas convertidos en cards.
* Comparación de activation plan en móvil.
* Navegación entre findings desde readiness drawer.
* Persistencia del scroll al volver de una subsección.
* Drawer abierto durante cambio de ruta.
* Indicador de guardado accesible sin ocupar demasiado espacio.

## Estados vacíos y excepcionales

* No hay conexiones de identidad porque no aplican.
* No existe SCIM y se usará administración nativa.
* No hay estructura académica.
* No hay módulos contratados.
* No existen blockers.
* Solo existen warnings.
* No hay colaboradores.
* El Owner aún no realizó handoff.
* No existe activation plan.
* El plan fue rechazado.
* El onboarding fue cancelado.
* El onboarding quedó `rollback_required`.
* Logto organization existe, pero Civitas no pudo enlazarla.
* La reserva de hostname expiró o entró en conflicto.
* El portal está `unpublished`, `restricted` o `suspended`.

## Nomenclatura

* Traducción oficial de Owner.
* Traducción oficial de Organization Admin.
* Traducción oficial de Governance.
* Diferencia visible entre “Configuración inicial” y “Gobierno”.
* Diferencia entre completitud y preparación.
* Diferencia entre “aprobar” y “ejecutar”.
* Diferencia entre “publicado” y “activo”.
* Copy para `restricted_active`.
* Copy para `not_applicable`.
* Descripción no técnica de PBAC y Data Scope.

---

# Ajustes P0 antes de implementar UI-0

1. Publicar la tabla completa de rutas padre por actor.
2. Ampliar `OnboardingRouteRegistry` para sections, findings, resume, exit y breadcrumbs.
3. Definir la navegación interna de los pasos 5, 6 y 7.
4. Congelar la pantalla índice y el punto de entrada Owner.
5. Definir cómo afecta `not_applicable` al stepper y contador.
6. Definir clic y copy de pasos `blocked`, `conditional` y `complete`.
7. Publicar matriz de visibilidad por step, section, action, actor y estado.
8. Definir `Save and exit` por superficie.
9. Crear breadcrumbs distintos para Owner y Organization Admin.
10. Congelar la política de idioma visible.

# Ajustes P1

1. Definir la semántica de autosave, Save draft y Continue.
2. Definir CTA role-aware para blockers.
3. Dividir visualmente los pasos grandes en subsecciones.
4. Priorizar el siguiente destino del Activation Receipt.
5. Congelar estados vacíos y de error por paso.
6. Definir jerarquía móvil de contexto y acciones.
7. Añadir una vista “Mis tareas / Continuar onboarding”.
8. Definir pruebas de navegación con deep links y permisos revocados.

# Veredicto final

```text
¿Un usuario sabe en qué organización está?
SÍ, contractualmente.

¿Sabe con qué autoridad está actuando?
SÍ, contractualmente.

¿Puede volver sin usar el navegador?
PARCIALMENTE; existe la regla, faltan destinos completos.

¿Los breadcrumbs son clicables?
SÍ como principio; falta su mapa por actor y pantalla.

¿El patrón Owner/Admin es consistente?
CONCEPTUALMENTE SÍ; no implementado ni completamente especificado.

¿El patrón Teacher/Student/Parent está demostrado?
NO; está fuera del alcance.

¿Los permisos se manejan de forma confiable?
SÍ como modelo; falta matriz ejecutable por acción.

¿La navegación móvil está diseñada?
SÍ como estrategia; faltan prioridades y pruebas de interacción compleja.

¿La nomenclatura es de usuario final?
MEJORÓ, pero persiste mezcla español/inglés y lenguaje técnico.

¿Un usuario nuevo se perdería?
SÍ, principalmente dentro de los pasos complejos, al regresar desde una subsección, al cambiar entre Owner y Organization Admin y al decidir qué hacer después del receipt.

Estado recomendado:
UX_CONTRACT_APPROVED_WITH_NAVIGATION_PATCHES
```
