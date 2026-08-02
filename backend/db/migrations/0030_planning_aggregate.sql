-- Tenant-isolated Planning aggregate, immutable version history and atomic side-effect ledger.
create table planning_profiles (
  organization_id varchar(128) not null, id varchar(180) not null, version integer not null default 1 check (version > 0),
  configuration jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (organization_id, id), unique (organization_id, id, version)
);

create table planning_plans (
  organization_id varchar(128) not null, id varchar(180) not null, profile_id varchar(180) not null,
  name varchar(255) not null check (btrim(name) <> ''), plan_type varchar(32) not null default 'operational', state varchar(32) not null default 'draft',
  current_version integer not null default 1 check (current_version > 0), revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (organization_id, id), unique (organization_id, id, revision),
  foreign key (organization_id, profile_id) references planning_profiles(organization_id, id),
  constraint planning_plans_type_ck check (plan_type in ('strategic','tactical','operational','project','curriculum')),
  constraint planning_plans_state_ck check (state in ('draft','in_review','changes_requested','approved','archived'))
);
create index planning_plans_org_state_idx on planning_plans(organization_id, state, updated_at);

create table planning_versions (
  organization_id varchar(128) not null, plan_id varchar(180) not null, version integer not null check (version > 0),
  state varchar(32) not null, content jsonb not null, created_by varchar(180) not null, created_at timestamptz not null default now(),
  approved_by varchar(180), approved_at timestamptz,
  source_version integer, source_hash char(64), source_actor varchar(180), source_at timestamptz, source_reason text,
  primary key (organization_id, plan_id, version),
  foreign key (organization_id, plan_id) references planning_plans(organization_id, id),
  constraint planning_versions_state_ck check (state in ('draft','approved')),
  constraint planning_versions_source_ck check ((source_version is null and source_hash is null and source_actor is null and source_at is null and source_reason is null) or (source_version is not null and source_hash ~ '^[a-f0-9]{64}$' and source_actor is not null and source_at is not null and btrim(source_reason) <> '')),
  constraint planning_versions_approval_ck check ((state = 'approved' and approved_by is not null and approved_at is not null) or (state = 'draft' and approved_by is null and approved_at is null))
);
create index planning_versions_org_plan_created_idx on planning_versions(organization_id, plan_id, created_at);

create function planning_protect_approved_version() returns trigger language plpgsql as $$
begin
  if old.state = 'approved' then raise exception 'approved planning versions are immutable' using errcode = '23514'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger planning_versions_approved_immutable before update or delete on planning_versions
for each row execute function planning_protect_approved_version();

create table planning_audit (
  organization_id varchar(128) not null, id varchar(180) not null, plan_id varchar(180), action varchar(160) not null,
  actor_id varchar(180) not null, aggregate_revision integer, details jsonb not null default '{}'::jsonb,
  correlation_id varchar(160) not null, created_at timestamptz not null default now(), primary key (organization_id, id),
  foreign key (organization_id, plan_id) references planning_plans(organization_id, id)
);
create index planning_audit_org_plan_idx on planning_audit(organization_id, plan_id, created_at);

create table planning_idempotency (
  organization_id varchar(128) not null, idempotency_key varchar(200) not null, fingerprint varchar(128) not null,
  result jsonb not null, created_at timestamptz not null default now(), primary key (organization_id, idempotency_key)
);

-- Canonical outbox remains integration_outbox_events; this tenant-aware index prevents duplicate aggregate revisions.
create unique index integration_outbox_planning_revision_uidx
  on integration_outbox_events(logto_organization_id, aggregate_type, aggregate_id, aggregate_version)
  where aggregate_type in ('planning.plan', 'planning.profile');
