-- Identity federation operational tables from technical design sections 10.2-10.12.
-- All tenant-scoped records carry logto_organization_id and composite FK paths keep references tenant-safe.

create table if not exists organization_identity_connections (
  id uuid primary key default gen_random_uuid(),
  logto_organization_id varchar(128) not null,
  logto_sso_connector_id varchar(128),
  protocol varchar(16) not null check (protocol in ('oidc','saml')),
  provider_kind varchar(80) not null,
  name varchar(160) not null,
  status varchar(40) not null,
  issuer_or_entity_id varchar(512) not null,
  subject_strategy varchar(80) not null,
  group_membership_mode varchar(80) not null,
  claim_contract_version bigint not null default 1,
  mapping_version bigint not null default 1,
  provisioning_policy_version bigint not null default 1,
  configuration_fingerprint varchar(160) not null,
  secret_reference varchar(512),
  last_validated_at timestamptz,
  last_successful_login_at timestamptz,
  created_by_logto_user_id varchar(128) not null,
  updated_by_logto_user_id varchar(128) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (logto_organization_id, id)
);

create table if not exists organization_identity_domains (
  id uuid primary key default gen_random_uuid(),
  logto_organization_id varchar(128) not null,
  connection_id uuid not null,
  authority_domain varchar(255) not null,
  routing_priority integer not null default 0,
  domain_verified boolean not null default false,
  verification_method varchar(80),
  verified_at timestamptz,
  status varchar(40) not null,
  unique (logto_organization_id, id),
  unique (connection_id, authority_domain),
  unique (logto_organization_id, connection_id, authority_domain),
  foreign key (logto_organization_id, connection_id) references organization_identity_connections(logto_organization_id, id) on delete cascade
);

create table if not exists organization_identity_claim_mappings (
  id uuid primary key default gen_random_uuid(), logto_organization_id varchar(128) not null, connection_id uuid not null,
  normalized_field varchar(120) not null, external_claim_name varchar(160) not null, value_type varchar(40) not null, required boolean not null default false,
  transform_key varchar(120), version bigint not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (logto_organization_id, id), unique (logto_organization_id, connection_id, normalized_field),
  foreign key (logto_organization_id, connection_id) references organization_identity_connections(logto_organization_id, id) on delete cascade
);

create table if not exists organization_external_groups (
  id uuid primary key default gen_random_uuid(), logto_organization_id varchar(128) not null, connection_id uuid not null,
  external_group_id varchar(255) not null, external_display_name varchar(255), external_parent_id varchar(255), membership_mode varchar(40) not null, status varchar(40) not null,
  last_observed_at timestamptz not null default now(), source_version varchar(120),
  unique (logto_organization_id, id), unique (connection_id, external_group_id), unique (logto_organization_id, connection_id, external_group_id),
  foreign key (logto_organization_id, connection_id) references organization_identity_connections(logto_organization_id, id) on delete cascade
);

create table if not exists organization_external_role_mappings (
  id uuid primary key default gen_random_uuid(), logto_organization_id varchar(128) not null, connection_id uuid not null, external_group_id varchar(255) not null,
  logto_role_id varchar(128) not null, canonical_role_key varchar(120) not null check (canonical_role_key <> 'owner_global'), mode varchar(40) not null, approval_policy varchar(80) not null,
  status varchar(40) not null, version bigint not null default 1, created_by_logto_user_id varchar(128) not null, updated_by_logto_user_id varchar(128) not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (logto_organization_id, id), unique (connection_id, external_group_id, logto_role_id),
  foreign key (logto_organization_id, connection_id, external_group_id) references organization_external_groups(logto_organization_id, connection_id, external_group_id) on delete restrict
);

create table if not exists organization_external_scope_mappings (
  id uuid primary key default gen_random_uuid(), logto_organization_id varchar(128) not null, connection_id uuid not null, external_group_id varchar(255) not null,
  scope_template_id varchar(128) not null, scope_template_version varchar(80) not null, target_kind varchar(80) not null,
  dimension_value_id uuid, unit_id uuid, resource_ref varchar(255), status varchar(40) not null, version bigint not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (logto_organization_id, id), check (num_nonnulls(dimension_value_id, unit_id, resource_ref) = 1),
  foreign key (logto_organization_id, connection_id, external_group_id) references organization_external_groups(logto_organization_id, connection_id, external_group_id) on delete restrict
);

