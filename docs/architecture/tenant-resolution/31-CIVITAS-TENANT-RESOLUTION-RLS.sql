
-- CIVITAS — Tenant Resolution RLS policies
-- Código: TR-31
-- Requiere que los roles runtime sean aprovisionados por infraestructura.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'civitas_tenant_runtime') THEN
    RAISE EXCEPTION 'Missing database role civitas_tenant_runtime';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'civitas_worker_runtime') THEN
    RAISE EXCEPTION 'Missing database role civitas_worker_runtime';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'civitas_tenant_resolver') THEN
    RAISE EXCEPTION 'Missing database role civitas_tenant_resolver';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'civitas_owner_runtime') THEN
    RAISE EXCEPTION 'Missing database role civitas_owner_runtime';
  END IF;
END;
$$;

ALTER TABLE tenant_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_auth_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_auth_transactions FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_auth_handoff_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_auth_handoff_tickets FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_sessions_tenant_isolation
ON tenant_sessions
FOR ALL
TO civitas_tenant_runtime, civitas_worker_runtime
USING (
  organization_id = current_setting('app.organization_id', true)::uuid
)
WITH CHECK (
  organization_id = current_setting('app.organization_id', true)::uuid
);

CREATE POLICY tenant_auth_transactions_tenant_isolation
ON tenant_auth_transactions
FOR ALL
TO civitas_tenant_runtime, civitas_worker_runtime
USING (
  organization_id = current_setting('app.organization_id', true)::uuid
)
WITH CHECK (
  organization_id = current_setting('app.organization_id', true)::uuid
);

CREATE POLICY tenant_auth_handoff_tickets_tenant_isolation
ON tenant_auth_handoff_tickets
FOR ALL
TO civitas_tenant_runtime, civitas_worker_runtime
USING (
  organization_id = current_setting('app.organization_id', true)::uuid
)
WITH CHECK (
  organization_id = current_setting('app.organization_id', true)::uuid
);

REVOKE ALL ON organization_tenant_states FROM PUBLIC;
REVOKE ALL ON organization_hostnames FROM PUBLIC;
REVOKE ALL ON tenant_sessions FROM PUBLIC;
REVOKE ALL ON tenant_auth_transactions FROM PUBLIC;
REVOKE ALL ON tenant_auth_handoff_tickets FROM PUBLIC;

GRANT SELECT ON organization_tenant_states, organization_hostnames
TO civitas_tenant_resolver;

GRANT SELECT, INSERT, UPDATE, DELETE
ON tenant_sessions, tenant_auth_transactions, tenant_auth_handoff_tickets
TO civitas_tenant_runtime, civitas_worker_runtime;

GRANT SELECT, INSERT, UPDATE, DELETE
ON organization_tenant_states, organization_hostnames,
   tenant_hostname_change_runs, tenant_sessions,
   tenant_auth_transactions, tenant_auth_handoff_tickets
TO civitas_owner_runtime;

COMMIT;

-- Runtime transaction contract:
-- BEGIN;
-- SET LOCAL app.organization_id = '<operational_tenants.id>';
-- ... tenant-scoped queries ...
-- COMMIT;
--
-- The pool must never use SET without LOCAL and must reset/rollback failed
-- transactions before returning a connection.
