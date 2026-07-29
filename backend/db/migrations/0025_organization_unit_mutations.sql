-- Uses the parent/cycle and management-level triggers installed by 0009/0012.
create table if not exists organization_structure_audit_events (
 id uuid primary key default gen_random_uuid(), logto_organization_id varchar(128) not null,
 actor_logto_user_id varchar(128), action varchar(140) not null,
 unit_id uuid references organization_units(id) on delete set null, structure_version bigint,
 details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists organization_structure_audit_org_created_idx on organization_structure_audit_events(logto_organization_id,created_at);
