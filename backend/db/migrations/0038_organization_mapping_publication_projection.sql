-- Issue #318 Turn 4 exact preview, immutable publication, rollback, projections, and reconciliation work items.
-- Does not touch authorization_scope_assignments and does not grant access.
CREATE TABLE IF NOT EXISTS organization_mapping_previews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL,
  draft_id UUID NOT NULL REFERENCES organization_mapping_drafts(id),
  draft_version INTEGER NOT NULL CHECK (draft_version > 0),
  preview_digest TEXT NOT NULL,
  impact_digest TEXT NOT NULL,
  graph_json JSONB NOT NULL,
  scope_tree_json JSONB NOT NULL,
  facets_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id,draft_id,draft_version,preview_digest)
);

CREATE TABLE IF NOT EXISTS organization_mapping_published_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL,
  draft_id UUID NOT NULL REFERENCES organization_mapping_drafts(id),
  draft_version INTEGER NOT NULL CHECK (draft_version > 0),
  preview_id UUID NOT NULL REFERENCES organization_mapping_previews(id),
  model_hash TEXT NOT NULL,
  impact_digest TEXT NOT NULL,
  graph_json JSONB NOT NULL,
  scope_tree_json JSONB NOT NULL,
  facets_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_publication_id UUID REFERENCES organization_mapping_published_versions(id),
  immutable BOOLEAN NOT NULL DEFAULT TRUE CHECK (immutable),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id,model_hash),
  UNIQUE(organization_id,preview_id)
);

CREATE TABLE IF NOT EXISTS organization_mapping_reconciliation_work_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL,
  publication_id UUID NOT NULL REFERENCES organization_mapping_published_versions(id),
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','blocked')),
  grants_access BOOLEAN NOT NULL DEFAULT FALSE CHECK (grants_access = FALSE),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id,publication_id,target_type,target_id)
);

CREATE OR REPLACE FUNCTION organization_mapping_published_versions_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'organization_mapping_published_version_immutable';
END $$;
DROP TRIGGER IF EXISTS organization_mapping_published_versions_no_update ON organization_mapping_published_versions;
CREATE TRIGGER organization_mapping_published_versions_no_update
BEFORE UPDATE OR DELETE ON organization_mapping_published_versions
FOR EACH ROW EXECUTE FUNCTION organization_mapping_published_versions_immutable();

-- Explicit safety: no UPDATE/INSERT/ALTER authorization_scope_assignments in this migration.
