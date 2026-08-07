-- CIVITAS — Persistencia del branding organizacional URL-first
-- Código: BRAND-30
-- PostgreSQL 18+
-- Los IDs son text para no imponer UUID/ULID antes de la convención global.

BEGIN;

CREATE TYPE brand_origin_request_status AS ENUM (
  'submitted', 'approved', 'rejected', 'cancelled', 'expired'
);

CREATE TYPE brand_origin_status AS ENUM (
  'pending', 'verified', 'stale', 'suspended', 'failed', 'revoked', 'exception_approved'
);

CREATE TYPE brand_origin_verification_method AS ENUM (
  'dns_txt', 'well_known_http', 'manual_exception'
);

CREATE TYPE brand_asset_kind AS ENUM (
  'login_logo', 'workspace_logo', 'favicon', 'login_cover'
);

CREATE TYPE brand_asset_reference_status AS ENUM (
  'ready', 'stale', 'unreachable', 'content_changed', 'blocked', 'archived'
);

CREATE TYPE brand_draft_status AS ENUM (
  'draft', 'validating', 'validated', 'blocked'
);

CREATE TYPE brand_publication_status AS ENUM (
  'active', 'superseded'
);

CREATE TYPE brand_publication_creation_reason AS ENUM (
  'initial', 'update', 'rollback'
);

CREATE TYPE brand_runtime_health AS ENUM (
  'healthy', 'degraded', 'unavailable'
);

CREATE TYPE brand_validation_run_status AS ENUM (
  'queued', 'running', 'passed', 'failed', 'expired', 'consumed'
);

CREATE TYPE brand_initial_publication_request_status AS ENUM (
  'submitted', 'approved', 'rejected', 'cancelled', 'expired'
);

CREATE TABLE organization_brand_origin_requests (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  requested_origin text NOT NULL,
  verification_method brand_origin_verification_method NOT NULL
    CHECK (verification_method <> 'manual_exception'),
  allowed_purposes brand_asset_kind[] NOT NULL,
  status brand_origin_request_status NOT NULL DEFAULT 'submitted',
  request_reason text NOT NULL,
  decision_reason text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  decided_at timestamptz,
  decided_by text,

  UNIQUE (organization_id, id),
  CHECK (requested_origin ~ '^https://'),
  CHECK (cardinality(allowed_purposes) > 0)
);

CREATE UNIQUE INDEX uq_brand_origin_request_open
  ON organization_brand_origin_requests (organization_id, requested_origin)
  WHERE status = 'submitted';

CREATE TABLE organization_brand_asset_origins (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  origin_request_id text,
  normalized_origin text NOT NULL,
  status brand_origin_status NOT NULL DEFAULT 'pending',
  verification_method brand_origin_verification_method NOT NULL,
  allowed_purposes brand_asset_kind[] NOT NULL,
  verification_challenge text,
  last_ownership_verified_at timestamptz,
  next_ownership_verification_at timestamptz,
  dns_fingerprint text,
  cname_chain jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL,

  UNIQUE (organization_id, id),
  UNIQUE (organization_id, normalized_origin),
  CHECK (normalized_origin ~ '^https://'),
  CHECK (cardinality(allowed_purposes) > 0),

  FOREIGN KEY (organization_id, origin_request_id)
    REFERENCES organization_brand_origin_requests (organization_id, id)
);

CREATE TABLE organization_brand_asset_origin_verifications (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  origin_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued', 'running', 'passed', 'failed', 'expired')),
  challenge text,
  dns_fingerprint text,
  cname_chain jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  failure_code text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,

  UNIQUE (organization_id, id),

  FOREIGN KEY (organization_id, origin_id)
    REFERENCES organization_brand_asset_origins (organization_id, id)
);

CREATE TABLE organization_brand_asset_validation_runs (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  requested_by text NOT NULL,
  approved_origin_id text NOT NULL,
  kind brand_asset_kind NOT NULL,
  normalized_url text NOT NULL,
  status brand_validation_run_status NOT NULL DEFAULT 'queued',
  validated_sha256 char(64),
  validated_bytes bigint,
  observed_content_type text,
  observed_width integer,
  observed_height integer,
  etag text,
  last_modified text,
  browser_probe jsonb,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  failure_code text,
  technical_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,

  UNIQUE (organization_id, id),

  FOREIGN KEY (organization_id, approved_origin_id)
    REFERENCES organization_brand_asset_origins (organization_id, id),

  CHECK (validated_sha256 IS NULL OR validated_sha256 ~ '^[a-f0-9]{64}$'),
  CHECK (validated_bytes IS NULL OR validated_bytes >= 0),
  CHECK (observed_width IS NULL OR observed_width > 0),
  CHECK (observed_height IS NULL OR observed_height > 0),
  CHECK ((status = 'consumed' AND consumed_at IS NOT NULL) OR status <> 'consumed')
);

