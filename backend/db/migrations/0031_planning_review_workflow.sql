-- Tenant-scoped, event-sourced planning review workflow. All command writes, audit rows
-- and integration_outbox_events must be committed by the application in one transaction.
create table if not exists planning_review_streams (
  logto_organization_id varchar(128) not null,
  plan_id uuid not null,
  current_version integer not null default 0 check (current_version >= 0),
  primary key (logto_organization_id, plan_id)
);

create table if not exists planning_review_events (
  event_id uuid primary key,
  logto_organization_id varchar(128) not null,
  plan_id uuid not null,
  aggregate_version integer not null check (aggregate_version > 0),
  event_type varchar(100) not null,
  payload jsonb not null,
  occurred_at timestamptz not null,
  unique (logto_organization_id, plan_id, aggregate_version),
  foreign key (logto_organization_id, plan_id) references planning_review_streams(logto_organization_id, plan_id)
);
create index if not exists planning_review_events_rebuild_idx on planning_review_events(logto_organization_id, plan_id, aggregate_version);

create table if not exists planning_reviewer_assignments (
  assignment_id uuid primary key,
  logto_organization_id varchar(128) not null,
  plan_id uuid not null,
  reviewer_id varchar(128) not null,
  plan_version integer not null,
  assigned_by varchar(128) not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (logto_organization_id, assignment_id),
  foreign key (logto_organization_id, plan_id) references planning_review_streams(logto_organization_id, plan_id)
);
create index if not exists planning_assignments_tenant_plan_idx on planning_reviewer_assignments(logto_organization_id, plan_id, active);

create table if not exists planning_review_decisions (
  decision_id uuid primary key,
  logto_organization_id varchar(128) not null,
  plan_id uuid not null,
  assignment_id uuid not null,
  actor_id varchar(128) not null,
  decision varchar(16) not null check (decision in ('approved','rejected')),
  plan_version integer not null,
  rationale text,
  created_at timestamptz not null default now(),
  unique (logto_organization_id, assignment_id),
  foreign key (logto_organization_id, assignment_id) references planning_reviewer_assignments(logto_organization_id, assignment_id),
  foreign key (logto_organization_id, plan_id) references planning_review_streams(logto_organization_id, plan_id)
);

create table if not exists planning_review_idempotency (
  logto_organization_id varchar(128) not null,
  operation varchar(100) not null,
  idempotency_key varchar(220) not null,
  request_fingerprint varchar(128) not null,
  result_json jsonb not null,
  created_at timestamptz not null default now(),
  primary key (logto_organization_id, operation, idempotency_key)
);

create or replace function planning_forbid_immutable_change() returns trigger language plpgsql as $$
begin raise exception 'planning review history is immutable' using errcode = '55000'; end $$;
drop trigger if exists planning_review_decisions_immutable on planning_review_decisions;
create trigger planning_review_decisions_immutable before update or delete on planning_review_decisions for each row execute function planning_forbid_immutable_change();
drop trigger if exists planning_review_events_immutable on planning_review_events;
create trigger planning_review_events_immutable before update or delete on planning_review_events for each row execute function planning_forbid_immutable_change();
