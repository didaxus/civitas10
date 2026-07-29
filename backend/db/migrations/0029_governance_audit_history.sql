-- #138: append-only, tenant-bound audit evidence for governance and module mutations.
create table if not exists governance_audit_events (
  event_id uuid primary key,
  schema_version varchar(16) not null,
  event_type varchar(160) not null,
  logto_organization_id varchar(128) not null,
  actor_ref varchar(96) not null,
  operation varchar(160) not null,
  target jsonb not null,
  outcome varchar(40) not null,
  reason_code varchar(120) not null,
  decision_id varchar(160),
  decision_snapshot jsonb,
  source_versions jsonb not null default '{}'::jsonb,
  correlation_id varchar(160), causation_id varchar(160),
  before_redacted jsonb, after_redacted jsonb,
  sensitivity varchar(40) not null,
  retention_class varchar(40) not null,
  recorded_at timestamptz not null default now(),
  check (actor_ref = 'system' or actor_ref like 'subject_sha256:%'),
  check (jsonb_typeof(target) = 'object')
);
create index if not exists governance_audit_tenant_cursor_idx on governance_audit_events(logto_organization_id, recorded_at desc, event_id desc);
create index if not exists governance_audit_tenant_operation_idx on governance_audit_events(logto_organization_id, operation, recorded_at desc);

create table if not exists governance_audit_retention_tombstones (
  event_id uuid not null, logto_organization_id varchar(128) not null,
  expired_at timestamptz not null default now(), retention_class varchar(40) not null,
  primary key (logto_organization_id, event_id)
);

create or replace function governance_audit_immutable() returns trigger language plpgsql as $$ begin raise exception 'governance audit history is immutable'; end $$;
drop trigger if exists governance_audit_no_update on governance_audit_events;
create trigger governance_audit_no_update before update or delete on governance_audit_events for each row execute function governance_audit_immutable();
