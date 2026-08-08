-- Phase 3 #218 revised by #318: no automatic aliasing is permitted.
-- Reviewed reconciliation must resolve academic.period and academic.section before activation.
do $$ begin
 if exists(select 1 from organization_dimension_values v where v.dimension_key_cache in ('academic.'||'section','academic.'||'period') and not exists(select 1 from taxonomy_v2_reconciliation_plan p where p.legacy_value_id=v.id)) then raise exception 'taxonomy_v2_reconciliation_required'; end if;
end $$;
alter table taxonomy_dimension_definitions drop constraint if exists taxonomy_dimension_definitions_known_key_check;
alter table taxonomy_dimension_definitions drop constraint if exists taxonomy_dimension_definitions_kind_check;
insert into taxonomy_dimension_definitions(dimension_key,display_name,description,value_kind,hierarchy_allowed,multi_assignment_allowed,is_active,contract_version) values
 ('academic.school_year','School Year','Issue #318 canonical academic.school_year','stable_id',false,true,true,'2026-08-civitas-data-scope-dimensions-v3'),
 ('academic.term','Term','Issue #318 canonical academic.term','stable_id',false,true,true,'2026-08-civitas-data-scope-dimensions-v3'),
 ('academic.term_type','Term Type','Issue #318 canonical academic.term_type','stable_id',false,true,true,'2026-08-civitas-data-scope-dimensions-v3'),
 ('academic.stage','Stage','Issue #318 canonical academic.stage','stable_id',true,true,true,'2026-08-civitas-data-scope-dimensions-v3'),
 ('academic.grade_level','Grade Level','Issue #318 canonical academic.grade_level','stable_id',false,true,true,'2026-08-civitas-data-scope-dimensions-v3'),
 ('academic.year_level','Year Level','Issue #318 canonical academic.year_level','stable_id',false,true,true,'2026-08-civitas-data-scope-dimensions-v3'),
 ('academic.faculty','Faculty','Issue #318 canonical academic.faculty','stable_id',false,true,true,'2026-08-civitas-data-scope-dimensions-v3'),
 ('academic.department','Department','Issue #318 canonical academic.department','stable_id',false,true,true,'2026-08-civitas-data-scope-dimensions-v3'),
 ('academic.program','Program','Issue #318 canonical academic.program','stable_id',false,true,true,'2026-08-civitas-data-scope-dimensions-v3'),
 ('academic.program_level','Program Level','Issue #318 canonical academic.program_level','stable_id',false,true,true,'2026-08-civitas-data-scope-dimensions-v3'),
 ('academic.credential_level','Credential Level','Issue #318 canonical academic.credential_level','stable_id',false,true,true,'2026-08-civitas-data-scope-dimensions-v3'),
 ('academic.program_version','Program Version','Issue #318 canonical academic.program_version','stable_id',false,true,true,'2026-08-civitas-data-scope-dimensions-v3'),
 ('academic.modality','Modality','Issue #318 canonical academic.modality','stable_id',false,true,true,'2026-08-civitas-data-scope-dimensions-v3'),
 ('academic.cohort','Cohort','Issue #318 canonical academic.cohort','stable_id',false,true,true,'2026-08-civitas-data-scope-dimensions-v3'),
 ('academic.subject','Subject','Issue #318 canonical academic.subject','stable_id',false,true,true,'2026-08-civitas-data-scope-dimensions-v3'),
 ('academic.course','Course','Issue #318 canonical academic.course','stable_id',false,true,true,'2026-08-civitas-data-scope-dimensions-v3'),
 ('academic.class','Class','Issue #318 canonical academic.class','stable_id',false,true,true,'2026-08-civitas-data-scope-dimensions-v3'),
 ('organization.region','Region','Issue #318 canonical organization.region','stable_id',false,true,true,'2026-08-civitas-data-scope-dimensions-v3'),
 ('organization.campus','Campus','Issue #318 canonical organization.campus','stable_id',true,true,true,'2026-08-civitas-data-scope-dimensions-v3'),
 ('organization.shift','Shift','Issue #318 canonical organization.shift','stable_id',false,true,true,'2026-08-civitas-data-scope-dimensions-v3'),
 ('organization.department','Department','Issue #318 canonical organization.department','stable_id',true,true,true,'2026-08-civitas-data-scope-dimensions-v3'),
 ('organization.coordination','Coordination','Issue #318 canonical organization.coordination','stable_id',false,true,true,'2026-08-civitas-data-scope-dimensions-v3'),
 ('administration.function','Function','Issue #318 canonical administration.function','stable_id',false,true,true,'2026-08-civitas-data-scope-dimensions-v3'),
 ('geography.administrative_area','Administrative Area','Issue #318 canonical geography.administrative_area','stable_id',true,true,true,'2026-08-civitas-data-scope-dimensions-v3'),
 ('geography.municipality','Municipality','Issue #318 canonical geography.municipality','stable_id',false,true,true,'2026-08-civitas-data-scope-dimensions-v3')
on conflict(dimension_key) do update set display_name=excluded.display_name,description=excluded.description,value_kind=excluded.value_kind,hierarchy_allowed=excluded.hierarchy_allowed,multi_assignment_allowed=excluded.multi_assignment_allowed,is_active=true,contract_version=excluded.contract_version,updated_at=now();
update organization_dimension_values v set dimension_definition_id=d.id,dimension_key_cache=p.target_dimension_key from taxonomy_v2_reconciliation_plan p join taxonomy_dimension_definitions d on d.dimension_key=p.target_dimension_key where v.id=p.legacy_value_id;
delete from taxonomy_dimension_definitions where dimension_key in ('academic.'||'section','academic.'||'period');
do $$ begin if (select count(*) from taxonomy_dimension_definitions where is_active and contract_version='2026-08-civitas-data-scope-dimensions-v3') <> 25 then raise exception 'taxonomy_v3_exact_definitions_required'; end if; end $$;
alter table taxonomy_dimension_definitions add constraint taxonomy_dimension_definitions_known_key_check check (dimension_key in (
    'academic.school_year',
    'academic.term',
    'academic.term_type',
    'academic.stage',
    'academic.grade_level',
    'academic.year_level',
    'academic.faculty',
    'academic.department',
    'academic.program',
    'academic.program_level',
    'academic.credential_level',
    'academic.program_version',
    'academic.modality',
    'academic.cohort',
    'academic.subject',
    'academic.course',
    'academic.class',
    'organization.region',
    'organization.campus',
    'organization.shift',
    'organization.department',
    'organization.coordination',
    'administration.function',
    'geography.administrative_area',
    'geography.municipality'
  ));
alter table taxonomy_dimension_definitions add constraint taxonomy_dimension_definitions_kind_check check (value_kind in ('stable_id','enumeration','hierarchy'));
