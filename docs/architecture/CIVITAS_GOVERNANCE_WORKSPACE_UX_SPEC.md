# Civitas — Especificación UX/UI del Organization Governance Workspace

> **Historical legacy strings: explicitly marked.** Any `academic.section` or `academic.grade_level` below is retained only as historical/migration evidence; it is not an active alias.


**Estado:** Normativo de diseño e implementación para Phase 2  
**Fecha:** 2026-07-16  
**Épica:** [#129](https://github.com/lssmanager/civitas10/issues/129)  
**Contrato de autorización:** [CIVITAS_AUTHORIZATION_POLICY_MODEL.md](CIVITAS_AUTHORIZATION_POLICY_MODEL.md)  
**Contrato visual:** `styles/tokens.css` → `styles/theme.css` → `shared/ui` → `shared/ui/patterns` → features.

> Este documento es el handoff único entre Producto, UX/UI y Frontend. Describe qué tarea resuelve cada pantalla, qué datos puede mostrar, qué no puede modificar, cómo responde a roles y estados, y qué patrones/tokens debe consumir. No es un mockup HTML ni una fuente alternativa de autorización.

## 1. Objetivo

El workspace permite administrar y explicar una organización seleccionada sin duplicar rutas, contexto ni políticas:

- configurar la oferta de permisos por rol;
- nombrar roles canónicos de forma local;
- administrar alcance de datos permitido;
- modelar estructura, clasificación, grupos y cursos;
- consultar segmentos operativos;
- explicar el acceso efectivo de una persona;
- auditar cambios y decisiones.

No existe un “dashboard técnico” que compita con estas tareas. Los detalles de catálogo, runtime y drift se muestran como estados contextuales cuando requieren atención.

## 2. Arquitectura de información congelada

### 2.1 Owner workspace

```text
/owner/organizations/:organizationId
├── Overview                         único resumen de la organización
├── Governance
│   ├── Access policy
│   │   ├── Role permissions
│   │   ├── Role names
│   │   └── Scope assignments
│   ├── Organization model
│   │   ├── Structure and classification
│   │   ├── Groups and courses
│   │   └── People segmentation
│   └── Control and evidence
│       ├── Access explorer
│       └── Audit log
└── Operations
```

### 2.2 Tenant workspace

```text
/o/:organizationId/settings/governance
├── Access policy
│   ├── Role permissions
│   ├── Role names
│   └── Scope assignments
├── Organization model
│   ├── Structure and classification
│   ├── Groups and courses
│   └── People segmentation
└── Control and evidence
    ├── Access explorer
    └── Audit log
```

### 2.3 Reglas de rutas

- `/owner/organizations/:organizationId` es el único **Organization Overview**.
- No existe `Governance/Overview` como segunda pantalla o ruta.
- Las secciones Governance tienen URL estable y deep-linkable.
- Owner puede editar templates/ceilings según acción; Tenant administra datos y activations dentro de esos límites.
- Un route builder siempre recibe un ID real; nunca navega con el literal `:organizationId`.
- Un deep link inválido muestra error boundary contextual y conserva AppShell; nunca pantalla blanca.

## 3. Jerarquía visual

### 3.1 Capas de navegación

| Capa | Responsabilidad | No debe hacer |
|---|---|---|
| AppShell | navegación global, sesión, organización activa | evaluar permisos o duplicar contenido |
| EntityWorkspace | contexto compacto de organización, acciones globales | crear un hero gigante o repetir breadcrumb |
| SettingsWorkbench | riel de secciones Governance y panel activo | usar tabs horizontales con scroll |
| Pantalla | resolver una tarea operacional | recrear shell, tokens o navegación |
| Detail/Drawer | inspeccionar/editar una entidad concreta | ser una nueva ruta si no es deep-link necesario |

### 3.2 Cabecera compacta

Una sola línea de contexto, por ejemplo:

```text
Organizations / Colegio TEST / Governance / Role permissions
```

Incluye: organización seleccionada, breadcrumb semántico, acciones contextuales y estado solo si es significativo. No se repiten simultáneamente ID, nombre, gran hero, breadcrumb y subtítulo técnico.

### 3.3 Riel Governance

Agrupa secciones por intención:

- **Access policy**
- **Organization model**
- **Control and evidence**

El ítem activo se destaca. Badges solo aparecen para error, bloqueo, cambios pendientes o conteo significativo; no se repite “Active” en todos los elementos.

Desktop: riel vertical de ancho tokenizado + contenido fluido.  
Mobile: selector o drawer accesible; nunca una fila de tabs con `overflow-x`.

## 4. Contrato de tokens y patrones

### 4.1 Tokens

La UI solo consume tokens semánticos de Civitas. No se usan hex, `rgba`, fallbacks de color, paleta Tailwind cruda, radios/sombras/espaciados locales ni variables por componente como `--topbar-*`.

| Necesidad | Token semántico esperado |
|---|---|
| fondo de aplicación | background/surface |
| panel elevado | surface-raised |
| separación | border/border-strong |
| texto | text/body/muted |
| acción principal | primary/primary-strong |
| resultado permitido | success |
| advertencia/pendiente | warning |
| bloqueo/error | danger |
| foco | focus-visible |
| geometría | radius, spacing, elevation canónicos |
| motion | duration/easing canónicos, respetando reduced motion |

Si falta un concepto, se añade una vez en la foundation con documentación, consumidor y validación; nunca en CSS de una pantalla.

### 4.2 Patrones obligatorios

Los patrones viven en `frontend/src/shared/ui/patterns/`, se exportan solo desde `shared/ui/index.ts` y no contienen autorización ni fetch oculto.

| Patrón | Uso |
|---|---|
| `EntityWorkspace` | contexto compacto de organización |
| `SettingsWorkbench` | riel vertical agrupado + panel |
| `MasterDetail` | lista/canvas y detalle responsive |
| `GroupedToggleList` | permisos por dominio con acordeones y toggles |
| `HierarchyWorkbench` | canvas/tree, toolbar, inspector y validaciones |
| `FilterToolbar` | filtros URL-backed, búsqueda y reset |
| `FormDrawer` | edición contextual, foco, errores y conflictos |
| `ResponsiveDataView` | tabla desktop y lista/cards mobile |
| `DecisionState` | allowed/denied/limited/pending/unavailable |

Cada patrón requiere API documentada, fixture realista, estados loading/empty/error/denied/stale, pruebas desktop/tablet/mobile, light/dark, teclado/lector de pantalla y un consumidor real.

## 5. Especificación por pantalla

### 5.1 Role permissions

**Tarea:** editar una política para un rol canónico seleccionado.

- Selector único de rol: alias tenant como etiqueta principal e ID canónico como información secundaria.
- Permisos agrupados por dominio en acordeones.
- Header de grupo: chevron, nombre, contador `x/y`, estado mixed/locked y toggle grupal.
- Fila: permiso, descripción, estado, razón, toggle individual y feedback.
- Búsqueda/filtro por dominio, permiso, estado y elegibilidad.
- Owner modifica **Owner Ceiling**.
- Tenant modifica **Tenant Activation** solo cuando existe ceiling permitido.
- Planned/deprecated/owner-denied son explícitos y no mutables.

No se muestra una matriz de todos los roles para edición. No se combinan ceiling y activation en un mismo control.

### 5.2 Role names

**Tarea:** adaptar nomenclatura local sin modificar seguridad.

- Lista de IDs canónicos, alias actual, default heredado, estado y última modificación.
- Drawer/form de edición, validación, preview y reset al nombre permitido.
- Canonical ID visible, inmutable y disponible para tecnologías asistivas.
- Alias se refleja en selector, segmentación y explorer a través de una sola fuente de datos.

Cambiar alias no cambia Logto, potencial RBAC, PBAC, ABAC, rutas ni permisos.

### 5.3 Scope assignments

**Tarea:** configurar los targets ABAC permitidos para una ruta de rol.

- Selector de rol y, cuando aplique, miembro/sujeto.
- Templates permitidos por Owner y estrategia ABAC correspondiente.
- Pickers tipados para dimension, unit, resource o relationship.
- Tabla de assignments con tipo, target, origen, estado, versión, autor y fecha.
- Cobertura efectiva, targets no resueltos y primera razón de invalidez.
- Filtros por rol, estrategia, tipo, campus/área y estado.

No crea fallback organization-wide. Un scope pertenece a su ruta de rol; no presta alcance a otra.

### 5.4 Structure and classification

**Tarea:** diseñar y mantener el modelo real de unidades de una organización.

- Canvas de `OrganizationUnit` con aristas `parentUnitId`.
- Tree/list de igual capacidad para teclado, screen reader y móvil.
- Toolbar: búsqueda, tipo, campus, estado, zoom/fit y crear unidad.
- Inspector de unidad con tabs:
  1. **Details:** nombre/alias, tipo, parent, estado y metadata.
  2. **People & relationships:** responsables y relaciones `leads`/`manages`/`teaches`.
  3. **Classification:** tags de taxonomía permitidos.
  4. **Integrity:** hijos, descendientes, warnings e historial.
  5. **Move:** cambio de padre mediante selector o drag/drop.
- El servidor valida tenant, ciclos, tipo de padre y template al persistir.

Un nodo nunca es una persona. Roles y permisos no se editan desde el grafo. Taxonomías son tags/filtros, no nodos ni aristas.

### 5.5 Groups and courses

**Tarea:** encontrar un grupo/curso y entender su composición operacional.

- Filtros: nombre, campus, grado/sección, área/materia, curso, docente, tipo, estado y responsable.
- Lista/table/cards con resultado URL-backed.
- Detalle deep-linkable: identidad, clasificación, cursos/asignaturas, docentes, líderes, resumen de roster, contexto/schedule y estado.
- Mobile cambia a drill-in detail; no split pane comprimido.
- Diferencia entre no match, sin grupos, scope que excluye datos y error backend.

Membresía o relación visible no concede acceso por sí sola.

### 5.6 People segmentation

**Tarea:** formar cohortes dinámicas para consulta operacional.

Filtros permitidos: rol/membresía, taxonomía, unidad/estructura, grupo/curso, relación registrada y atributos operativos aprobados.

Ejemplo:

```text
organization_teacher
AND academic.subject = mathematics
AND academic.section = secondary
AND membership.status = active
```

La pantalla tiene constructor de condiciones, definición normalizada, estimado/facetas seguras, resultado de personas y link a Access explorer.

Segmentación **no** es ABAC: no concede permisos, no cambia activations ni escribe scopes. El backend valida toda query y aplica el permiso/scope del actor antes de devolver personas o facetas.

### 5.7 Access explorer

**Tarea:** explicar por qué una persona puede o no puede realizar una acción en esta organización. Es estrictamente read-only.

Tiene tres vistas sincronizadas sobre el mismo read model:

1. **Effective access summary:** identidad, membresías, roles/aliases, totales effective/denied/limited/pending, scopes principales, versión y alertas reales.
2. **Permission decision matrix:**

   | Permiso | Rol/ruta | RBAC | Owner Ceiling | Tenant Activation | ABAC scope | Efectivo | Primera razón |
   |---|---|---|---|---|---|---|---|

3. **Dependency graph para una decisión seleccionada:**

   ```text
   persona → membresía → rol → permiso potencial
           → ceiling → activation → estrategia ABAC
           → scope/relación/unidad/taxonomía → resultado
   ```

La matriz es la alternativa universal accesible. El grafo explica una decisión, no muestra una telaraña de toda la organización. Ninguna de las vistas crea excepciones individuales; los links llevan a los owners de roles, activations o scopes.

### 5.8 Audit log

**Tarea:** investigar evidencia de cambios de governance y decisiones.

Filtros: actor, miembro, rol, alias, permiso, acción, grupo, unidad, taxonomía, template/tipo de scope, resultado, reason code, origen, fecha y versión de política/catálogo.

- Tabla paginada, cursor-backed.
- Detalle redacted de before/after, actor, fuente, versión/correlación y links seguros.
- URL con filtros; export solo si contrato lo permite.
- Estados de vacío, retención expirada, loading, error y denied.

El log es append-only. Diagnósticos runtime pertenecen a Operations, no a esta pantalla.

## 6. Contrato de datos y visibilidad

- El frontend consume DTOs tipados, versiones y eligibility resuelta.
- Screen/action registry decide si una pantalla puede mostrarse; backend decide la API.
- La UI no deriva permisos de aliases, roles locales ni JWT crudo.
- Cada query incluye `organizationId` validado en servidor.
- Read models productivos consumen persistencia real; no repositorios in-memory.
- Estados `planned` o backend no disponible se representan como `unavailable`, no como datos falsos.
- La respuesta incluye solo reason codes seguros y nunca enumera datos de otro tenant.

## 7. Estados, errores y feedback

Toda pantalla debe implementar:

| Estado | Comportamiento |
|---|---|
| Loading | skeleton/estado de carga estable sin layout shift excesivo |
| Empty | explica si no hay configuración, no hay coincidencia o aún no existe dato |
| Denied | acceso denegado seguro; no enumera recursos |
| Limited | explica que existe permiso pero falta/limita scope |
| Pending | capacidad declarada pero backend/operación todavía no activa |
| Unavailable | operación no montada o integración indisponible |
| Error | detalle seguro, retry y navegación de vuelta |
| Stale/conflict | muestra versión y permite refrescar/revisar, sin sobrescribir silenciosamente |

Las mutaciones presentan confirmación, estado pending, éxito, conflicto de versión y error recuperable. Nunca dejan la pantalla en blanco.

## 8. Responsive y accesibilidad

- Desktop: contexto compacto, riel vertical y contenido fluido; no usar ancho fijo que desperdicie viewport.
- Tablet: riel compacto o drawer según espacio; toolbars pueden envolver controles.
- Mobile: selector/drawer para secciones, drill-in para details, lista/cards para tablas.
- No hay scroll horizontal como mecanismo de navegación.
- Foco visible, orden de tabulación lógico, `aria-expanded`, `aria-controls`, labels y mensajes de estado.
- Acordeones: flechas arriba/abajo, Enter/Space.
- Canvas: alternativa tree/list completa; no es la única vía.
- Matriz/grafo: tabla/lista equivalente.
- Texto largo se trunca visualmente con nombre completo disponible.
- Respeta `prefers-reduced-motion`; no depende solo de color para estado.

## 9. Prohibiciones de diseño

- Duplicar encabezado/breadcrumb/contexto de organización.
- Pantallas de tarjetas genéricas sin tarea operacional.
- Badges repetidos “Active” sin cambio de decisión.
- Tabs horizontales desplazables para muchas secciones.
- HTML/CSS local de mockup copiado a features.
- Paleta, spacing, shadows, radius o tokens por componente fuera de la foundation.
- Permisos editables dentro de nodos organizacionales.
- Segmentos que actúan como scopes/roles.
- Excepciones individuales ocultas desde Access explorer.
- Autorización calculada en frontend.

## 10. Handoff y validación

Antes de aprobar una pantalla, UX/UI y Frontend verifican:

- [ ] Ruta, breadcrumb, permiso/action y ownership Owner/Tenant definidos.
- [ ] Tarea real, datos visibles y acciones no permitidas definidos.
- [ ] Patrón `shared/ui` y tokens identificados; ningún estilo aislado.
- [ ] Estados loading/empty/denied/limited/pending/unavailable/error/stale diseñados.
- [ ] Datos/acciones son server-authoritative y tenant-scoped.
- [ ] Desktop, tablet, mobile, dark/light, teclado, lector de pantalla y reduced motion revisados.
- [ ] Deep link, refresh, error boundary y URL-state probados.
- [ ] Fixture visual realista y al menos un consumer/test existente.
- [ ] Auditoría, concurrencia y revocación consideradas para mutaciones.

Los issues #130–#139 contienen los prompts ejecutables y criterios de aceptación específicos de cada entrega. Este documento prevalece cuando un mockup contradiga los contratos de autorización, datos o tokens.
