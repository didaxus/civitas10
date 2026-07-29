-- Compensating, forward-only upgrade for installations that recorded the former
-- 0029_planning_aggregate.sql filename before migrations received unique numbers.
alter table planning_plans add column if not exists plan_type varchar(32) not null default 'operational';
update planning_plans set state = 'changes_requested' where state = 'rejected';
alter table planning_plans drop constraint if exists planning_plans_state_ck;
alter table planning_plans add constraint planning_plans_state_ck check (state in ('draft','in_review','changes_requested','approved','archived'));
alter table planning_plans drop constraint if exists planning_plans_type_ck;
alter table planning_plans add constraint planning_plans_type_ck check (plan_type in ('strategic','tactical','operational','project','curriculum'));

alter table planning_versions add column if not exists source_version integer;
alter table planning_versions add column if not exists source_hash char(64);
alter table planning_versions add column if not exists source_actor varchar(180);
alter table planning_versions add column if not exists source_at timestamptz;
alter table planning_versions add column if not exists source_reason text;
alter table planning_versions drop constraint if exists planning_versions_source_ck;
alter table planning_versions add constraint planning_versions_source_ck check (
  (source_version is null and source_hash is null and source_actor is null and source_at is null and source_reason is null)
  or (source_version is not null and source_hash ~ '^[a-f0-9]{64}$' and source_actor is not null and source_at is not null and btrim(source_reason) <> '')
);
