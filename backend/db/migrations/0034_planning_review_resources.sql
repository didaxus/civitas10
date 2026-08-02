-- Durable collaboration and maker-checker read resources for the Planning review stream.
create table if not exists planning_collaborators (
  logto_organization_id varchar(128) not null, plan_id uuid not null, collaborator_id varchar(128) not null,
  access_level varchar(24) not null check (access_level in ('viewer','editor','reviewer','approver')),
  lifecycle varchar(16) not null default 'active' check (lifecycle in ('active','revoked','expired','completed')),
  assigned_by varchar(128) not null, expires_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (logto_organization_id,plan_id,collaborator_id,access_level)
);
create table if not exists planning_review_assignments (
  logto_organization_id varchar(128) not null, assignment_id uuid not null, plan_id uuid not null,
  assignment_type varchar(16) not null check (assignment_type in ('reviewer','approver')), assignee_id varchar(128) not null,
  plan_version integer not null, lifecycle varchar(16) not null default 'active' check (lifecycle in ('active','revoked','expired','completed')),
  assigned_by varchar(128) not null, expires_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (logto_organization_id,assignment_id), foreign key (logto_organization_id,plan_id) references planning_review_streams(logto_organization_id,plan_id)
);
create index if not exists planning_review_assignments_lookup_idx on planning_review_assignments(logto_organization_id,plan_id,assignment_type,assignee_id,lifecycle);
create table if not exists planning_review_requests (
  logto_organization_id varchar(128) not null, review_request_id uuid not null, plan_id uuid not null, plan_version integer not null,
  author_id varchar(128) not null, status varchar(24) not null check (status in ('in_review','changes_requested','approved','cancelled')),
  stream_version integer not null, submitted_at timestamptz not null, updated_at timestamptz not null default now(),
  primary key (logto_organization_id,review_request_id), unique(logto_organization_id,plan_id,plan_version)
);
create table if not exists planning_maker_checker_policies (
  logto_organization_id varchar(128) not null, policy_version integer not null, require_separate_approver boolean not null default true,
  minimum_approvals integer not null default 1 check (minimum_approvals > 0), configured_by varchar(128) not null,
  effective_at timestamptz not null, superseded_at timestamptz, configuration jsonb not null default '{}'::jsonb,
  primary key(logto_organization_id,policy_version)
);
create table if not exists planning_approved_snapshots (
  logto_organization_id varchar(128) not null, plan_id uuid not null, plan_version integer not null, snapshot jsonb not null,
  snapshot_hash char(64) not null check (snapshot_hash ~ '^[a-f0-9]{64}$'), provenance jsonb not null,
  approved_by varchar(128) not null, approved_at timestamptz not null, policy_version integer not null,
  primary key(logto_organization_id,plan_id,plan_version)
);
create trigger planning_approved_snapshots_immutable before update or delete on planning_approved_snapshots for each row execute function planning_forbid_immutable_change();
