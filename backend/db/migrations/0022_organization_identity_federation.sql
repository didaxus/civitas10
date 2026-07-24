-- Organization Identity Federation initial persistence contract.
-- Claims are authenticated signals only; authorization remains in the existing Governance/RBAC/Data Scope engines.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS organization_identity_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  logto_organization_id varchar NOT NULL,
  logto_sso_connector_id varchar NULL,
  protocol varchar NOT NULL CHECK (protocol IN ('oidc','saml')),
  provider_kind varchar NOT NULL,
  name varchar NOT NULL,
  status varchar NOT NULL CHECK (status IN ('draft','validating','ready','active','degraded','suspended','rotating_credentials','decommissioning','archived')),
  issuer_or_entity_id varchar NOT NULL,
  subject_strategy varchar NOT NULL,
  group_membership_mode varchar NOT NULL,
  claim_contract_version bigint NOT NULL,
  mapping_version bigint NOT NULL,
  provisioning_policy_version bigint NOT NULL,
  configuration_fingerprint varchar NOT NULL,
  secret_reference varchar NULL,
  last_validated_at timestamptz NULL,
  last_successful_login_at timestamptz NULL,
  created_by_logto_user_id varchar NOT NULL,
  updated_by_logto_user_id varchar NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (logto_organization_id, id)
);
CREATE INDEX IF NOT EXISTS idx_org_identity_connections_org_status ON organization_identity_connections (logto_organization_id, status);

CREATE TABLE IF NOT EXISTS organization_identity_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES organization_identity_connections(id) ON DELETE CASCADE,
  authority_domain varchar NOT NULL,
  routing_priority integer NOT NULL,
  domain_verified boolean NOT NULL DEFAULT false,
  verification_method varchar NULL,
  verified_at timestamptz NULL,
  status varchar NOT NULL,
  UNIQUE (connection_id, authority_domain)
);

CREATE TABLE IF NOT EXISTS organization_identity_claim_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  logto_organization_id varchar NOT NULL,
  connection_id uuid NOT NULL REFERENCES organization_identity_connections(id) ON DELETE CASCADE,
  normalized_field varchar NOT NULL,
  external_claim_name varchar NOT NULL,
  value_type varchar NOT NULL,
  required boolean NOT NULL,
  transform_key varchar NULL,
  version bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, normalized_field, version)
);

CREATE TABLE IF NOT EXISTS organization_external_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  logto_organization_id varchar NOT NULL,
  connection_id uuid NOT NULL REFERENCES organization_identity_connections(id) ON DELETE CASCADE,
  external_group_id varchar NOT NULL,
  external_display_name varchar NULL,
  external_parent_id varchar NULL,
  membership_mode varchar NOT NULL,
  status varchar NOT NULL,
  last_observed_at timestamptz NOT NULL,
  source_version varchar NULL,
  UNIQUE (connection_id, external_group_id)
);

CREATE TABLE IF NOT EXISTS organization_external_role_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  logto_organization_id varchar NOT NULL,
  connection_id uuid NOT NULL REFERENCES organization_identity_connections(id) ON DELETE CASCADE,
  external_group_id varchar NOT NULL,
  logto_role_id varchar NOT NULL,
  canonical_role_key varchar NOT NULL CHECK (canonical_role_key <> 'owner_global'),
  mode varchar NOT NULL,
  approval_policy varchar NOT NULL,
  status varchar NOT NULL,
  version bigint NOT NULL,
  created_by_logto_user_id varchar NOT NULL,
  updated_by_logto_user_id varchar NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, external_group_id, logto_role_id)
);

CREATE TABLE IF NOT EXISTS organization_external_scope_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  logto_organization_id varchar NOT NULL,
  connection_id uuid NOT NULL REFERENCES organization_identity_connections(id) ON DELETE CASCADE,
  external_group_id varchar NOT NULL,
  scope_template_id varchar NOT NULL,
  scope_template_version varchar NOT NULL,
  target_kind varchar NOT NULL,
  dimension_value_id uuid NULL,
  unit_id uuid NULL,
  resource_ref varchar NULL,
  status varchar NOT NULL,
  version bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(dimension_value_id, unit_id, resource_ref) = 1)
);

CREATE TABLE IF NOT EXISTS organization_provisioning_policies (
  logto_organization_id varchar PRIMARY KEY,
  connection_id uuid NOT NULL REFERENCES organization_identity_connections(id) ON DELETE CASCADE,
  join_mode varchar NOT NULL,
  fallback_mode varchar NOT NULL,
  role_sync_mode varchar NOT NULL,
  scope_sync_mode varchar NOT NULL,
  remove_absent_managed_assignments boolean NOT NULL,
  suspend_disabled_users boolean NOT NULL,
  privileged_role_mode varchar NOT NULL,
  login_reconciliation_enabled boolean NOT NULL,
  scheduled_reconciliation_enabled boolean NOT NULL,
  reconciliation_interval_minutes integer NULL,
  grace_period_minutes integer NOT NULL,
  version bigint NOT NULL,
  updated_by_logto_user_id varchar NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization_external_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  logto_organization_id varchar NOT NULL,
  connection_id uuid NOT NULL REFERENCES organization_identity_connections(id) ON DELETE CASCADE,
  external_issuer varchar NOT NULL,
  external_subject varchar NOT NULL,
  logto_user_id varchar NULL,
  link_status varchar NOT NULL,
  email_cache varchar NULL,
  last_authenticated_at timestamptz NULL,
  last_reconciled_at timestamptz NULL,
  UNIQUE (connection_id, external_subject)
);

CREATE TABLE IF NOT EXISTS organization_federated_assignment_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  logto_organization_id varchar NOT NULL,
  logto_user_id varchar NOT NULL,
  assignment_kind varchar NOT NULL,
  assignment_key varchar NOT NULL,
  source_kind varchar NOT NULL,
  source_connection_id uuid NULL REFERENCES organization_identity_connections(id) ON DELETE SET NULL,
  source_external_group_id varchar NULL,
  mapping_id uuid NULL,
  mapping_version bigint NOT NULL,
  state varchar NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_until timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_org_federated_assignment_sources_subject ON organization_federated_assignment_sources (logto_organization_id, logto_user_id, assignment_kind, state);

CREATE TABLE IF NOT EXISTS organization_identity_reconciliation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  logto_organization_id varchar NOT NULL,
  connection_id uuid NOT NULL REFERENCES organization_identity_connections(id) ON DELETE CASCADE,
  mode varchar NOT NULL,
  trigger_source varchar NOT NULL,
  status varchar NOT NULL,
  started_at timestamptz NOT NULL,
  completed_at timestamptz NULL,
  mapping_version bigint NOT NULL,
  policy_version bigint NOT NULL,
  total_subjects integer NOT NULL DEFAULT 0,
  created_count integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  removed_count integer NOT NULL DEFAULT 0,
  blocked_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  correlation_id varchar NOT NULL
);

CREATE TABLE IF NOT EXISTS organization_identity_reconciliation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES organization_identity_reconciliation_runs(id) ON DELETE CASCADE,
  external_subject_hash varchar NOT NULL,
  logto_user_id varchar NULL,
  decision varchar NOT NULL,
  reason_code varchar NOT NULL,
  before_summary jsonb NULL,
  after_summary jsonb NULL,
  redaction_class varchar NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
