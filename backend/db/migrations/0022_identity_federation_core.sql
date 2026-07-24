-- Dedicated organization identity federation schema.
-- Secrets are stored only by reference (secret_reference); plaintext client secrets are not persisted.

create table if not exists organization_identity_connections (
  id uuid primary key default gen_random_uuid(),
  logto_organization_id varchar(128) not null,
  logto_sso_connector_id varchar(128),
  protocol varchar(16) not null,
  provider_kind varchar(80) not null,
  name varchar(255) not null,
  status varchar(40) not null default 'draft',
  issuer_or_entity_id text not null,
  subject_strategy varchar(80) not null,
  group_membership_mode varchar(40) not null,
  claim_contract_version bigint not null default 1,
  mapping_version bigint not null default 1,
  provisioning_policy_version bigint not null default 1,
  guard_max_absolute_removals bigint not null default 25,
  guard_max_active_users_affected_percent numeric(5,2) not null default 10.00,
  guard_max_memberships_affected_percent numeric(5,2) not null default 10.00,
  guard_manual_approval_threshold bigint not null default 10,
  guard_reactivation_cooldown_minutes bigint not null default 60,
  configuration_fingerprint varchar(128) not null,
  secret_reference varchar(255),
  last_validated_at timestamptz,
  last_successful_login_at timestamptz,
  version bigint not null default 1,
  created_by_logto_user_id varchar(128) not null,
  updated_by_logto_user_id varchar(128) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_identity_connections_org_id_uidx unique (logto_organization_id, id),
  constraint organization_identity_connections_protocol_chk check (protocol in ('oidc','saml')),
  constraint organization_identity_connections_status_chk check (status in ('draft','validating','ready','active','degraded','suspended','rotating_credentials','decommissioning','archived')),
  constraint organization_identity_connections_subject_strategy_chk check (subject_strategy in ('issuer_subject','issuer_persistent_nameid','issuer_immutable_attribute','verified_email_initial_link')),
  constraint organization_identity_connections_group_mode_chk check (group_membership_mode in ('direct','transitive','provider_defined')),
  constraint organization_identity_connections_mass_deprovision_guard_chk check (guard_max_absolute_removals >= 0 and guard_max_active_users_affected_percent >= 0 and guard_max_active_users_affected_percent <= 100 and guard_max_memberships_affected_percent >= 0 and guard_max_memberships_affected_percent <= 100 and guard_manual_approval_threshold >= 0 and guard_reactivation_cooldown_minutes >= 0),
  constraint organization_identity_connections_no_plain_secret_chk check (secret_reference is null or secret_reference !~* '(client_secret|password|plaintext|bearer\s+[a-z0-9._~-]+)')
);

create index if not exists organization_identity_connections_org_status_idx on organization_identity_connections (logto_organization_id, status);
create index if not exists organization_identity_connections_connector_idx on organization_identity_connections (logto_sso_connector_id);

create table if not exists organization_external_role_mappings (
  id uuid primary key default gen_random_uuid(),
  logto_organization_id varchar(128) not null,
  connection_id uuid not null,
  external_group_id varchar(255) not null,
  logto_role_id varchar(128) not null,
  canonical_role_key varchar(160) not null,
  mode varchar(40) not null default 'additive',
  approval_policy varchar(80) not null default 'tenant_admin_approved',
  status varchar(40) not null default 'draft',
  version bigint not null default 1,
  created_by_logto_user_id varchar(128) not null,
  updated_by_logto_user_id varchar(128) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_external_role_mappings_connection_fk foreign key (logto_organization_id, connection_id) references organization_identity_connections (logto_organization_id, id) on delete cascade,
  constraint organization_external_role_mappings_group_role_uidx unique (connection_id, external_group_id, logto_role_id),
  constraint organization_external_role_mappings_mode_chk check (mode in ('additive','authoritative','preview')),
  constraint organization_external_role_mappings_approval_policy_chk check (approval_policy in ('tenant_admin_approved','owner_approved','auto_within_ceiling','manual_review')),
  constraint organization_external_role_mappings_status_chk check (status in ('draft','active','suspended','archived')),
  constraint organization_external_role_mappings_no_owner_global_chk check (canonical_role_key <> 'owner_global'),
  constraint organization_external_role_mappings_org_role_chk check (canonical_role_key like 'organization\_%' escape '\')
);

create index if not exists organization_external_role_mappings_org_status_idx on organization_external_role_mappings (logto_organization_id, status);
create index if not exists organization_external_role_mappings_connection_idx on organization_external_role_mappings (connection_id);
create index if not exists organization_external_role_mappings_role_idx on organization_external_role_mappings (logto_organization_id, canonical_role_key);

create table if not exists organization_federated_assignment_sources (
  id uuid primary key default gen_random_uuid(),
  logto_organization_id varchar(128) not null,
  logto_user_id varchar(128) not null,
  assignment_kind varchar(40) not null,
  assignment_key varchar(255) not null,
  source_kind varchar(80) not null,
  source_connection_id uuid,
  source_external_group_id varchar(255),
  mapping_id uuid,
  mapping_version bigint not null,
  state varchar(40) not null default 'active',
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_federated_assignment_sources_connection_fk foreign key (logto_organization_id, source_connection_id) references organization_identity_connections (logto_organization_id, id) on delete cascade,
  constraint organization_federated_assignment_sources_mapping_fk foreign key (mapping_id) references organization_external_role_mappings (id) on delete set null,
  constraint organization_federated_assignment_sources_assignment_kind_chk check (assignment_kind in ('organization_role','data_scope_assignment','organization_membership')),
  constraint organization_federated_assignment_sources_source_kind_chk check (source_kind in ('manual','federated_jit','federated_login_reconciliation','directory_sync_scim','provider_api_sync','bootstrap_profile','support_override')),
  constraint organization_federated_assignment_sources_state_chk check (state in ('active','pending','revoked','blocked','expired')),
  constraint organization_federated_assignment_sources_validity_chk check (valid_until is null or valid_until > valid_from),
  constraint organization_federated_assignment_sources_federated_source_chk check ((source_kind in ('federated_jit','federated_login_reconciliation','directory_sync_scim','provider_api_sync') and source_connection_id is not null) or source_kind in ('manual','bootstrap_profile','support_override'))
);

create unique index if not exists organization_federated_assignment_sources_active_uidx
  on organization_federated_assignment_sources (logto_organization_id, logto_user_id, assignment_kind, assignment_key, source_kind, coalesce(source_connection_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(source_external_group_id, ''), coalesce(mapping_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where state in ('active','pending');
create index if not exists organization_federated_assignment_sources_user_idx on organization_federated_assignment_sources (logto_organization_id, logto_user_id, state);
create index if not exists organization_federated_assignment_sources_mapping_idx on organization_federated_assignment_sources (mapping_id, mapping_version);
