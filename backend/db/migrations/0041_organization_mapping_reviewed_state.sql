-- Issue #318 reviewed-state persistence and shared-outbox convergence.
-- Forward-only; does not read or mutate authorization_scope_assignments.

DO $$
BEGIN
  IF to_regclass('organization_mapping_outbox_events') IS NOT NULL THEN
    INSERT INTO integration_outbox_events(
      event_id,event_type,schema_version,logto_organization_id,
      aggregate_type,aggregate_id,actor_json,correlation_id,
      source_json,sensitivity,payload
    )
    SELECT id,'organization_mapping.lifecycle.changed','civitas-integration-event/v1',organization_id,
           'organization_model',COALESCE(payload_json->>'targetId',organization_id),
           '{"type":"system","subject":"migration-0041"}'::jsonb,
           COALESCE(idempotency_key,id::text),
           '{"component":"organization-mapping","migration":"0041"}'::jsonb,'internal',
           jsonb_build_object(
             'actionId',event_type,
             'result',COALESCE(payload_json->>'result','unknown'),
             'reasonHash',encode(digest(event_type || ':' || id::text,'sha256'),'hex'),
             'targetType',COALESCE(payload_json->>'targetType','organization_model'),
             'targetId',COALESCE(payload_json->>'targetId',organization_id)
           )
    FROM organization_mapping_outbox_events
    ON CONFLICT(event_id) DO NOTHING;
  END IF;
END $$;
DROP TABLE IF EXISTS organization_mapping_outbox_events;

CREATE TABLE organization_mapping_selector_sets (
  organization_id TEXT NOT NULL,
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  stable_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id),
  UNIQUE (organization_id, stable_key)
);

CREATE TABLE organization_mapping_policy_identities (
  organization_id TEXT NOT NULL,
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  stable_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id),
  UNIQUE (organization_id, stable_key)
);

CREATE TABLE organization_mapping_selector_set_versions (
  organization_id TEXT NOT NULL,
  selector_set_id UUID NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  selector_registry_version TEXT NOT NULL,
  selector_registry_hash TEXT NOT NULL,
  authority_key TEXT NOT NULL,
  source_connection_id TEXT,
  content_hash TEXT NOT NULL,
  immutable BOOLEAN NOT NULL DEFAULT TRUE CHECK (immutable),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, selector_set_id, version),
  UNIQUE (organization_id, selector_set_id, content_hash),
  FOREIGN KEY (organization_id, selector_set_id)
    REFERENCES organization_mapping_selector_sets(organization_id, id)
);

CREATE TABLE organization_mapping_selector_set_conditions (
  organization_id TEXT NOT NULL,
  selector_set_id UUID NOT NULL,
  selector_set_version INTEGER NOT NULL,
  condition_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  selector_key TEXT NOT NULL,
  operator_key TEXT NOT NULL,
  operand_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (organization_id, selector_set_id, selector_set_version, condition_id),
  UNIQUE (organization_id, selector_set_id, selector_set_version, ordinal),
  FOREIGN KEY (organization_id, selector_set_id, selector_set_version)
    REFERENCES organization_mapping_selector_set_versions(organization_id, selector_set_id, version)
);

ALTER TABLE organization_mapping_policy_versions
  ADD COLUMN IF NOT EXISTS policy_key TEXT,
  ADD COLUMN IF NOT EXISTS policy_identity_id UUID,
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  ADD COLUMN IF NOT EXISTS authority_key TEXT NOT NULL DEFAULT 'organization_mapping_policy',
  ADD COLUMN IF NOT EXISTS parent_policy_version_id UUID,
  ADD COLUMN IF NOT EXISTS refinement_kind TEXT,
  ADD COLUMN IF NOT EXISTS refinement_reason TEXT,
  ADD COLUMN IF NOT EXISTS selector_set_id UUID,
  ADD COLUMN IF NOT EXISTS selector_set_version INTEGER,
  ADD COLUMN IF NOT EXISTS selector_set_hash TEXT;
UPDATE organization_mapping_policy_versions SET policy_key=COALESCE(policy_key,id::text);
INSERT INTO organization_mapping_policy_identities(organization_id,stable_key)
SELECT DISTINCT organization_id,policy_key FROM organization_mapping_policy_versions
ON CONFLICT DO NOTHING;
UPDATE organization_mapping_policy_versions v SET policy_identity_id=i.id
FROM organization_mapping_policy_identities i
WHERE (i.organization_id,i.stable_key)=(v.organization_id,v.policy_key)
  AND v.policy_identity_id IS NULL;
