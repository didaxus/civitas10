create table if not exists scim_users (
  id varchar(128) primary key,
  connection_id uuid not null references organization_identity_connections(id) on delete cascade,
  external_id varchar(255),
  user_name varchar(255) not null,
  normalized_user_name varchar(255) not null,
  active boolean not null default true,
  resource jsonb not null default '{}'::jsonb,
  version bigint not null default 1,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scim_users_connection_external_id_uidx unique (connection_id, external_id),
  constraint scim_users_connection_normalized_user_name_uidx unique (connection_id, normalized_user_name)
);
create index if not exists scim_users_connection_active_idx on scim_users(connection_id, active);

create table if not exists scim_idempotency_ledger (
  connection_id uuid not null references organization_identity_connections(id) on delete cascade,
  idempotency_key varchar(220) not null,
  method varchar(16) not null,
  path text not null,
  response_status integer not null,
  response_body jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (connection_id, idempotency_key)
);
