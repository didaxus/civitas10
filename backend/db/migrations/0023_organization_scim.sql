-- Organization SCIM provisioning persistence.
-- Secrets are stored only by reference; tenant/connection-qualified keys prevent cross-connection references.

create table if not exists organization_scim_connections (
  id uuid primary key default gen_random_uuid(),
  logto_organization_id varchar(128) not null,
  display_name varchar(255) not null,
  base_url text,
  status varchar(40) not null default 'draft',
  scim_version varchar(16) not null default '2.0',
  auth_mode varchar(40) not null default 'bearer_token',
  provisioning_mode varchar(40) not null default 'authoritative',
  user_match_strategy varchar(80) not null default 'external_id_then_user_name',
  group_match_strategy varchar(80) not null default 'external_id_then_display_name',
  configuration_fingerprint varchar(128) not null,
  version bigint not null default 1,
  created_by_logto_user_id varchar(128) not null,
  updated_by_logto_user_id varchar(128) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_scim_connections_org_id_uidx unique (logto_organization_id, id),
  constraint organization_scim_connections_status_chk check (status in ('draft','validating','active','degraded','suspended','rotating_credentials','decommissioning','archived')),
  constraint organization_scim_connections_version_chk check (scim_version in ('1.1','2.0')),
  constraint organization_scim_connections_auth_mode_chk check (auth_mode in ('bearer_token','oauth2_client_credentials','mutual_tls','none')),
  constraint organization_scim_connections_provisioning_mode_chk check (provisioning_mode in ('authoritative','import_only','preview','disabled'))
);
create index if not exists organization_scim_connections_org_status_idx on organization_scim_connections (logto_organization_id, status);

create table if not exists organization_scim_credentials (
  id uuid primary key default gen_random_uuid(),
  logto_organization_id varchar(128) not null,
  connection_id uuid not null,
  credential_kind varchar(40) not null,
  secret_reference varchar(255) not null,
  status varchar(40) not null default 'active',
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  rotated_from_credential_id uuid,
  created_by_logto_user_id varchar(128) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_scim_credentials_org_id_uidx unique (logto_organization_id, id),
  constraint organization_scim_credentials_connection_fk foreign key (logto_organization_id, connection_id) references organization_scim_connections (logto_organization_id, id) on delete cascade,
  constraint organization_scim_credentials_rotated_fk foreign key (logto_organization_id, rotated_from_credential_id) references organization_scim_credentials (logto_organization_id, id) on delete restrict,
  constraint organization_scim_credentials_kind_chk check (credential_kind in ('bearer_token','oauth_client_secret','mtls_certificate','signing_key')),
  constraint organization_scim_credentials_status_chk check (status in ('active','pending_rotation','retired','revoked')),
  constraint organization_scim_credentials_validity_chk check (valid_until is null or valid_until > valid_from),
  constraint organization_scim_credentials_no_plain_secret_chk check (secret_reference !~* '(bearer\s+[a-z0-9._~-]+|password|plaintext|client_secret|refresh_token|private_key|api_key)')
);
create unique index if not exists organization_scim_credentials_active_uidx on organization_scim_credentials (connection_id, credential_kind) where status in ('active','pending_rotation');

create table if not exists organization_scim_users (
  id uuid primary key default gen_random_uuid(),
  logto_organization_id varchar(128) not null,
  connection_id uuid not null,
  external_id varchar(255) not null,
  user_name varchar(255) not null,
  logto_user_id varchar(128),
  active boolean not null default true,
  display_name varchar(255),
  email varchar(255),
  raw_fingerprint varchar(128) not null,
  sync_state varchar(40) not null default 'observed',
  last_observed_at timestamptz not null default now(),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_scim_users_org_id_uidx unique (logto_organization_id, id),
  constraint organization_scim_users_connection_id_uidx unique (connection_id, id),
  constraint organization_scim_users_external_uidx unique (connection_id, external_id),
  constraint organization_scim_users_username_uidx unique (connection_id, user_name),
  constraint organization_scim_users_connection_fk foreign key (logto_organization_id, connection_id) references organization_scim_connections (logto_organization_id, id) on delete cascade,
  constraint organization_scim_users_sync_state_chk check (sync_state in ('observed','matched','provisioned','updated','deprovision_pending','deprovisioned','quarantined','error'))
);
create index if not exists organization_scim_users_logto_idx on organization_scim_users (logto_organization_id, logto_user_id);

