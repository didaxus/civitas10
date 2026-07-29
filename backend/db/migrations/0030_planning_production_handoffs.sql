-- Planning owns immutable handoff envelopes and their delivery state. Plasma task/asset tables are intentionally absent.
create table if not exists planning_production_handoffs (
  organization_id varchar(128) not null,
  handoff_id uuid not null,
  operation_id uuid not null,
  plan_id varchar(180) not null,
  plan_version integer not null,
  content_hash varchar(71) not null,
  state varchar(32) not null default 'accepted',
  correlation_id varchar(160) not null,
  contract_json jsonb not null,
  result_json jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (organization_id, handoff_id), unique(operation_id),
  foreign key (organization_id, plan_id, plan_version) references planning_versions(organization_id, plan_id, version),
  constraint planning_handoff_hash_ck check(content_hash ~ '^sha256:[a-f0-9]{64}$'),
  constraint planning_handoff_state_ck check(state in ('accepted','running','succeeded','failed','timed_out','cancelled','rolled_back')),
  constraint planning_handoff_approved_immutable_ck check(contract_json->'plan'->>'state'='approved' and (contract_json->'plan'->>'immutable')::boolean=true),
  constraint planning_handoff_no_plasma_domain_ck check(not (contract_json ?| array['tasks','assets','plasmaTasks','plasmaAssets']))
);
create index if not exists planning_handoffs_state_idx on planning_production_handoffs(organization_id,state,updated_at);

create table if not exists production_handoff_inbox (
  organization_id varchar(128) not null, handoff_id uuid not null, receipt_id varchar(180) not null,
  content_hash varchar(71) not null, status varchar(32) not null, received_at timestamptz not null default now(),
  primary key(organization_id,handoff_id), unique(organization_id,receipt_id),
  constraint production_handoff_inbox_hash_ck check(content_hash ~ '^sha256:[a-f0-9]{64}$')
);

-- Publication is performed only through the shared integration outbox in the same Planning transaction.
create or replace function planning_handoff_publish_requested() returns trigger language plpgsql as $$
begin
  insert into integration_outbox_events(event_id,event_type,schema_version,logto_organization_id,aggregate_type,aggregate_id,aggregate_version,actor_json,correlation_id,operation_id,source_json,sensitivity,payload)
  values(gen_random_uuid(),'production.handoff.requested','2',new.organization_id,'planning.production_handoff',new.handoff_id::text,new.plan_version::text,
    jsonb_build_object('type','authorized_subject'),new.correlation_id,new.operation_id,jsonb_build_object('moduleId','planning','component','production-handoff'),'internal',new.contract_json);
  return new;
end $$;
drop trigger if exists planning_handoff_outbox_trigger on planning_production_handoffs;
create trigger planning_handoff_outbox_trigger after insert on planning_production_handoffs for each row execute function planning_handoff_publish_requested();