ALTER TABLE organization_mapping_policy_versions
  ALTER COLUMN policy_key SET NOT NULL,
  ALTER COLUMN policy_identity_id SET NOT NULL,
  ADD CONSTRAINT organization_mapping_policy_identity_tenant_fk
    FOREIGN KEY (organization_id, policy_identity_id)
    REFERENCES organization_mapping_policy_identities(organization_id, id);
ALTER TABLE organization_mapping_policy_versions DROP CONSTRAINT IF EXISTS organization_mapping_policy_versions_organization_id_policy_hash_key;
CREATE UNIQUE INDEX organization_mapping_policy_versions_exact_uidx
  ON organization_mapping_policy_versions(organization_id, policy_key, version);
ALTER TABLE organization_mapping_policy_versions
  ADD CONSTRAINT organization_mapping_policy_parent_tenant_fk
  FOREIGN KEY (organization_id, parent_policy_version_id)
  REFERENCES organization_mapping_policy_versions(organization_id, id);
ALTER TABLE organization_mapping_policy_versions
  ADD CONSTRAINT organization_mapping_policy_selector_set_tenant_fk
  FOREIGN KEY (organization_id, selector_set_id, selector_set_version)
  REFERENCES organization_mapping_selector_set_versions(organization_id, selector_set_id, version);
ALTER TABLE organization_mapping_policy_versions
  ADD CONSTRAINT organization_mapping_policy_refinement_ck CHECK (
    (parent_policy_version_id IS NULL AND refinement_kind IS NULL)
    OR (parent_policy_version_id IS NOT NULL
        AND refinement_kind IN ('inherits','extends','narrows','resolves_conflict')
        AND length(trim(refinement_reason)) > 0)
  );

ALTER TABLE organization_mapping_source_snapshots
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  ADD COLUMN IF NOT EXISTS snapshot_hash TEXT,
  ADD COLUMN IF NOT EXISTS freshness_state TEXT NOT NULL DEFAULT 'current'
    CHECK (freshness_state IN ('current','stale','removed','unresolved'));
ALTER TABLE organization_mapping_evaluations
  ADD COLUMN IF NOT EXISTS evaluation_hash TEXT;
ALTER TABLE organization_mapping_reviews
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0);
ALTER TABLE organization_mapping_reviews DROP CONSTRAINT IF EXISTS organization_mapping_reviews_organization_id_evaluation_id_decision_key;
ALTER TABLE organization_mapping_reviews
  ADD CONSTRAINT organization_mapping_reviews_version_uidx UNIQUE (organization_id, evaluation_id, version);

ALTER TABLE organization_mapping_previews
  ADD COLUMN IF NOT EXISTS reviewed_state_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS reviewed_state_hash TEXT,
  ADD COLUMN IF NOT EXISTS base_publication_id UUID,
  ADD CONSTRAINT organization_mapping_preview_base_tenant_fk
    FOREIGN KEY (organization_id, base_publication_id)
    REFERENCES organization_mapping_published_versions(organization_id, id);

ALTER TABLE organization_mapping_published_versions
  ADD COLUMN IF NOT EXISTS reviewed_state_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS reviewed_state_hash TEXT;

CREATE INDEX organization_mapping_policy_versions_draft_idx
  ON organization_mapping_policy_versions(organization_id, draft_id, version);
CREATE INDEX organization_mapping_evaluations_draft_idx
  ON organization_mapping_evaluations(organization_id, draft_id, created_at);

-- Rollback/forward recovery: retain immutable selector/policy/publication rows;
-- archive an affected draft and create a fresh exact-version draft. Never infer access.

INSERT INTO integration_event_schema_registry(event_type,schema_version,owning_module_id,owning_capability_id,lifecycle,sensitivity,payload_schema,allowed_consumers,compatibility_status,retention_class,max_payload_bytes,redaction_policy,producer_contract)
VALUES ('organization_mapping.lifecycle.changed','civitas-integration-event/v1','organization-mapping','organization-model.lifecycle','active','internal','{"type":"object","required":["actionId","result","reasonHash","targetType","targetId"],"additionalProperties":false}'::jsonb,'["organization-model.projection","authorization.reconciliation"]'::jsonb,'compatible','operational',4096,'{"rejectSecrets":true,"safeReferencesOnly":true}'::jsonb,'{"component":"organization-mapping-service"}'::jsonb)
ON CONFLICT(event_type,schema_version) DO UPDATE SET lifecycle=excluded.lifecycle,payload_schema=excluded.payload_schema,allowed_consumers=excluded.allowed_consumers,redaction_policy=excluded.redaction_policy,producer_contract=excluded.producer_contract,updated_at=now();