create table if not exists organization_provisioning_policies (
  logto_organization_id varchar(128) primary key, connection_id uuid not null,
  join_mode varchar(40) not null, fallback_mode varchar(40) not null, role_sync_mode varchar(40) not null, scope_sync_mode varchar(40) not null,
  remove_absent_managed_assignments boolean not null, suspend_disabled_users boolean not null, privileged_role_mode varchar(40) not null,
  login_reconciliation_enabled boolean not null, scheduled_reconciliation_enabled boolean not null, reconciliation_interval_minutes integer,
  grace_period_minutes integer not null, version bigint not null default 1, updated_by_logto_user_id varchar(128) not null, updated_at timestamptz not null default now(),
  foreign key (logto_organization_id, connection_id) references organization_identity_connections(logto_organization_id, id) on delete restrict
);

create table if not exists organization_external_identities (
  id uuid primary key default gen_random_uuid(), logto_organization_id varchar(128) not null, connection_id uuid not null,
  external_issuer varchar(512) not null, external_subject varchar(255) not null, logto_user_id varchar(128), link_status varchar(40) not null,
  email_cache varchar(255), last_authenticated_at timestamptz, last_reconciled_at timestamptz,
  unique (logto_organization_id, id), unique (connection_id, external_subject),
  foreign key (logto_organization_id, connection_id) references organization_identity_connections(logto_organization_id, id) on delete restrict
);

create table if not exists organization_federated_assignment_sources (
  id uuid primary key default gen_random_uuid(), logto_organization_id varchar(128) not null, logto_user_id varchar(128) not null,
  assignment_kind varchar(80) not null, assignment_key varchar(255) not null, source_kind varchar(80) not null,
  source_connection_id uuid, source_external_group_id varchar(255), mapping_id uuid, mapping_version bigint not null,
  state varchar(40) not null, valid_from timestamptz not null, valid_until timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (logto_organization_id, id),
  foreign key (logto_organization_id, source_connection_id, source_external_group_id) references organization_external_groups(logto_organization_id, connection_id, external_group_id) on delete restrict,
  foreign key (logto_organization_id, mapping_id) references organization_external_role_mappings(logto_organization_id, id) on delete restrict
);

create table if not exists organization_identity_reconciliation_runs (
  id uuid primary key default gen_random_uuid(), logto_organization_id varchar(128) not null, connection_id uuid not null,
  mode varchar(40) not null, trigger_source varchar(80) not null, status varchar(40) not null, started_at timestamptz not null default now(), completed_at timestamptz,
  mapping_version bigint not null, policy_version bigint not null, total_subjects integer not null default 0, created_count integer not null default 0,
  updated_count integer not null default 0, removed_count integer not null default 0, blocked_count integer not null default 0, error_count integer not null default 0,
  correlation_id varchar(160) not null, unique (logto_organization_id, id),
  foreign key (logto_organization_id, connection_id) references organization_identity_connections(logto_organization_id, id) on delete restrict
);

create table if not exists organization_identity_reconciliation_items (
  id uuid primary key default gen_random_uuid(), logto_organization_id varchar(128) not null, run_id uuid not null,
  external_subject_hash varchar(160) not null, logto_user_id varchar(128), decision varchar(80) not null, reason_code varchar(120) not null,
  before_summary jsonb, after_summary jsonb, redaction_class varchar(80) not null, created_at timestamptz not null default now(),
  unique (logto_organization_id, id),
  foreign key (logto_organization_id, run_id) references organization_identity_reconciliation_runs(logto_organization_id, id) on delete cascade
);

create index if not exists org_identity_connections_tenant_status_idx on organization_identity_connections(logto_organization_id, status);
create index if not exists org_identity_role_mappings_tenant_idx on organization_external_role_mappings(logto_organization_id, connection_id, status);
create index if not exists org_identity_scope_mappings_tenant_idx on organization_external_scope_mappings(logto_organization_id, connection_id, status);
create index if not exists org_identity_recon_runs_tenant_idx on organization_identity_reconciliation_runs(logto_organization_id, started_at desc);
