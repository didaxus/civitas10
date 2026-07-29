# #138 — alcance y contrato del historial de auditoría

## Alcance

El historial durable es **transversal a mutaciones tenant-bound**, no sólo authorization/governance. Incluye decisiones de autorización, cambios de gobierno y eventos de módulos que representen una mutación relevante, por ejemplo `planning.plan.updated.v1`. Los eventos puramente técnicos de alta frecuencia permanecen en observabilidad salvo que constituyan evidencia de una mutación, una decisión o una exportación.

## Invariantes

* La fila de auditoría se inserta en la misma transacción que la mutación. El commit falla si no puede persistirse la evidencia; la proyección sólo lee filas append-only.
* El actor es un hash estable o `system`; el target contiene tipo y un identificador opaco. Nunca se almacenan JWT, cabeceras, cookies, secretos, correo crudo ni referencias de recursos ocultos.
* `decisionId` enlaza la decisión persistida y `decisionSnapshot` conserva el resultado y la versión evaluada. Una lectura histórica nunca vuelve a evaluar con la política vigente.
* El orden del cursor es `(recorded_at DESC, event_id DESC)`. Cada consulta está ligada obligatoriamente a una organización.
* La expiración conserva una lápida mínima y devuelve `retention_expired`; no reconstituye el contenido eliminado.
* Exportar requiere capability explícita y genera `governance.audit.exported` en el mismo historial.