create table if not exists organization_scim_groups (
  id uuid primary key default gen_random_uuid(),
  logto_organization_id varchar(128) not null,
  connection_id uuid not null,
  external_id varchar(255) not null,
  display_name varchar(255) not null,
  logto_group_id varchar(128),
  raw_fingerprint varchar(128) not null,
  sync_state varchar(40) not null default 'observed',
  last_observed_at timestamptz not null default now(),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_scim_groups_org_id_uidx unique (logto_organization_id, id),
  constraint organization_scim_groups_connection_id_uidx unique (connection_id, id),
  constraint organization_scim_groups_external_uidx unique (connection_id, external_id),
  constraint organization_scim_groups_display_uidx unique (connection_id, display_name),
  constraint organization_scim_groups_connection_fk foreign key (logto_organization_id, connection_id) references organization_scim_connections (logto_organization_id, id) on delete cascade,
  constraint organization_scim_groups_sync_state_chk check (sync_state in ('observed','matched','provisioned','updated','deprovision_pending','deprovisioned','quarantined','error'))
);

create table if not exists organization_scim_group_memberships (
  id uuid primary key default gen_random_uuid(),
  logto_organization_id varchar(128) not null,
  connection_id uuid not null,
  group_id uuid not null,
  user_id uuid not null,
  membership_state varchar(40) not null default 'active',
  source_operation_id uuid,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_scim_group_memberships_connection_fk foreign key (logto_organization_id, connection_id) references organization_scim_connections (logto_organization_id, id) on delete cascade,
  constraint organization_scim_group_memberships_group_fk foreign key (connection_id, group_id) references organization_scim_groups (connection_id, id) on delete cascade,
  constraint organization_scim_group_memberships_user_fk foreign key (connection_id, user_id) references organization_scim_users (connection_id, id) on delete cascade,
  constraint organization_scim_group_memberships_uidx unique (connection_id, group_id, user_id),
  constraint organization_scim_group_memberships_state_chk check (membership_state in ('active','removed','pending','quarantined'))
);
create index if not exists organization_scim_group_memberships_user_idx on organization_scim_group_memberships (connection_id, user_id, membership_state);

create table if not exists organization_scim_operation_ledger (
  id uuid primary key default gen_random_uuid(),
  logto_organization_id varchar(128) not null,
  connection_id uuid not null,
  operation_kind varchar(80) not null,
  target_type varchar(40) not null,
  target_scim_user_id uuid,
  target_scim_group_id uuid,
  request_id varchar(160) not null,
  idempotency_key varchar(220) not null,
  status varchar(40) not null default 'accepted',
  correlation_id varchar(160) not null,
  actor_json jsonb not null default '{}'::jsonb,
  request_summary jsonb not null default '{}'::jsonb,
  result_summary jsonb not null default '{}'::jsonb,
  error_json jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_scim_operation_ledger_connection_fk foreign key (logto_organization_id, connection_id) references organization_scim_connections (logto_organization_id, id) on delete cascade,
  constraint organization_scim_operation_ledger_user_fk foreign key (connection_id, target_scim_user_id) references organization_scim_users (connection_id, id) on delete restrict,
  constraint organization_scim_operation_ledger_group_fk foreign key (connection_id, target_scim_group_id) references organization_scim_groups (connection_id, id) on delete restrict,
  constraint organization_scim_operation_ledger_connection_id_uidx unique (connection_id, id),
  constraint organization_scim_operation_ledger_idem_uidx unique (connection_id, idempotency_key),
  constraint organization_scim_operation_ledger_request_uidx unique (connection_id, request_id),
  constraint organization_scim_operation_ledger_status_chk check (status in ('accepted','running','succeeded','retryable_failed','terminal_failed','cancelled','replayed')),
  constraint organization_scim_operation_ledger_target_chk check ((target_type = 'user' and target_scim_user_id is not null and target_scim_group_id is null) or (target_type = 'group' and target_scim_group_id is not null and target_scim_user_id is null) or (target_type in ('connection','reconciliation') and target_scim_user_id is null and target_scim_group_id is null)),
  constraint organization_scim_operation_ledger_redacted_chk check ((actor_json::text || request_summary::text || result_summary::text || coalesce(error_json::text,'')) !~* '(accessToken|refreshToken|bearer|authorization|password|secret|privateKey|apiKey|cookie)')
);
create index if not exists organization_scim_operation_ledger_work_idx on organization_scim_operation_ledger (connection_id, status, created_at);

