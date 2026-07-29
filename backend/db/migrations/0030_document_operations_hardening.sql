-- Durable document generation workflow. Payload/blob bytes never enter PostgreSQL.
alter table operational_operations add column if not exists cancellation_requested_at timestamptz;
alter table operational_operations add column if not exists heartbeat_at timestamptz;

alter table documents add column if not exists checksum_algorithm varchar(16) not null default 'sha256';
alter table documents add column if not exists size_bytes bigint not null default 0;
alter table documents add column if not exists classification varchar(32) not null default 'confidential';
alter table documents add column if not exists retention_class varchar(32) not null default 'standard';

alter table documents drop constraint if exists documents_classification_ck;
alter table documents add constraint documents_classification_ck
  check (classification in ('public','internal','confidential','restricted'));
alter table documents drop constraint if exists documents_size_ck;
alter table documents add constraint documents_size_ck check (size_bytes >= 0);

create table if not exists document_operation_dead_letters (
  operation_id uuid primary key references operational_operations(id) on delete cascade,
  logto_organization_id varchar(128) not null,
  reason_code varchar(120) not null,
  attempts integer not null,
  reconciliation_status varchar(32) not null default 'pending_review',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_operation_dlq_status_ck check
    (reconciliation_status in ('pending_review','retry_approved','requeued','resolved','discarded'))
);
create index if not exists document_operation_recovery_idx
  on operational_operations(status, heartbeat_at, next_retry_at)
  where operation_type = 'documents.generate';

alter table document_operation_dead_letters enable row level security;
alter table document_operation_dead_letters force row level security;
drop policy if exists document_operation_dlq_tenant_isolation on document_operation_dead_letters;
create policy document_operation_dlq_tenant_isolation on document_operation_dead_letters using (
  logto_organization_id = nullif(current_setting('civitas.organization_id', true), '')
) with check (
  logto_organization_id = nullif(current_setting('civitas.organization_id', true), '')
);
