alter table authorization_scope_assignments
  add column if not exists strategy_id varchar(80), add column if not exists target jsonb,
  add column if not exists provenance jsonb, add column if not exists snapshot_version bigint;
update authorization_scope_assignments a set strategy_id=t.strategy,
 target=jsonb_strip_nulls(jsonb_build_object('kind',a.scope_kind,'dimensionKey',a.dimension_key,'relationshipKey',a.relationship_key,'valueId',a.dimension_value_id,'unitId',a.unit_id,'resourceRef',a.resource_ref)),
 provenance=jsonb_strip_nulls(jsonb_build_object('sourceType',a.source_type,'sourceRef',a.source_ref,'sourceVersion',a.source_version)), snapshot_version=1
from owner_scope_templates t where a.scope_template_id=t.id and a.scope_template_version=t.version;
do $$ begin if exists(select 1 from authorization_scope_assignments where scope_template_id is null or scope_template_version is null or strategy_id is null or target is null or provenance is null or snapshot_version is null or membership_id is null or canonical_role_id is null) then raise exception 'data_scope_assignment_v2_reconciliation_required'; end if; end $$;
alter table authorization_scope_assignments alter column scope_template_id set not null, alter column scope_template_version set not null, alter column strategy_id set not null, alter column target set not null, alter column provenance set not null, alter column snapshot_version set not null;
alter table authorization_scope_assignments drop constraint if exists authorization_scope_assignments_target_object_ck;
alter table authorization_scope_assignments drop constraint if exists authorization_scope_assignments_provenance_object_ck;
alter table authorization_scope_assignments drop constraint if exists authorization_scope_assignments_snapshot_positive_ck;
alter table authorization_scope_assignments add constraint authorization_scope_assignments_target_object_ck check(jsonb_typeof(target)='object');
alter table authorization_scope_assignments add constraint authorization_scope_assignments_provenance_object_ck check(jsonb_typeof(provenance)='object');
alter table authorization_scope_assignments add constraint authorization_scope_assignments_snapshot_positive_ck check(snapshot_version>0);
