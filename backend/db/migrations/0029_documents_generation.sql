-- Tenant-owned document metadata only. Object locations and document content remain in the storage adapter.
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  logto_organization_id varchar(128) not null,
  operation_id uuid not null references operational_operations(id),
  title varchar(240) not null,
  media_type varchar(120) not null,
  visibility varchar(16) not null,
  file_reference varchar(200) not null,
  content_hash char(64) not null,
  document_version integer not null default 1,
  provenance_json jsonb not null,
  retention_until timestamptz,
  legal_hold boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(logto_organization_id, file_reference),
  constraint documents_visibility_ck check (visibility in ('public','private')),
  constraint documents_opaque_reference_ck check (file_reference ~ '^file_[A-Za-z0-9_-]{16,180}$'),
  constraint documents_hash_ck check (content_hash ~ '^[a-f0-9]{64}$'),
  constraint documents_provenance_safe_ck check (provenance_json::text !~* '(accessToken|refreshToken|bearer|authorization|password|secret|privateKey|apiKey|cookie|https?://)')
);
create index if not exists documents_tenant_lookup_idx on documents(logto_organization_id, id);
create index if not exists documents_retention_idx on documents(retention_until) where legal_hold = false;

alter table operational_operations add column if not exists document_id uuid;
create unique index if not exists document_generation_idempotency_idx
  on operational_operations(logto_organization_id, idempotency_key)
  where operation_type = 'documents.generate' and idempotency_key is not null;

alter table documents enable row level security;
alter table documents force row level security;
drop policy if exists documents_tenant_isolation on documents;
create policy documents_tenant_isolation on documents using (
  logto_organization_id = nullif(current_setting('civitas.organization_id', true), '')
) with check (
  logto_organization_id = nullif(current_setting('civitas.organization_id', true), '')
);