create table if not exists organization_scim_source_provenance_records (
  id uuid primary key default gen_random_uuid(),
  logto_organization_id varchar(128) not null,
  connection_id uuid not null,
  source_kind varchar(60) not null,
  source_resource_type varchar(40) not null,
  source_resource_id varchar(255) not null,
  scim_user_id uuid,
  scim_group_id uuid,
  operation_id uuid,
  external_version varchar(160),
  resource_fingerprint varchar(128) not null,
  observed_at timestamptz not null default now(),
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint organization_scim_source_provenance_connection_fk foreign key (logto_organization_id, connection_id) references organization_scim_connections (logto_organization_id, id) on delete cascade,
  constraint organization_scim_source_provenance_user_fk foreign key (connection_id, scim_user_id) references organization_scim_users (connection_id, id) on delete restrict,
  constraint organization_scim_source_provenance_group_fk foreign key (connection_id, scim_group_id) references organization_scim_groups (connection_id, id) on delete restrict,
  constraint organization_scim_source_provenance_operation_fk foreign key (connection_id, operation_id) references organization_scim_operation_ledger (connection_id, id) on delete restrict,
  constraint organization_scim_source_provenance_uidx unique (connection_id, source_kind, source_resource_type, source_resource_id, resource_fingerprint),
  constraint organization_scim_source_provenance_type_chk check (source_resource_type in ('user','group','membership','connection')),
  constraint organization_scim_source_provenance_binding_chk check ((source_resource_type = 'user' and scim_user_id is not null) or (source_resource_type = 'group' and scim_group_id is not null) or source_resource_type in ('membership','connection'))
);

create table if not exists organization_scim_reconciliation_plans (
  id uuid primary key default gen_random_uuid(),
  logto_organization_id varchar(128) not null,
  connection_id uuid not null,
  plan_kind varchar(60) not null default 'scheduled_full',
  status varchar(40) not null default 'draft',
  baseline_cursor varchar(255),
  planned_counts jsonb not null default '{}'::jsonb,
  risk_summary jsonb not null default '{}'::jsonb,
  created_by_logto_user_id varchar(128) not null,
  approved_by_logto_user_id varchar(128),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_scim_reconciliation_plans_org_id_uidx unique (logto_organization_id, id),
  constraint organization_scim_reconciliation_plans_connection_id_uidx unique (connection_id, id),
  constraint organization_scim_reconciliation_plans_connection_fk foreign key (logto_organization_id, connection_id) references organization_scim_connections (logto_organization_id, id) on delete cascade,
  constraint organization_scim_reconciliation_plans_status_chk check (status in ('draft','awaiting_approval','approved','rejected','superseded','executing','completed','cancelled'))
);

