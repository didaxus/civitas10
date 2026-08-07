
# CIVITAS — Integración de Tenant Resolution con `didaxus/civitas10`

**Código:** TR-35  
**Estado:** contrato de integración; no es una migración paralela

## 1. Decisión

Tenant Resolution se añade como una nueva superficie BFF y no reemplaza el Core Manager existente.

```text
Core Manager SPA existente
→ permanece en civitas.didaxus.com
→ bearer / @logto/react

Organization Portal nuevo
→ *.portal.didaxus.com
→ tenant-bff
→ cookie host-only

Callback central nuevo
→ auth-callback.didaxus.com
```

## 2. Fundaciones que se reutilizan

```text
operational_tenants
→ organización interna canónica

audit_logs
→ auditoría

integration_outbox_events
integration_inbox_receipts
integration_dead_letters
→ mensajería confiable

idempotency_records
→ idempotencia global
```

Queda prohibido crear equivalentes paralelos.

## 3. Identidad

```text
organization_tenant_states.organization_id
→ operational_tenants.id
```

`logto_organization_id` continúa como identificador externo dentro de la fundación existente; no sustituye el UUID interno.

## 4. Application services y API central

Se conserva:

```text
/api/v1/o/{organizationId}/...
```

El Organization Portal no la invoca exponiendo organizationId desde el navegador. El tenant-bff resuelve el hostname, crea `TenantExecutionContext` y llama la misma application layer.

## 5. Autorización reutilizada

- catálogo canónico;
- RBAC/PBAC/ABAC;
- route/action registries;
- `requirePermission`;
- authorization evaluator;
- audit decision IDs.

Tenant Resolution ocurre antes de autorización funcional.

## 6. Persistencia

Las nuevas tablas son extensiones del control plane tenant. No crean otra organización, auditoría, outbox o idempotencia.

Los eventos se insertan en `integration_outbox_events` dentro de la misma transacción. La auditoría usa `audit_logs`; las operaciones idempotentes reclaman `idempotency_records`.

## 7. OpenAPI

```text
contracts/openapi/platform/tenant-bff.yaml
contracts/openapi/platform/tenant-resolution-owner.yaml
```

Owner se compone en `contracts/openapi/civitas-api.yaml` con metadata `x-civitas-*`. El BFF local se publica como contrato de superficie separado.

## 8. CI

Gates Node:

```text
tenant-resolution:contract-check
tenant-resolution:postgres-check
tenant-resolution:edge-check
ui:tenant-resolution:check
```

El gate PostgreSQL reutiliza el servicio PostgreSQL del workflow actual.