CREATE TABLE organization_brand_asset_references (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  approved_origin_id text NOT NULL,
  validation_run_id text NOT NULL,
  kind brand_asset_kind NOT NULL,
  source_type text NOT NULL DEFAULT 'external_url' CHECK (source_type = 'external_url'),
  original_url text NOT NULL,
  normalized_url text NOT NULL,
  status brand_asset_reference_status NOT NULL DEFAULT 'ready',
  observed_content_type text NOT NULL
    CHECK (observed_content_type IN ('image/png', 'image/jpeg', 'image/webp')),
  validated_sha256 char(64) NOT NULL CHECK (validated_sha256 ~ '^[a-f0-9]{64}$'),
  validated_bytes bigint NOT NULL CHECK (validated_bytes >= 0),
  observed_width integer NOT NULL CHECK (observed_width > 0),
  observed_height integer NOT NULL CHECK (observed_height > 0),
  etag text,
  last_modified text,
  last_validated_at timestamptz NOT NULL,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL,
  archived_at timestamptz,

  UNIQUE (organization_id, id),
  UNIQUE (organization_id, approved_origin_id, kind, normalized_url),
  UNIQUE (organization_id, validation_run_id),

  FOREIGN KEY (organization_id, approved_origin_id)
    REFERENCES organization_brand_asset_origins (organization_id, id),
  FOREIGN KEY (organization_id, validation_run_id)
    REFERENCES organization_brand_asset_validation_runs (organization_id, id)
);

