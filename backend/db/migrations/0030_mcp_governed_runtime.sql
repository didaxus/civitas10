create table if not exists mcp_tool_registry (
  tool_id varchar(160) not null, tool_version varchar(40) not null, module_id varchar(80) not null,
  capability_id varchar(160) not null, application_service_id varchar(200) not null, permission_id varchar(200) not null,
  status varchar(20) not null default 'draft', risk varchar(2) not null, effect varchar(20) not null,
  contract_json jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key(tool_id, tool_version),
  constraint mcp_tool_status_ck check(status in ('draft','review','approved','planned','active','deprecated','removed')),
  constraint mcp_tool_risk_ck check(risk in ('R0','R1','R2')),
  constraint mcp_tool_effect_ck check(effect in ('read','write','approval','destructive'))
);

create table if not exists mcp_kill_switches (
  id uuid primary key default gen_random_uuid(), scope varchar(12) not null, tenant_id varchar(128), tool_id varchar(160), tool_version varchar(40),
  enabled boolean not null default true, reason varchar(300) not null, changed_by varchar(160) not null, correlation_id varchar(160) not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint mcp_kill_scope_ck check(scope in ('global','tenant','tool')),
  constraint mcp_kill_binding_ck check((scope='global' and tenant_id is null and tool_id is null) or (scope='tenant' and tenant_id is not null and tool_id is null) or (scope='tool' and tool_id is not null))
);
create index if not exists mcp_kill_lookup_idx on mcp_kill_switches(enabled,scope,tenant_id,tool_id,tool_version);

create table if not exists mcp_usage_buckets (
  tenant_id varchar(128) not null, tool_id varchar(160) not null, principal_id varchar(160) not null, window_started_at timestamptz not null,
  used_units bigint not null default 0, limit_units bigint not null, updated_at timestamptz not null default now(),
  primary key(tenant_id,tool_id,principal_id,window_started_at), constraint mcp_usage_nonnegative_ck check(used_units >= 0 and limit_units > 0)
);

create table if not exists mcp_audit_events (
  id uuid primary key default gen_random_uuid(), event_type varchar(100) not null, tenant_id varchar(128), tool_id varchar(160) not null,
  tool_version varchar(40) not null, principal_id varchar(160), decision_id varchar(160), correlation_id varchar(160) not null,
  delegation_id varchar(160), outcome varchar(40), detail_json jsonb not null default '{}'::jsonb, occurred_at timestamptz not null default now(),
  constraint mcp_audit_redacted_ck check(detail_json::text !~* '(accessToken|refreshToken|bearer|authorization|password|secret|privateKey|apiKey|cookie)')
);
create index if not exists mcp_audit_correlation_idx on mcp_audit_events(correlation_id,occurred_at);

create or replace function mcp_consume_usage(p_tenant varchar,p_tool varchar,p_principal varchar,p_units bigint,p_correlation varchar)
returns table(allowed boolean,remaining bigint) language plpgsql as $$
declare bucket_start timestamptz := date_trunc('minute',now()); current_used bigint; current_limit bigint;
begin
  insert into mcp_usage_buckets(tenant_id,tool_id,principal_id,window_started_at,used_units,limit_units) values(p_tenant,p_tool,p_principal,bucket_start,0,100)
  on conflict do nothing;
  select used_units,limit_units into current_used,current_limit from mcp_usage_buckets where tenant_id=p_tenant and tool_id=p_tool and principal_id=p_principal and window_started_at=bucket_start for update;
  if current_used + p_units > current_limit then return query select false,current_limit-current_used; return; end if;
  update mcp_usage_buckets set used_units=used_units+p_units,updated_at=now() where tenant_id=p_tenant and tool_id=p_tool and principal_id=p_principal and window_started_at=bucket_start;
  return query select true,current_limit-current_used-p_units;
end $$;
