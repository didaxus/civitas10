-- Scope operation idempotency to the owning Logto organization.
-- The previous global partial index prevented two organizations from using the
-- same client-generated idempotency key and did not match the tenant-scoped
-- lookup performed by the integration repository.

drop index if exists operational_operations_idempotency_idx;

create unique index if not exists operational_operations_tenant_idempotency_idx
  on operational_operations(logto_organization_id, idempotency_key)
  where idempotency_key is not null;
