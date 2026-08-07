-- CIVITAS — Persistencia de Tenant Resolution
-- Código: TR-30
-- PostgreSQL 16+
-- Objetivo: registry autoritativo, lifecycle de hostnames, contexto,
-- sesiones BFF, transacciones OIDC, auditoría e idempotencia.

BEGIN;


DO $$
BEGIN
  IF to_regclass('public.operational_tenants') IS NULL THEN
    RAISE EXCEPTION 'Tenant Resolution requires the canonical operational_tenants table';
  END IF;
  IF to_regclass('public.integration_outbox_events') IS NULL THEN
    RAISE EXCEPTION 'Tenant Resolution requires integration_outbox_events';
  END IF;
  IF to_regclass('public.audit_logs') IS NULL THEN
    RAISE EXCEPTION 'Tenant Resolution requires audit_logs';
  END IF;
  IF to_regclass('public.idempotency_records') IS NULL THEN
    RAISE EXCEPTION 'Tenant Resolution requires idempotency_records';
  END IF;
END;
$$;


CREATE TYPE tenant_hostname_status AS ENUM (
  'reserved',
  'active',
  'redirecting',
  'retired',
  'blocked'
);

CREATE TYPE tenant_organization_status AS ENUM (
  'provisioning',
  'active',
  'restricted_active',
  'suspended',
  'deactivated'
);

CREATE TYPE tenant_hostname_change_status AS ENUM (
  'draft',
  'validating',
  'approved',
  'executing',
  'redirecting',
  'completed',
  'blocked',
  'failed',
  'cancelled'
);

CREATE TYPE tenant_session_status AS ENUM (
  'created',
  'active',
  'stale_context',
  'revoked',
  'expired'
);

CREATE TYPE tenant_auth_transaction_status AS ENUM (
  'created',
  'redirected',
  'callback_received',
  'validated',
  'handoff_issued',
  'consumed',
  'expired',
  'failed'
);

CREATE TABLE platform_hostnames (
  hostname text PRIMARY KEY,
  service_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (hostname = lower(hostname)),
  CHECK (hostname ~ '^[a-z0-9.-]+\.didaxus\.com$'),
  CHECK (hostname NOT LIKE '%.portal.didaxus.com')
);

INSERT INTO platform_hostnames (hostname, service_key)
VALUES
  ('civitas.didaxus.com', 'civitas_core_manager'),
  ('auth.didaxus.com', 'logto'),
  ('auth-callback.didaxus.com', 'oidc_callback'),
  ('courses.didaxus.com', 'moodle'),
  ('matomo.didaxus.com', 'matomo'),
  ('webmail.didaxus.com', 'webmail'),
  ('assets.didaxus.com', 'didaxus_assets');

CREATE TABLE reserved_tenant_slugs (
  slug text PRIMARY KEY,
  reason text NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,

  CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,61})[a-z0-9]$')
);

INSERT INTO reserved_tenant_slugs (slug, reason, is_system, created_by)
VALUES
  ('www', 'System reservation', true, 'system'),
  ('api', 'System reservation', true, 'system'),
  ('admin', 'System reservation', true, 'system'),
  ('owner', 'System reservation', true, 'system'),
  ('support', 'System reservation', true, 'system'),
  ('status', 'System reservation', true, 'system'),
  ('login', 'System reservation', true, 'system'),
  ('logout', 'System reservation', true, 'system'),
  ('auth', 'System reservation', true, 'system'),
  ('callback', 'System reservation', true, 'system'),
  ('assets', 'System reservation', true, 'system'),
  ('cdn', 'System reservation', true, 'system'),
  ('mail', 'System reservation', true, 'system'),
  ('security', 'System reservation', true, 'system'),
  ('privacy', 'System reservation', true, 'system'),
  ('legal', 'System reservation', true, 'system'),
  ('portal', 'System reservation', true, 'system');

