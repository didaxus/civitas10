-- Governance preferences extend the existing tenant policy aggregate; no duplicate aggregate table.
alter table authorization_policy_versions add column if not exists governance_aliases jsonb not null default '[]'::jsonb;
alter table authorization_policy_versions add column if not exists governance_navigation jsonb not null default '[]'::jsonb;
do $$ begin
if not exists(select 1 from pg_constraint where conname='authorization_policy_versions_aliases_array_ck') then alter table authorization_policy_versions add constraint authorization_policy_versions_aliases_array_ck check(jsonb_typeof(governance_aliases)='array'); end if;
if not exists(select 1 from pg_constraint where conname='authorization_policy_versions_navigation_array_ck') then alter table authorization_policy_versions add constraint authorization_policy_versions_navigation_array_ck check(jsonb_typeof(governance_navigation)='array'); end if;
end $$;
