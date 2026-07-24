-- SCIM bearer credentials are tenant-scoped to exactly one identity connection.
-- The opaque secret is returned by the service only when generated; the database stores only a scrypt hash.

create table if not exists scim_connection_credentials (
  id uuid primary key default gen_random_uuid(),
  logto_organization_id varchar(128) not null,
  connection_id uuid not null,
  key_id varchar(80) not null unique,
  secret_hash text not null,
  scopes text[] not null,
  status varchar(40) not null default 'active' check (status in ('active','revoked')),
  cidr_allowlist text[] not null default '{}',
  expires_at timestamptz,
  last_used_at timestamptz,
  last_used_ip varchar(80),
  rotation_of_key_id varchar(80) references scim_connection_credentials(key_id) on delete set null,
  revoked_at timestamptz,
  revoked_reason varchar(160),
  created_by_logto_user_id varchar(128),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (logto_organization_id, id),
  foreign key (logto_organization_id, connection_id) references organization_identity_connections(logto_organization_id, id) on delete cascade,
  check (array_length(scopes, 1) >= 1),
  check (scopes <@ array['scim.users.read','scim.users.write','scim.groups.read','scim.groups.write']::text[])
);

create index if not exists scim_credentials_tenant_connection_idx on scim_connection_credentials(logto_organization_id, connection_id, status);
create index if not exists scim_credentials_expiration_idx on scim_connection_credentials(expires_at) where status = 'active' and expires_at is not null;
