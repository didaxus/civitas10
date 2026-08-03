# #197 — Verificación del gate de aprobaciones humanas

**Fecha de verificación:** 2026-07-29

**Resultado:** `NO-GO / BLOCKED`

**Alcance:** decisión previa a implementar sources/AI e ingestion en #198

## Evidencia revisada

La fuente de verdad exigida por ADR-005 es su registro de revisión humana. Al realizar
esta verificación, las tres disciplinas obligatorias siguen registradas como
`Pendiente — BLOCKER`, sin identidad/fecha de aprobación ni enlace a evidencia:

| Disciplina requerida | Estado verificado | Evidencia de aprobación |
|---|---|---|
| Arquitectura | `Pendiente — BLOCKER` | No registrada |
| Seguridad | `Pendiente — BLOCKER` | No registrada |
| Legal/Privacy | `Pendiente — BLOCKER` | No registrada |

El ADR mantiene además una resolución explícita `NO-GO / BLOCKED`. Su regla de salida
requiere las tres decisiones `Aprobado`, cero blockers, evidencias enlazadas y una
resolución final explícita del Architecture owner. Una aprobación de PR o un comentario
informal no satisfacen esa regla.

## Decisión de implementación

No se añadieron migrations, services, adapters ni UI de sources/AI. Tampoco se
implementaron sources, ingestion versions, findings, suggestions/candidates,
decisions, governed reuse, file references, malware checks, adapters de proveedor,
provenance/license, retention/deletion ni el flujo de aceptación canónica con
`If-Match`.

En consecuencia, las pruebas de deduplicación, retries, fuente maliciosa, timeout de
proveedor, aislamiento de tenant y propagación de borrado se difieren junto con la
implementación. Añadir pruebas que presupongan esos componentes antes del `GO` sería
materializar prematuramente el diseño bloqueado y produciría una señal engañosa.

## Condición para reanudar

Antes de comenzar #198 debe repetirse esta verificación sobre ADR-005 y comprobar, sin
inferencias ni aprobaciones atribuidas:

1. Arquitectura, Seguridad y Legal/Privacy figuran como `Aprobado`, con persona y fecha.
2. Cada decisión enlaza evidencia verificable y no conserva condiciones abiertas.
3. No queda ningún blocker en la tabla ni en sus evidencias.
4. El Architecture owner registra una resolución final explícita `Accepted / GO`.

Hasta que las cuatro condiciones estén registradas, un cambio de implementación debe
ser rechazado como violación del gate de #197.
