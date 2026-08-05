-- Phase 3 #218: no automatic aliasing is permitted. Deploy only after the
-- reviewed reconciliation plan has removed ambiguous legacy dimension rows.
do $$ begin
 if exists(select 1 from organization_dimension_values v where v.dimension_key_cache in ('academic.'||'section','academic.'||'grade_level') and not exists(select 1 from taxonomy_v2_reconciliation_plan p where p.legacy_value_id=v.id)) then raise exception 'taxonomy_v2_reconciliation_required'; end if;
end $$;
alter table taxonomy_dimension_definitions drop constraint if exists taxonomy_dimension_definitions_known_key_check;
alter table taxonomy_dimension_definitions drop constraint if exists taxonomy_dimension_definitions_kind_check;
insert into taxonomy_dimension_definitions(dimension_key,display_name,description,value_kind,hierarchy_allowed,multi_assignment_allowed,is_active,contract_version) values
 ('academic.stage','Academic stage','Institutional stage or cycle','stable_id',true,true,true,'2026-07-civitas-data-scope-dimensions-v2'),
 ('academic.period','Academic period','Explicit academic time period','stable_id',false,true,true,'2026-07-civitas-data-scope-dimensions-v2'),
 ('academic.subject','Academic subject','Academic discipline','stable_id',false,true,true,'2026-07-civitas-data-scope-dimensions-v2'),
 ('academic.course','Academic course','Curricular course definition','stable_id',false,true,true,'2026-07-civitas-data-scope-dimensions-v2'),
 ('academic.cohort','Academic cohort','Academic intake or trajectory cohort','stable_id',false,true,true,'2026-07-civitas-data-scope-dimensions-v2'),
 ('academic.class','Academic class','Concrete academic offering','stable_id',false,true,true,'2026-07-civitas-data-scope-dimensions-v2'),
 ('organization.campus','Campus','Physical or virtual campus','stable_id',true,true,true,'2026-07-civitas-data-scope-dimensions-v2'),
 ('organization.shift','Shift','Institutional operating shift','stable_id',false,true,true,'2026-07-civitas-data-scope-dimensions-v2'),
 ('organization.department','Department','Organizational department','stable_id',true,true,true,'2026-07-civitas-data-scope-dimensions-v2'),
 ('administration.function','Administrative function','Cross-cutting administrative function','stable_id',false,true,true,'2026-07-civitas-data-scope-dimensions-v2')
on conflict(dimension_key) do update set display_name=excluded.display_name,description=excluded.description,value_kind=excluded.value_kind,hierarchy_allowed=excluded.hierarchy_allowed,multi_assignment_allowed=excluded.multi_assignment_allowed,is_active=true,contract_version=excluded.contract_version,updated_at=now();
update organization_dimension_values v set dimension_definition_id=d.id,dimension_key_cache=p.target_dimension_key from taxonomy_v2_reconciliation_plan p join taxonomy_dimension_definitions d on d.dimension_key=p.target_dimension_key where v.id=p.legacy_value_id;
delete from taxonomy_dimension_definitions where dimension_key in ('academic.'||'section','academic.'||'grade_level');
do $$ begin if (select count(*) from taxonomy_dimension_definitions where is_active and contract_version='2026-07-civitas-data-scope-dimensions-v2') <> 10 then raise exception 'taxonomy_v2_exact_definitions_required'; end if; end $$;
alter table taxonomy_dimension_definitions
  add constraint taxonomy_dimension_definitions_known_key_check check (dimension_key in (
    'academic.stage', 'academic.period', 'academic.subject', 'academic.course',
    'academic.cohort', 'academic.class', 'organization.campus',
    'organization.shift', 'organization.department', 'administration.function'
  ));
alter table taxonomy_dimension_definitions
  add constraint taxonomy_dimension_definitions_kind_check check (value_kind in ('stable_id','enumeration','hierarchy'));
alter table taxonomy_dimension_capabilities
  drop constraint if exists taxonomy_dimension_capabilities_capability_check;
alter table taxonomy_dimension_capabilities
  add constraint taxonomy_dimension_capabilities_capability_check check (capability in (
    'identity','lms','crm','marketing','support','scheduling','payments','email','storage',
    'analytics','notifications','automation','community','planning','hr'
  ));
