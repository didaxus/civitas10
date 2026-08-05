create table if not exists civitas_role_label_versions (
  scope text not null check (scope in ('global','organization')),
  logto_organization_id text,
  version integer not null default 0 check (version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (scope, logto_organization_id),
  check ((scope = 'global' and logto_organization_id is null) or (scope = 'organization' and logto_organization_id is not null))
);
create unique index if not exists civitas_role_label_versions_global_once on civitas_role_label_versions ((scope)) where scope = 'global';
insert into civitas_role_label_versions(scope, logto_organization_id, version) values ('global', null, 0) on conflict do nothing;
create table if not exists civitas_role_label_overrides (
  canonical_role_key text primary key,
  display_name text not null check (btrim(display_name) <> ''),
  version integer not null check (version >= 0),
  updated_by_logto_user_id text,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists civitas_role_label_overrides_display_name_ci on civitas_role_label_overrides (lower(display_name));
create table if not exists organization_role_aliases (
  logto_organization_id text not null,
  canonical_role_key text not null,
  logto_role_id_snapshot text,
  display_name text not null check (btrim(display_name) <> ''),
  version integer not null check (version >= 0),
  updated_by_logto_user_id text,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (logto_organization_id, canonical_role_key)
);
create unique index if not exists organization_role_aliases_display_name_ci on organization_role_aliases (logto_organization_id, lower(display_name));
create table if not exists governance_role_label_audit_events (
  id bigserial primary key,
  event_type text not null,
  scope text not null check (scope in ('global','organization')),
  logto_organization_id text,
  canonical_role_key text not null,
  actor_logto_user_id text,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  correlation_id uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists governance_role_label_audit_lookup on governance_role_label_audit_events (logto_organization_id, canonical_role_key, created_at desc);
