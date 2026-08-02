-- Expand Planning idempotency from tenant+key to the canonical caller and operation scope.
alter table planning_idempotency add column if not exists principal_id varchar(180);
alter table planning_idempotency add column if not exists operation_id varchar(180);
update planning_idempotency set principal_id = 'legacy-unknown', operation_id = 'planning.legacy' where principal_id is null or operation_id is null;
alter table planning_idempotency alter column principal_id set not null;
alter table planning_idempotency alter column operation_id set not null;
alter table planning_idempotency drop constraint if exists planning_idempotency_pkey;
alter table planning_idempotency add primary key (organization_id, principal_id, operation_id, idempotency_key);
