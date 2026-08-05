-- Issue #318 Turn 1 deterministic compatibility migration.
-- Rollback: DROP TABLE organization_model_dimension_reconciliation;
CREATE TABLE IF NOT EXISTS organization_model_dimension_reconciliation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  logto_organization_id TEXT NOT NULL,
  legacy_dimension_key TEXT NOT NULL,
  legacy_value_id TEXT,
  reconciliation_status TEXT NOT NULL DEFAULT 'reconciliation_required',
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (reconciliation_status = 'reconciliation_required')
);

INSERT INTO organization_model_dimension_reconciliation (logto_organization_id, legacy_dimension_key, legacy_value_id, reason)
SELECT DISTINCT logto_organization_id, dimension_key_cache, id::TEXT,
  'academic.period is ambiguous across school year, concrete term, and term type; no automatic migration is safe.'
FROM organization_dimension_values
WHERE dimension_key_cache = 'academic.period'
ON CONFLICT DO NOTHING;

-- This migration intentionally does not UPDATE or ALTER authorization_scope_assignments.