CREATE TABLE organization_tenant_states (
  organization_id uuid PRIMARY KEY,
  status tenant_organization_status NOT NULL DEFAULT 'provisioning',
  access_mode text NOT NULL DEFAULT 'restricted'
    CHECK (access_mode IN ('full', 'restricted')),
  context_version bigint NOT NULL DEFAULT 1
    CHECK (context_version > 0),
  session_binding_version bigint NOT NULL DEFAULT 1
    CHECK (session_binding_version > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL,

  FOREIGN KEY (organization_id)
    REFERENCES operational_tenants (id),

  CHECK (
    (status = 'active' AND access_mode = 'full')
    OR
    (status = 'restricted_active' AND access_mode = 'restricted')
    OR
    (
      status IN ('provisioning', 'suspended', 'deactivated')
      AND access_mode = 'restricted'
    )
  )
);

CREATE TABLE organization_hostnames (
  id text PRIMARY KEY,
  organization_id uuid NOT NULL,
  tenant_slug text NOT NULL,
  hostname text NOT NULL,
  status tenant_hostname_status NOT NULL DEFAULT 'reserved',
  is_primary boolean NOT NULL DEFAULT false,

  redirect_target_hostname_id text,
  redirect_started_at timestamptz,
  redirect_expires_at timestamptz,
  retired_at timestamptz,
  blocked_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL,

  UNIQUE (organization_id, id),
  UNIQUE (tenant_slug),
  UNIQUE (hostname),

  FOREIGN KEY (organization_id)
    REFERENCES organization_tenant_states (organization_id),

  CHECK (
    tenant_slug ~ '^[a-z0-9](?:[a-z0-9-]{1,61})[a-z0-9]$'
  ),

  CHECK (
    hostname = tenant_slug || '.portal.didaxus.com'
  ),

  CHECK (
    (status = 'active' AND is_primary)
    OR (status <> 'active' AND NOT is_primary)
  ),

  CHECK (
    (status = 'redirecting'
      AND redirect_target_hostname_id IS NOT NULL
      AND redirect_started_at IS NOT NULL
      AND redirect_expires_at IS NOT NULL)
    OR
    (status <> 'redirecting'
      AND redirect_target_hostname_id IS NULL
      AND redirect_started_at IS NULL
      AND redirect_expires_at IS NULL)
  ),

  CHECK (
    (status = 'retired' AND retired_at IS NOT NULL)
    OR status <> 'retired'
  ),

  CHECK (
    (status = 'blocked' AND blocked_at IS NOT NULL)
    OR status <> 'blocked'
  )
);

ALTER TABLE organization_hostnames
  ADD CONSTRAINT fk_organization_hostname_redirect_target
  FOREIGN KEY (organization_id, redirect_target_hostname_id)
  REFERENCES organization_hostnames (organization_id, id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE UNIQUE INDEX uq_one_active_primary_hostname_per_org
  ON organization_hostnames (organization_id)
  WHERE status = 'active' AND is_primary;

CREATE INDEX ix_organization_hostnames_resolution
  ON organization_hostnames (hostname, status);

CREATE INDEX ix_organization_hostnames_redirect_expiry
  ON organization_hostnames (redirect_expires_at)
  WHERE status = 'redirecting';

CREATE TABLE tenant_hostname_change_runs (
  id text PRIMARY KEY,
  organization_id uuid NOT NULL,
  old_hostname_id text NOT NULL,
  new_hostname_id text,
  new_tenant_slug text NOT NULL,
  status tenant_hostname_change_status NOT NULL DEFAULT 'draft',
  validation_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text NOT NULL,
  redirect_expires_at timestamptz,
  failure_code text,

  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  approved_at timestamptz,
  approved_by text,
  executed_at timestamptz,
  completed_at timestamptz,

  UNIQUE (organization_id, id),

  FOREIGN KEY (organization_id, old_hostname_id)
    REFERENCES organization_hostnames (organization_id, id),

  FOREIGN KEY (organization_id, new_hostname_id)
    REFERENCES organization_hostnames (organization_id, id),

  CHECK (
    new_tenant_slug ~ '^[a-z0-9](?:[a-z0-9-]{1,61})[a-z0-9]$'
  )
);

CREATE UNIQUE INDEX uq_open_hostname_change_run_per_org
  ON tenant_hostname_change_runs (organization_id)
  WHERE status IN (
    'draft',
    'validating',
    'approved',
    'executing',
    'redirecting'
  );

CREATE TABLE tenant_sessions (
  id text PRIMARY KEY,
  organization_id uuid NOT NULL,
  hostname_id text NOT NULL,
  context_version bigint NOT NULL,
  session_binding_version bigint NOT NULL,
  status tenant_session_status NOT NULL DEFAULT 'created',
  subject_id text NOT NULL,
  membership_id text NOT NULL,
  session_hash text NOT NULL UNIQUE,

  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoke_reason text,
  last_seen_at timestamptz,

  UNIQUE (organization_id, id),

  FOREIGN KEY (organization_id, hostname_id)
    REFERENCES organization_hostnames (organization_id, id),

  CHECK (context_version > 0),
  CHECK (session_binding_version > 0),
  CHECK (
    (status = 'revoked' AND revoked_at IS NOT NULL)
    OR status <> 'revoked'
  )
);

CREATE INDEX ix_tenant_sessions_binding
  ON tenant_sessions (
    organization_id,
    hostname_id,
    session_binding_version,
    status
  );

CREATE INDEX ix_tenant_sessions_expiry
  ON tenant_sessions (expires_at)
  WHERE status IN ('created', 'active', 'stale_context');

CREATE TABLE tenant_auth_transactions (
  id text PRIMARY KEY,
  organization_id uuid NOT NULL,
  hostname_id text NOT NULL,
  tenant_hostname text NOT NULL,
  context_version bigint NOT NULL,
  state_hash text NOT NULL UNIQUE,
  nonce_hash text NOT NULL,
  pkce_verifier_ciphertext text NOT NULL,
  return_path text NOT NULL DEFAULT '/',
  status tenant_auth_transaction_status NOT NULL DEFAULT 'created',

  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  callback_received_at timestamptz,
  consumed_at timestamptz,
  failure_code text,

  UNIQUE (organization_id, id),

  FOREIGN KEY (organization_id, hostname_id)
    REFERENCES organization_hostnames (organization_id, id),

  CHECK (tenant_hostname ~ '^[a-z0-9](?:[a-z0-9-]{1,61})[a-z0-9]\.portal\.didaxus\.com$'),
  CHECK (return_path ~ '^/(?!/)')
);

CREATE INDEX ix_tenant_auth_transactions_expiry
  ON tenant_auth_transactions (expires_at)
  WHERE status NOT IN ('consumed', 'expired', 'failed');

CREATE TABLE tenant_auth_handoff_tickets (
  id text PRIMARY KEY,
  transaction_id text NOT NULL,
  organization_id uuid NOT NULL,
  hostname_id text NOT NULL,
  handoff_hash text NOT NULL UNIQUE,
  target_hostname text NOT NULL,
  subject_id text NOT NULL,
  membership_id text NOT NULL,
  context_version bigint NOT NULL CHECK (context_version > 0),
  session_binding_version bigint NOT NULL
    CHECK (session_binding_version > 0),
  status text NOT NULL DEFAULT 'issued'
    CHECK (status IN ('issued', 'consumed', 'expired', 'revoked')),
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,

  UNIQUE (organization_id, id),

  FOREIGN KEY (organization_id, transaction_id)
    REFERENCES tenant_auth_transactions (organization_id, id),

  FOREIGN KEY (organization_id, hostname_id)
    REFERENCES organization_hostnames (organization_id, id),

  CHECK (target_hostname ~ '^[a-z0-9](?:[a-z0-9-]{1,61})[a-z0-9]\.portal\.didaxus\.com$'),
  CHECK (
    (status = 'consumed' AND consumed_at IS NOT NULL)
    OR status <> 'consumed'
  )
);

-- Repository integration contract.
-- `operational_tenants` is the canonical organization table.
-- Tenant Resolution does NOT create parallel audit, outbox or idempotency ledgers.
-- State-changing application transactions must write through the existing:
--   audit_logs
--   integration_outbox_events
--   idempotency_records
-- using the same database transaction and the repository's canonical writers.

CREATE OR REPLACE FUNCTION bump_tenant_context_version(
  target_organization_id uuid,
  bump_session_binding boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE organization_tenant_states
  SET
    context_version = context_version + 1,
    session_binding_version = CASE
      WHEN bump_session_binding
      THEN session_binding_version + 1
      ELSE session_binding_version
    END,
    updated_at = now()
  WHERE organization_id = target_organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown organization tenant state: %',
      target_organization_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_hostname_identity_rewrite()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.organization_id <> OLD.organization_id
     OR NEW.tenant_slug <> OLD.tenant_slug
     OR NEW.hostname <> OLD.hostname
     OR NEW.created_at <> OLD.created_at
     OR NEW.created_by <> OLD.created_by
  THEN
    RAISE EXCEPTION
      'Hostname identity fields are immutable; create a hostname change run';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_hostname_identity_rewrite
BEFORE UPDATE ON organization_hostnames
FOR EACH ROW
EXECUTE FUNCTION prevent_hostname_identity_rewrite();

CREATE OR REPLACE FUNCTION prevent_auth_handoff_reuse()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'consumed' THEN
    RAISE EXCEPTION 'Consumed handoff tickets are immutable';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_auth_handoff_reuse
BEFORE UPDATE ON tenant_auth_handoff_tickets
FOR EACH ROW
EXECUTE FUNCTION prevent_auth_handoff_reuse();


-- State transition guard: an active hostname cannot be retired directly.
CREATE OR REPLACE FUNCTION prevent_invalid_hostname_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'active' AND NEW.status = 'retired' THEN
    RAISE EXCEPTION
      'An active hostname cannot be retired directly; use a hostname change or block transition';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_invalid_hostname_transition
BEFORE UPDATE ON organization_hostnames
FOR EACH ROW
EXECUTE FUNCTION prevent_invalid_hostname_transition();

-- Deferred cross-row invariants. They are evaluated at transaction end so the
-- safe order can temporarily leave zero active primaries while the replacement
-- is activated later in the same transaction.
CREATE OR REPLACE FUNCTION enforce_tenant_hostname_invariants()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_organization_id uuid;
  organization_status tenant_organization_status;
  active_primary_count integer;
  invalid_redirect_count integer;
BEGIN
  IF TG_TABLE_NAME = 'organization_tenant_states' THEN
    target_organization_id := COALESCE(NEW.organization_id, OLD.organization_id);
  ELSIF TG_OP = 'DELETE' THEN
    target_organization_id := OLD.organization_id;
  ELSE
    target_organization_id := NEW.organization_id;
  END IF;

  SELECT status
  INTO organization_status
  FROM organization_tenant_states
  WHERE organization_id = target_organization_id;

  SELECT count(*)
  INTO active_primary_count
  FROM organization_hostnames
  WHERE organization_id = target_organization_id
    AND status = 'active'
    AND is_primary = true;

  IF organization_status IN ('active', 'restricted_active')
     AND active_primary_count <> 1 THEN
    RAISE EXCEPTION
      'Active or restricted organization % must have exactly one active primary hostname',
      target_organization_id;
  END IF;

  SELECT count(*)
  INTO invalid_redirect_count
  FROM organization_hostnames source
  LEFT JOIN organization_hostnames target
    ON target.organization_id = source.organization_id
   AND target.id = source.redirect_target_hostname_id
  WHERE source.organization_id = target_organization_id
    AND source.status = 'redirecting'
    AND (
      target.id IS NULL
      OR target.status <> 'active'
      OR target.is_primary <> true
    );

  IF invalid_redirect_count > 0 THEN
    RAISE EXCEPTION
      'Every redirecting hostname must target the active primary hostname of the same organization';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_hostname_invariants_from_hostname
AFTER INSERT OR UPDATE OR DELETE ON organization_hostnames
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION enforce_tenant_hostname_invariants();



-- Blocking an active primary must be coordinated with either an organization
-- suspension/deactivation or a replacement primary in the same transaction.
CREATE OR REPLACE FUNCTION prevent_unsafe_primary_block()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  org_status tenant_organization_status;
  replacement_count integer;
BEGIN
  IF OLD.status = 'active' AND OLD.is_primary = true AND NEW.status = 'blocked' THEN
    SELECT status INTO org_status
    FROM organization_tenant_states
    WHERE organization_id = NEW.organization_id;

    SELECT count(*) INTO replacement_count
    FROM organization_hostnames
    WHERE organization_id = NEW.organization_id
      AND id <> NEW.id
      AND status = 'active'
      AND is_primary = true;

    IF org_status NOT IN ('suspended', 'deactivated') AND replacement_count <> 1 THEN
      RAISE EXCEPTION
        'Cannot block the active primary without suspending/deactivating the organization or activating a replacement primary in the same transaction';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_prevent_unsafe_primary_block
AFTER UPDATE ON organization_hostnames
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION prevent_unsafe_primary_block();

CREATE CONSTRAINT TRIGGER trg_hostname_invariants_from_org_state
AFTER INSERT OR UPDATE ON organization_tenant_states
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION enforce_tenant_hostname_invariants();

-- Global outbox integration contract.
-- Tenant Resolution reuses the canonical Civitas table `integration_outbox_events`.
-- This package does not create a second outbox. Every hostname, session,
-- context-version and handoff event must be inserted into `integration_outbox_events`
-- within the same transaction as the state change. The integration migration
-- must map this canonical table already present in the repository. The same transaction also writes `audit_logs` and claims/records `idempotency_records` through existing writers.

COMMIT;

-- Ejecución atómica del cambio de hostname:
--
-- 1. lock organization_tenant_states;
-- 2. insertar nuevo hostname reserved;
-- 3. mover anterior active a redirecting y establecer target/expiry;
-- 4. activar nuevo hostname como primary;
-- 5. revocar tenant_sessions ligadas al hostname anterior;
-- 6. invalidar AuthTransactions y handoffs del binding anterior;
-- 7. bump_tenant_context_version(org_id, true);
-- 8. insertar evento en integration_outbox_events y auditoría en audit_logs;
-- 9. commit.
--
-- La aplicación debe verificar que la operación deje exactamente un
-- hostname primary active. El índice parcial impide más de uno.

-- Consumo atómico del handoff:
--
-- UPDATE tenant_auth_handoff_tickets
-- SET status = 'consumed', consumed_at = now()
-- WHERE id = $1
--   AND organization_id = $2
--   AND hostname_id = $3
--   AND target_hostname = $4
--   AND context_version = $5
--   AND session_binding_version = $6
--   AND subject_id = $7
--   AND membership_id = $8
--   AND status = 'issued'
--   AND consumed_at IS NULL
--   AND expires_at > now()
-- RETURNING *;
--
-- Si no retorna fila, no se crea sesión.

-- RLS executable policies are defined in 31-CIVITAS-TENANT-RESOLUTION-RLS.sql.
