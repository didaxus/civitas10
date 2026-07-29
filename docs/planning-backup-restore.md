# Backup y restauración de Planning

Planning conserva el estado actual y toda versión histórica en tablas separadas. El backup debe incluir también auditoría e idempotencia, y los eventos de Planning del outbox canónico.

## Backup consistente

Ejecutar con un rol que pueda leer las tablas y mantener el snapshot en una única transacción:

```bash
pg_dump "$DATABASE_URL" --format=custom --file=planning.dump \
  --table=planning_profiles --table=planning_plans --table=planning_versions \
  --table=planning_audit --table=planning_idempotency \
  --table=integration_outbox_events
```

No se deben excluir filas del outbox durante el backup: los consumidores son idempotentes y necesitan su `event_id`. Cifrar el fichero, limitar su acceso y aplicar la política de retención organizativa.

## Restauración

1. Detener escritores y dispatcher del outbox.
2. Aplicar primero todas las migraciones hasta `0029_planning_aggregate.sql`.
3. Restaurar en orden de dependencia y sin desactivar triggers:

```bash
pg_restore --dbname="$DATABASE_URL" --single-transaction --data-only \
  --table=planning_profiles --table=planning_plans --table=planning_versions \
  --table=planning_audit --table=planning_idempotency \
  --table=integration_outbox_events planning.dump
```

4. Validar que no hay referencias huérfanas, que cada versión actual existe y que los aprobados conservan autor y fecha:

```sql
select p.organization_id, p.id from planning_plans p
left join planning_versions v on v.organization_id=p.organization_id and v.plan_id=p.id and v.version=p.current_version
where v.plan_id is null;

select organization_id, plan_id, version from planning_versions
where state='approved' and (approved_by is null or approved_at is null);
```

5. Reanudar primero la aplicación y después el dispatcher. Una restauración parcial debe hacerse por `organization_id` en **todas** las tablas y requiere filtrar también `integration_outbox_events.logto_organization_id`; nunca reutilizar eventos de otro tenant.
