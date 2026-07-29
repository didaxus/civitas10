create table if not exists authorization_delegation_contexts (
 decision_id varchar(80) primary key, actor_subject varchar(128) not null,
 actor_surface varchar(40) not null, client_id varchar(128) not null,
 target_organization_id varchar(128) not null, reason text not null,
 issued_at timestamptz not null, expires_at timestamptz not null,
 allowed_capabilities jsonb not null, denied_effects jsonb not null,
 confirmation_policy varchar(40) not null, status varchar(20) not null default 'active',
 revoked_at timestamptz, created_at timestamptz not null default now(),
 constraint authorization_delegation_context_ttl_ck check(expires_at>issued_at and expires_at<=issued_at+interval '15 minutes'),
 constraint authorization_delegation_context_status_ck check(status in ('active','revoked')),
 constraint authorization_delegation_context_arrays_ck check(jsonb_typeof(allowed_capabilities)='array' and jsonb_typeof(denied_effects)='array')
);
create index if not exists authorization_delegation_context_active_idx on authorization_delegation_contexts(target_organization_id,expires_at) where status='active';
