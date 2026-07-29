-- A human must classify every ambiguous value as stage, cohort, class, or another
-- v2 dimension. No runtime alias or label inference is permitted.
create table if not exists taxonomy_v2_reconciliation_plan (
  legacy_value_id uuid primary key references organization_dimension_values(id) on delete restrict,
  target_dimension_key varchar(100) not null,
  reviewed_by_logto_user_id varchar(128) not null,
  reason text not null,
  reviewed_at timestamptz not null default now(),
  constraint taxonomy_v2_reconciliation_target_ck check(target_dimension_key in ('academic.stage','academic.period','academic.subject','academic.course','academic.cohort','academic.class','organization.campus','organization.shift','organization.department','administration.function'))
);