create table if not exists organization_scim_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  logto_organization_id varchar(128) not null,
  connection_id uuid not null,
  plan_id uuid not null,
  status varchar(40) not null default 'queued',
  cursor_in varchar(255),
  cursor_out varchar(255),
  started_at timestamptz,
  completed_at timestamptz,
  observed_counts jsonb not null default '{}'::jsonb,
  applied_counts jsonb not null default '{}'::jsonb,
  error_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_scim_reconciliation_runs_connection_id_uidx unique (connection_id, id),
  constraint organization_scim_reconciliation_runs_connection_fk foreign key (logto_organization_id, connection_id) references organization_scim_connections (logto_organization_id, id) on delete cascade,
  constraint organization_scim_reconciliation_runs_plan_fk foreign key (connection_id, plan_id) references organization_scim_reconciliation_plans (connection_id, id) on delete cascade,
  constraint organization_scim_reconciliation_runs_status_chk check (status in ('queued','running','paused','succeeded','retryable_failed','terminal_failed','cancelled'))
);
create index if not exists organization_scim_reconciliation_runs_status_idx on organization_scim_reconciliation_runs (connection_id, status, created_at);

create table if not exists organization_scim_mass_deprovision_safeguard_settings (
  id uuid primary key default gen_random_uuid(),
  logto_organization_id varchar(128) not null,
  connection_id uuid not null,
  is_enabled boolean not null default true,
  max_user_deprovision_percent numeric(5,2) not null default 10.00,
  max_group_deprovision_percent numeric(5,2) not null default 10.00,
  max_absolute_user_deprovisions integer not null default 25,
  max_absolute_group_deprovisions integer not null default 10,
  require_manual_approval boolean not null default true,
  bypass_until timestamptz,
  bypass_reason text,
  updated_by_logto_user_id varchar(128) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_scim_mass_deprovision_settings_connection_uidx unique (connection_id),
  constraint organization_scim_mass_deprovision_settings_connection_fk foreign key (logto_organization_id, connection_id) references organization_scim_connections (logto_organization_id, id) on delete cascade,
  constraint organization_scim_mass_deprovision_settings_percent_chk check (max_user_deprovision_percent between 0 and 100 and max_group_deprovision_percent between 0 and 100),
  constraint organization_scim_mass_deprovision_settings_absolute_chk check (max_absolute_user_deprovisions >= 0 and max_absolute_group_deprovisions >= 0),
  constraint organization_scim_mass_deprovision_settings_bypass_chk check ((bypass_until is null and bypass_reason is null) or (bypass_until is not null and bypass_reason is not null))
);

create table if not exists organization_scim_deprovision_history (
  id uuid primary key default gen_random_uuid(),
  logto_organization_id varchar(128) not null,
  connection_id uuid not null,
  run_id uuid,
  operation_id uuid,
  target_type varchar(40) not null,
  scim_user_id uuid,
  scim_group_id uuid,
  logto_user_id varchar(128),
  logto_group_id varchar(128),
  decision varchar(40) not null,
  reason_code varchar(120) not null,
  safeguard_snapshot jsonb not null default '{}'::jsonb,
  actor_logto_user_id varchar(128),
  decided_at timestamptz not null default now(),
  executed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint organization_scim_deprovision_history_connection_fk foreign key (logto_organization_id, connection_id) references organization_scim_connections (logto_organization_id, id) on delete cascade,
  constraint organization_scim_deprovision_history_run_fk foreign key (connection_id, run_id) references organization_scim_reconciliation_runs (connection_id, id) on delete restrict,
  constraint organization_scim_deprovision_history_operation_fk foreign key (connection_id, operation_id) references organization_scim_operation_ledger (connection_id, id) on delete restrict,
  constraint organization_scim_deprovision_history_user_fk foreign key (connection_id, scim_user_id) references organization_scim_users (connection_id, id) on delete restrict,
  constraint organization_scim_deprovision_history_group_fk foreign key (connection_id, scim_group_id) references organization_scim_groups (connection_id, id) on delete restrict,
  constraint organization_scim_deprovision_history_target_chk check ((target_type = 'user' and scim_user_id is not null and scim_group_id is null) or (target_type = 'group' and scim_group_id is not null and scim_user_id is null)),
  constraint organization_scim_deprovision_history_decision_chk check (decision in ('blocked_by_safeguard','approved','executed','skipped','rolled_back'))
);
create index if not exists organization_scim_deprovision_history_target_idx on organization_scim_deprovision_history (connection_id, target_type, decided_at);
