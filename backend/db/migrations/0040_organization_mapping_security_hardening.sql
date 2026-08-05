-- Issue #318 forward-only persistence hardening. Released migrations remain unchanged.
-- This migration deliberately never reads or writes authorization_scope_assignments.

ALTER TABLE organization_mapping_drafts
  ADD CONSTRAINT organization_mapping_drafts_org_id_uidx UNIQUE (organization_id, id);
ALTER TABLE organization_mapping_policy_versions
  ADD CONSTRAINT organization_mapping_policy_versions_org_id_uidx UNIQUE (organization_id, id);
ALTER TABLE organization_mapping_source_snapshots
  ADD CONSTRAINT organization_mapping_source_snapshots_org_id_uidx UNIQUE (organization_id, id);
ALTER TABLE organization_mapping_evaluations
  ADD CONSTRAINT organization_mapping_evaluations_org_id_uidx UNIQUE (organization_id, id);
ALTER TABLE organization_mapping_previews
  ADD CONSTRAINT organization_mapping_previews_org_id_uidx UNIQUE (organization_id, id);
ALTER TABLE organization_mapping_published_versions
  ADD CONSTRAINT organization_mapping_published_versions_org_id_uidx UNIQUE (organization_id, id);

ALTER TABLE organization_mapping_policy_versions DROP CONSTRAINT IF EXISTS organization_mapping_policy_versions_draft_id_fkey;
ALTER TABLE organization_mapping_policy_versions ADD CONSTRAINT organization_mapping_policy_versions_tenant_draft_fk
  FOREIGN KEY (organization_id, draft_id) REFERENCES organization_mapping_drafts(organization_id, id);

ALTER TABLE organization_mapping_evaluations DROP CONSTRAINT IF EXISTS organization_mapping_evaluations_draft_id_fkey;
ALTER TABLE organization_mapping_evaluations DROP CONSTRAINT IF EXISTS organization_mapping_evaluations_policy_version_id_fkey;
ALTER TABLE organization_mapping_evaluations DROP CONSTRAINT IF EXISTS organization_mapping_evaluations_source_snapshot_id_fkey;
ALTER TABLE organization_mapping_evaluations ADD CONSTRAINT organization_mapping_evaluations_tenant_draft_fk
  FOREIGN KEY (organization_id, draft_id) REFERENCES organization_mapping_drafts(organization_id, id);
ALTER TABLE organization_mapping_evaluations ADD CONSTRAINT organization_mapping_evaluations_tenant_policy_fk
  FOREIGN KEY (organization_id, policy_version_id) REFERENCES organization_mapping_policy_versions(organization_id, id);
ALTER TABLE organization_mapping_evaluations ADD CONSTRAINT organization_mapping_evaluations_tenant_snapshot_fk
  FOREIGN KEY (organization_id, source_snapshot_id) REFERENCES organization_mapping_source_snapshots(organization_id, id);

ALTER TABLE organization_mapping_reviews DROP CONSTRAINT IF EXISTS organization_mapping_reviews_evaluation_id_fkey;
ALTER TABLE organization_mapping_reviews ADD CONSTRAINT organization_mapping_reviews_tenant_evaluation_fk
  FOREIGN KEY (organization_id, evaluation_id) REFERENCES organization_mapping_evaluations(organization_id, id);

ALTER TABLE organization_mapping_previews DROP CONSTRAINT IF EXISTS organization_mapping_previews_draft_id_fkey;
ALTER TABLE organization_mapping_previews ADD CONSTRAINT organization_mapping_previews_tenant_draft_fk
  FOREIGN KEY (organization_id, draft_id) REFERENCES organization_mapping_drafts(organization_id, id);

ALTER TABLE organization_mapping_published_versions DROP CONSTRAINT IF EXISTS organization_mapping_published_versions_draft_id_fkey;
ALTER TABLE organization_mapping_published_versions DROP CONSTRAINT IF EXISTS organization_mapping_published_versions_preview_id_fkey;
ALTER TABLE organization_mapping_published_versions DROP CONSTRAINT IF EXISTS organization_mapping_published_versions_source_publication_id_fkey;
ALTER TABLE organization_mapping_published_versions ADD CONSTRAINT organization_mapping_published_versions_tenant_draft_fk
  FOREIGN KEY (organization_id, draft_id) REFERENCES organization_mapping_drafts(organization_id, id);
ALTER TABLE organization_mapping_published_versions ADD CONSTRAINT organization_mapping_published_versions_tenant_preview_fk
  FOREIGN KEY (organization_id, preview_id) REFERENCES organization_mapping_previews(organization_id, id);
ALTER TABLE organization_mapping_published_versions ADD CONSTRAINT organization_mapping_published_versions_tenant_source_fk
  FOREIGN KEY (organization_id, source_publication_id) REFERENCES organization_mapping_published_versions(organization_id, id);

ALTER TABLE organization_mapping_reconciliation_work_items DROP CONSTRAINT IF EXISTS organization_mapping_reconciliation_work_items_publication_id_fkey;
ALTER TABLE organization_mapping_reconciliation_work_items ADD CONSTRAINT organization_mapping_reconciliation_items_tenant_publication_fk
  FOREIGN KEY (organization_id, publication_id) REFERENCES organization_mapping_published_versions(organization_id, id);

ALTER TABLE organization_mapping_evaluations DROP CONSTRAINT IF EXISTS organization_mapping_evaluations_outcome_check;
ALTER TABLE organization_mapping_evaluations ADD CONSTRAINT organization_mapping_evaluations_outcome_check
  CHECK (outcome IN ('MATCH','NO_MATCH','UNRESOLVED'));

ALTER TABLE organization_mapping_published_versions
  ADD COLUMN IF NOT EXISTS model_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS published_version BIGINT,
  ADD COLUMN IF NOT EXISTS base_published_version BIGINT;
ALTER TABLE organization_mapping_published_versions DROP CONSTRAINT IF EXISTS organization_mapping_published_versions_organization_id_model_hash_key;
CREATE UNIQUE INDEX organization_mapping_published_versions_org_version_uidx
  ON organization_mapping_published_versions(organization_id, published_version);

ALTER TABLE organization_mapping_idempotency_keys
  ADD COLUMN IF NOT EXISTS subject_id TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS action_id TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS request_hash TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS expected_version TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed';
ALTER TABLE organization_mapping_idempotency_keys DROP CONSTRAINT IF EXISTS organization_mapping_idempotency_keys_pkey;
ALTER TABLE organization_mapping_idempotency_keys ADD PRIMARY KEY (organization_id, subject_id, action_id, idempotency_key);

ALTER TABLE organization_mapping_reconciliation_work_items
  ADD COLUMN IF NOT EXISTS impact_classification TEXT NOT NULL DEFAULT 'revalidation_required'
  CHECK (impact_classification IN ('no_effect','revalidation_required','narrowing_possible','broadening_possible','assignment_invalid','source_relationship_stale','manual_review_required'));
