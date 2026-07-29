-- Tenant-facing role labels are presentation-only. Logto/canonical role IDs remain authoritative.
-- Normative uniqueness decision: one row per tenant/canonical role and one active
-- Unicode-normalized, case-insensitive alias per tenant. Aliases are never lookup IDs.
CREATE TABLE IF NOT EXISTS organization_role_aliases (
  logto_organization_id varchar(128) NOT NULL,
  canonical_role_id varchar(128) NOT NULL,
  alias varchar(80),
  alias_uniqueness_key varchar(160),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (logto_organization_id, canonical_role_id),
  CONSTRAINT organization_role_aliases_alias_pair_ck CHECK ((alias IS NULL) = (alias_uniqueness_key IS NULL)),
  CONSTRAINT organization_role_aliases_plain_text_ck CHECK (alias IS NULL OR (alias !~ '[[:cntrl:]]' AND alias !~ '[<>]'))
);

CREATE UNIQUE INDEX IF NOT EXISTS organization_role_aliases_tenant_alias_uidx
  ON organization_role_aliases (logto_organization_id, alias_uniqueness_key)
  WHERE alias IS NOT NULL;

CREATE INDEX IF NOT EXISTS organization_role_aliases_tenant_idx
  ON organization_role_aliases (logto_organization_id, canonical_role_id, version);
