-- Governed organization-model review outcomes and versioned dimension configuration.
ALTER TABLE organization_mapping_reviews DROP CONSTRAINT IF EXISTS organization_mapping_reviews_decision_check;
ALTER TABLE organization_mapping_reviews ADD CONSTRAINT organization_mapping_reviews_decision_check
  CHECK (decision IN ('approved','rejected','ignored','returned_to_author','canonical_target_selected','organization_value_created'));
ALTER TABLE organization_dimension_configurations ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0);
CREATE UNIQUE INDEX IF NOT EXISTS organization_dimension_configurations_version_uidx
  ON organization_dimension_configurations(organization_id, dimension_id, version);
CREATE TABLE IF NOT EXISTS organization_mapping_authorization_decisions (
  decision_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  final_decision TEXT NOT NULL CHECK (final_decision IN ('allow','deny','unresolved')),
  terminal_stage TEXT NOT NULL,
  terminal_reason_code TEXT NOT NULL,
  authorization_snapshot_version TEXT NOT NULL,
  policy_version TEXT,
  scope_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS organization_mapping_authorization_decisions_recent_idx
  ON organization_mapping_authorization_decisions(organization_id, subject_id, created_at DESC);
ALTER TABLE organization_mapping_reconciliation_work_items
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS assignment_reference_count INTEGER NOT NULL DEFAULT 0 CHECK (assignment_reference_count >= 0),
  ADD COLUMN IF NOT EXISTS required_follow_up TEXT;
