-- Issue #318 Turn 3 durable organization-mapping persistence.
-- Depends on Turn 1/2 contracts; does not touch authorization_scope_assignments.
CREATE TABLE IF NOT EXISTS organization_mapping_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','archived')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  model_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS organization_mapping_drafts_org_id_version_uidx ON organization_mapping_drafts(organization_id,id,version);

CREATE TABLE IF NOT EXISTS organization_mapping_policy_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL,
  draft_id UUID NOT NULL REFERENCES organization_mapping_drafts(id),
  policy_json JSONB NOT NULL,
  policy_hash TEXT NOT NULL,
  immutable BOOLEAN NOT NULL DEFAULT TRUE CHECK (immutable),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, policy_hash)
);

CREATE TABLE IF NOT EXISTS organization_mapping_source_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL,
  source_connection_id TEXT,
  facts_json JSONB NOT NULL,
  evidence_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (facts_json ? 'tenantId')
);

CREATE TABLE IF NOT EXISTS organization_mapping_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL,
  draft_id UUID REFERENCES organization_mapping_drafts(id),
  policy_version_id UUID REFERENCES organization_mapping_policy_versions(id),
  source_snapshot_id UUID REFERENCES organization_mapping_source_snapshots(id),
  outcome TEXT NOT NULL CHECK (outcome IN ('matched','not_matched','ambiguous','incompatible')),
  reason_code TEXT NOT NULL,
  trace_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization_mapping_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL,
  evaluation_id UUID NOT NULL REFERENCES organization_mapping_evaluations(id),
  decision TEXT NOT NULL CHECK (decision IN ('approved','rejected')),
  reason TEXT NOT NULL,
  actor_logto_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id,evaluation_id,decision)
);

CREATE TABLE IF NOT EXISTS organization_dimension_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL,
  dimension_id TEXT NOT NULL,
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id,dimension_id)
);

CREATE TABLE IF NOT EXISTS organization_mapping_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL,
  actor_logto_user_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  result TEXT NOT NULL,
  reason TEXT NOT NULL,
  event_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Events use the shared integration_outbox_events foundation.

CREATE TABLE IF NOT EXISTS organization_mapping_idempotency_keys (
  organization_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  response_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(organization_id,idempotency_key)
);

-- Explicit safety: no DDL/DML for authorization_scope_assignments in this migration.
