-- Planning authoring model. Every key and reference carries organization_id: an
-- identifier from another tenant can therefore never become a valid relation.
create table planning_roadmaps (
  organization_id varchar(128) not null, id uuid not null, name text not null check (btrim(name) <> ''),
  version bigint not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (organization_id, id), unique (organization_id, id, version)
);
create table planning_units (
  organization_id varchar(128) not null, id uuid not null, roadmap_id uuid not null, title text not null check (btrim(title) <> ''),
  rank bigint not null check (rank > 0), version bigint not null default 1, payload jsonb not null default '{}'::jsonb,
  primary key (organization_id, id), foreign key (organization_id, roadmap_id) references planning_roadmaps(organization_id,id) on delete cascade,
  unique (organization_id, roadmap_id, rank)
);
create table planning_moments (
  organization_id varchar(128) not null, id uuid not null, planning_unit_id uuid not null, title text not null,
  rank bigint not null check (rank > 0), version bigint not null default 1, payload jsonb not null default '{}'::jsonb,
  primary key (organization_id,id), foreign key (organization_id,planning_unit_id) references planning_units(organization_id,id) on delete cascade,
  unique (organization_id,planning_unit_id,rank)
);
create table planning_calibrations (
  organization_id varchar(128) not null, id uuid not null, taxonomy_version text not null, rules jsonb not null,
  version bigint not null default 1, primary key (organization_id,id)
);
create table planning_assessment_blueprints (
  organization_id varchar(128) not null, id uuid not null, name text not null, calibration_id uuid not null,
  version bigint not null default 1, primary key (organization_id,id),
  foreign key (organization_id,calibration_id) references planning_calibrations(organization_id,id)
);
create table planning_assessment_components (
  organization_id varchar(128) not null, id uuid not null, blueprint_id uuid not null, kind text not null,
  rank bigint not null check (rank > 0), weight numeric(12,6) not null check (weight >= 0), config jsonb not null default '{}'::jsonb,
  primary key (organization_id,id), foreign key (organization_id,blueprint_id) references planning_assessment_blueprints(organization_id,id) on delete cascade,
  unique (organization_id,blueprint_id,rank)
);
create table planning_validation_runs (
  organization_id varchar(128) not null, id uuid not null, blueprint_id uuid not null, input_hash char(64) not null,
  validator_version text not null, status text not null check(status in ('valid','invalid')), findings jsonb not null,
  created_at timestamptz not null default now(), primary key (organization_id,id),
  foreign key (organization_id,blueprint_id) references planning_assessment_blueprints(organization_id,id),
  unique (organization_id,blueprint_id,input_hash,validator_version)
);
create table planning_authoring_idempotency (
  organization_id varchar(128) not null, idempotency_key text not null, request_hash char(64) not null,
  response jsonb not null, primary key (organization_id,idempotency_key)
);
create table planning_authoring_audit (
  organization_id varchar(128) not null, id uuid not null, actor_id text not null, action text not null,
  aggregate_id uuid not null, details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
  primary key (organization_id,id)
);

