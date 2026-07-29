-- Phase 3 #218: no automatic aliasing is permitted. Deploy only after the
-- reviewed reconciliation plan has removed ambiguous legacy dimension rows.
do $$
begin
  if exists (
    select 1 from organization_dimension_values
    where dimension_key_cache in ('academic.' || 'section', 'academic.' || 'grade_level')
  ) then
    raise exception 'taxonomy_v2_reconciliation_required';
  end if;
end $$;

alter table taxonomy_dimension_definitions
  drop constraint if exists taxonomy_dimension_definitions_known_key_check;
alter table taxonomy_dimension_definitions
  add constraint taxonomy_dimension_definitions_known_key_check check (dimension_key in (
    'academic.stage', 'academic.period', 'academic.subject', 'academic.course',
    'academic.cohort', 'academic.class', 'organization.campus',
    'organization.shift', 'organization.department', 'administration.function'
  ));
alter table taxonomy_dimension_definitions
  drop constraint if exists taxonomy_dimension_definitions_kind_check;
alter table taxonomy_dimension_definitions
  add constraint taxonomy_dimension_definitions_kind_check check (value_kind in ('stable_id','enumeration','hierarchy'));
alter table taxonomy_dimension_capabilities
  drop constraint if exists taxonomy_dimension_capabilities_capability_check;
alter table taxonomy_dimension_capabilities
  add constraint taxonomy_dimension_capabilities_capability_check check (capability in (
    'identity','lms','crm','marketing','support','scheduling','payments','email','storage',
    'analytics','notifications','automation','community','planning','hr'
  ));