CREATE TABLE organization_brand_drafts (
  organization_id text PRIMARY KEY,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 160),
  short_name text NOT NULL CHECK (char_length(short_name) BETWEEN 1 AND 48),
  login_logo_asset_ref_id text,
  workspace_logo_asset_ref_id text,
  favicon_asset_ref_id text,
  login_cover_asset_ref_id text,
  primary_color char(7) NOT NULL CHECK (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  secondary_color char(7) NOT NULL CHECK (secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  accent_color char(7) NOT NULL CHECK (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  support_email text,
  custom_legal_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  status brand_draft_status NOT NULL DEFAULT 'draft',
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  etag text NOT NULL,
  based_on_publication_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL,

  FOREIGN KEY (organization_id, login_logo_asset_ref_id)
    REFERENCES organization_brand_asset_references (organization_id, id)
    DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (organization_id, workspace_logo_asset_ref_id)
    REFERENCES organization_brand_asset_references (organization_id, id)
    DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (organization_id, favicon_asset_ref_id)
    REFERENCES organization_brand_asset_references (organization_id, id)
    DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (organization_id, login_cover_asset_ref_id)
    REFERENCES organization_brand_asset_references (organization_id, id)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE organization_brand_draft_versions (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  draft_version integer NOT NULL CHECK (draft_version > 0),
  status brand_draft_status NOT NULL,
  profile_snapshot jsonb NOT NULL,
  asset_reference_ids text[] NOT NULL DEFAULT '{}',
  validation_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,

  UNIQUE (organization_id, id),
  UNIQUE (organization_id, draft_version)
);

CREATE TABLE organization_brand_publications (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  draft_version_id text NOT NULL,
  status brand_publication_status NOT NULL,
  creation_reason brand_publication_creation_reason NOT NULL,
  profile_snapshot jsonb NOT NULL,
  asset_reference_snapshots jsonb NOT NULL,
  csp_policy_version integer NOT NULL CHECK (csp_policy_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  superseded_at timestamptz,

  UNIQUE (organization_id, id),

  FOREIGN KEY (organization_id, draft_version_id)
    REFERENCES organization_brand_draft_versions (organization_id, id)
);

ALTER TABLE organization_brand_drafts
  ADD CONSTRAINT fk_brand_draft_base_publication
  FOREIGN KEY (organization_id, based_on_publication_id)
  REFERENCES organization_brand_publications (organization_id, id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE UNIQUE INDEX uq_brand_publication_single_active
  ON organization_brand_publications (organization_id)
  WHERE status = 'active';

CREATE TABLE organization_brand_initial_publication_requests (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  draft_version_id text NOT NULL,
  status brand_initial_publication_request_status NOT NULL DEFAULT 'submitted',
  request_reason text NOT NULL,
  decision_reason text,
  publication_id text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  decided_at timestamptz,
  decided_by text,

  UNIQUE (organization_id, id),

  FOREIGN KEY (organization_id, draft_version_id)
    REFERENCES organization_brand_draft_versions (organization_id, id),
  FOREIGN KEY (organization_id, publication_id)
    REFERENCES organization_brand_publications (organization_id, id)
);

CREATE UNIQUE INDEX uq_brand_initial_publication_request_open
  ON organization_brand_initial_publication_requests (organization_id)
  WHERE status = 'submitted';

CREATE TABLE organization_brand_runtime_health (
  organization_id text PRIMARY KEY,
  publication_id text,
  health brand_runtime_health NOT NULL DEFAULT 'healthy',
  issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  evaluated_at timestamptz NOT NULL DEFAULT now(),

  FOREIGN KEY (organization_id, publication_id)
    REFERENCES organization_brand_publications (organization_id, id)
);

CREATE TABLE organization_brand_runtime_failures (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  publication_id text,
  asset_reference_id text,
  surface text NOT NULL CHECK (surface IN ('login', 'topbar', 'favicon', 'preview')),
  failure_code text NOT NULL,
  redacted_origin text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  request_id text,
  user_agent_family text,

  UNIQUE (organization_id, id),

  FOREIGN KEY (organization_id, publication_id)
    REFERENCES organization_brand_publications (organization_id, id),
  FOREIGN KEY (organization_id, asset_reference_id)
    REFERENCES organization_brand_asset_references (organization_id, id)
);

CREATE TABLE organization_brand_rollback_runs (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  target_publication_id text NOT NULL,
  created_publication_id text,
  status text NOT NULL CHECK (status IN ('queued', 'validating', 'blocked', 'completed', 'failed')),
  reason text NOT NULL,
  failure_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  completed_at timestamptz,

  UNIQUE (organization_id, id),

  FOREIGN KEY (organization_id, target_publication_id)
    REFERENCES organization_brand_publications (organization_id, id),
  FOREIGN KEY (organization_id, created_publication_id)
    REFERENCES organization_brand_publications (organization_id, id)
);

CREATE TABLE organization_brand_idempotency_keys (
  organization_id text NOT NULL,
  operation text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  response_status integer,
  response_body jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (organization_id, operation, idempotency_key)
);

CREATE OR REPLACE FUNCTION prevent_brand_publication_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(
    NEW.id, NEW.organization_id, NEW.draft_version_id, NEW.creation_reason,
    NEW.profile_snapshot, NEW.asset_reference_snapshots, NEW.csp_policy_version,
    NEW.created_at, NEW.created_by
  ) IS DISTINCT FROM ROW(
    OLD.id, OLD.organization_id, OLD.draft_version_id, OLD.creation_reason,
    OLD.profile_snapshot, OLD.asset_reference_snapshots, OLD.csp_policy_version,
    OLD.created_at, OLD.created_by
  ) THEN
    RAISE EXCEPTION 'organization_brand_publications is immutable';
  END IF;

  IF NOT (
    NEW.status = OLD.status
    OR (OLD.status = 'active' AND NEW.status = 'superseded')
  ) THEN
    RAISE EXCEPTION 'invalid brand publication status transition';
  END IF;

  IF NEW.status = 'superseded' AND NEW.superseded_at IS NULL THEN
    RAISE EXCEPTION 'superseded_at is required';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_brand_publication_immutable
BEFORE UPDATE ON organization_brand_publications
FOR EACH ROW EXECUTE FUNCTION prevent_brand_publication_mutation();

CREATE INDEX ix_brand_origin_requests_status
  ON organization_brand_origin_requests (organization_id, status, created_at DESC);
CREATE INDEX ix_brand_origins_reverify
  ON organization_brand_asset_origins (next_ownership_verification_at)
  WHERE status IN ('verified', 'stale', 'exception_approved');
CREATE INDEX ix_brand_refs_revalidate
  ON organization_brand_asset_references (last_validated_at)
  WHERE status IN ('ready', 'stale', 'unreachable', 'content_changed');
CREATE INDEX ix_brand_validation_runs_expire
  ON organization_brand_asset_validation_runs (expires_at)
  WHERE status IN ('queued', 'running', 'passed');
CREATE INDEX ix_brand_runtime_failures_org_time
  ON organization_brand_runtime_failures (organization_id, occurred_at DESC);

COMMIT;

-- Consumo atómico obligatorio del validation run:
--
-- UPDATE organization_brand_asset_validation_runs
-- SET status = 'consumed', consumed_at = now()
-- WHERE id = $1
--   AND organization_id = $2
--   AND requested_by = $3
--   AND status = 'passed'
--   AND consumed_at IS NULL
--   AND expires_at > now()
-- RETURNING *;
--
-- La referencia y este UPDATE se ejecutan en la misma transacción.
