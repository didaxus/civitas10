const test = require("node:test");
const assert = require("node:assert/strict");

const {
  REQUIRED_OPERATIONAL_SCHEMA,
  assertOperationalSchema,
  runSqlMigrations,
  shouldRunMigrations,
} = require("../runtime/migrations");
const { classifyDatabaseError, sanitizeDatabaseError } = require("../lib/db");

test("operational schema guard requires operational_operations columns queried by owner endpoints", async () => {
  assert.ok(REQUIRED_OPERATIONAL_SCHEMA.operational_operations.includes("logto_organization_id"));
  assert.ok(REQUIRED_OPERATIONAL_SCHEMA.operational_operations.includes("queue_name"));
  assert.ok(REQUIRED_OPERATIONAL_SCHEMA.operational_operations.includes("updated_at"));

  const pool = {
    async query() {
      return {
        rows: REQUIRED_OPERATIONAL_SCHEMA.operational_operations
          .filter((column) => column !== "queue_name")
          .map((column) => ({ table_name: "operational_operations", column_name: column })),
      };
    },
  };

  await assert.rejects(() => assertOperationalSchema({ pool }), (error) => {
    assert.equal(error.name, "DatabaseSchemaError");
    assert.ok(error.details.missingTables.includes("audit_logs"));
    assert.ok(error.details.missingTables.includes("operational_operation_steps"));
    assert.ok(error.details.missingTables.includes("organization_provisioning_drafts"));
    assert.ok(error.details.missingTables.includes("module_catalog"));
    assert.ok(error.details.missingTables.includes("organization_module_runtime_bindings"));
    assert.deepEqual(error.details.missingColumns.operational_operations, ["queue_name"]);
    assert.equal(error.details.expectedMigration, "backend/db/migrations/0000_foundation.sql");
    return true;
  });
});

test("migration startup flag is explicit and database errors are classified without secrets", () => {
  assert.equal(shouldRunMigrations({ RUN_MIGRATIONS_ON_STARTUP: "true" }), true);
  assert.equal(shouldRunMigrations({ RUN_MIGRATIONS_ON_STARTUP: "false" }), false);
  assert.equal(classifyDatabaseError({ code: "42P01" }), "relation_does_not_exist");
  assert.equal(classifyDatabaseError({ code: "42703" }), "column_does_not_exist");
  assert.deepEqual(sanitizeDatabaseError({ message: "relation missing", code: "42P01", table: "operational_operations", password: "secret" }), {
    message: "relation missing",
    code: "42P01",
    table: "operational_operations",
  });
});

test("foundation migration is safe for existing connector binding tables before capability backfill", async () => {
  const fs = require("node:fs/promises");
  const path = require("node:path");
  const foundationSql = await fs.readFile(path.join(__dirname, "..", "db", "migrations", "0000_foundation.sql"), "utf8");
  const addColumnIndex = foundationSql.indexOf("add column if not exists capability_id");
  const orgCapabilityIndex = foundationSql.indexOf("registry_bindings_org_capability_idx");

  assert.ok(addColumnIndex > 0, "0000 must repair pre-existing bindings tables before indexes use capability_id");
  assert.ok(orgCapabilityIndex > addColumnIndex, "capability_id must exist before registry_bindings_org_capability_idx is created");
});

test("connector capability migration validates backfill before enforcing not null", async () => {
  const fs = require("node:fs/promises");
  const path = require("node:path");
  const migrationSql = await fs.readFile(path.join(__dirname, "..", "db", "migrations", "0001_connector_org_capability_resolution.sql"), "utf8");
  const validationIndex = migrationSql.indexOf("existing bindings cannot be backfilled");
  const notNullIndex = migrationSql.indexOf("alter column capability_id set not null");

  assert.ok(validationIndex > 0, "0001 must raise an operable error for unbackfillable bindings");
  assert.ok(notNullIndex > validationIndex, "0001 must validate backfill before enforcing NOT NULL");
});


test("migration failures include filename, PostgreSQL code, phase and schema expectation", async () => {
  const queries = [];
  const pool = {
    async query(sql) {
      queries.push(sql);
      if (String(sql).startsWith("insert into schema_migrations")) return { rows: [{ migration: "claimed" }] };
      if (String(sql).includes("0016 failure sentinel")) {
        const error = new Error("column \"state\" does not exist");
        error.code = "42703";
        throw error;
      }
      return { rows: [] };
    },
  };
  const fs = require("node:fs/promises");
  const path = require("node:path");
  const migrationPath = path.join(__dirname, "..", "db", "migrations", "0016_authorization_scope_assignments_contract.sql");
  const original = await fs.readFile(migrationPath, "utf8");
  await fs.writeFile(migrationPath, "-- 0016 failure sentinel");
  try {
    await assert.rejects(() => runSqlMigrations({ pool, logger: { log() {} } }), (error) => {
      assert.equal(error.name, "DatabaseMigrationError");
      assert.equal(error.details.migration, "0016_authorization_scope_assignments_contract.sql");
      assert.equal(error.details.postgresCode, "42703");
      assert.equal(error.details.statementPhase, "apply migration SQL");
      assert.match(error.details.schemaExpectation, /status/);
      return true;
    });
  } finally {
    await fs.writeFile(migrationPath, original);
  }
  assert.ok(queries.length > 0);
});

test("SQL migrator serializes backend and worker startup with a PostgreSQL advisory lock", async () => {
  const queries = [];
  const pool = {
    async query(sql) {
      queries.push(String(sql));
      if (String(sql).startsWith("insert into schema_migrations")) return { rows: [{ migration: "claimed" }] };
      return { rows: [] };
    },
  };

  await Promise.all([
    runSqlMigrations({ pool, logger: { log() {} } }),
    runSqlMigrations({ pool, logger: { log() {} } }),
  ]);

  assert.equal(queries.filter((sql) => sql.includes("pg_advisory_lock")).length, 2);
  assert.equal(queries.filter((sql) => sql.includes("pg_advisory_unlock")).length, 2);
  assert.ok(queries.indexOf("select pg_advisory_lock(hashtext('civitas10:sql-migrations'))") < queries.indexOf("select pg_advisory_unlock(hashtext('civitas10:sql-migrations'))"));
});

test("identity federation migration defines dedicated tables, constraints, and indexes", async () => {
  const fs = require("node:fs/promises");
  const path = require("node:path");
  const migrationSql = await fs.readFile(path.join(__dirname, "..", "db", "migrations", "0022_identity_federation_core.sql"), "utf8");

  for (const table of [
    "organization_identity_connections",
    "organization_external_role_mappings",
    "organization_federated_assignment_sources",
  ]) assert.match(migrationSql, new RegExp(`create table if not exists ${table}`));

  for (const column of ["version", "created_at", "updated_at"]) assert.match(migrationSql, new RegExp(`${column} .*not null`, "i"));
  assert.match(migrationSql, /protocol in \('oidc','saml'\)/);
  assert.match(migrationSql, /status in \('draft','validating','ready','active','degraded','suspended','rotating_credentials','decommissioning','archived'\)/);
  assert.match(migrationSql, /source_kind in \('manual','federated_jit','federated_login_reconciliation','directory_sync_scim','provider_api_sync','bootstrap_profile','support_override'\)/);
  assert.match(migrationSql, /assignment_kind in \('organization_role','data_scope_assignment','organization_membership'\)/);
  assert.match(migrationSql, /canonical_role_key <> 'owner_global'/);
  assert.match(migrationSql, /canonical_role_key like 'organization\\_%' escape '\\'/);
  assert.match(migrationSql, /secret_reference varchar\(255\)/);
  assert.doesNotMatch(migrationSql, /client_secret\s+varchar|client_secret\s+text|secret\s+varchar|secret\s+text/i);

  for (const index of [
    "organization_identity_connections_org_status_idx",
    "organization_external_role_mappings_group_role_uidx",
    "organization_external_role_mappings_role_idx",
    "organization_federated_assignment_sources_active_uidx",
    "organization_federated_assignment_sources_user_idx",
  ]) assert.match(migrationSql, new RegExp(index));
});

test("identity federation Drizzle schema is exported with secret references only", () => {
  const schema = require("../db/schema");
  assert.ok(schema.organizationIdentityConnections);
  assert.ok(schema.organizationExternalRoleMappings);
  assert.ok(schema.organizationFederatedAssignmentSources);

  const connectionColumns = Object.keys(schema.organizationIdentityConnections);
  assert.ok(connectionColumns.includes("secretReference"));
  assert.equal(connectionColumns.includes("clientSecret"), false);
  assert.equal(connectionColumns.includes("secret"), false);

  const roleMappingColumns = Object.keys(schema.organizationExternalRoleMappings);
  assert.ok(roleMappingColumns.includes("canonicalRoleKey"));
  assert.ok(roleMappingColumns.includes("version"));

  const sourceColumns = Object.keys(schema.organizationFederatedAssignmentSources);
  for (const column of ["assignmentKind", "assignmentKey", "sourceKind", "mappingVersion", "version", "createdAt", "updatedAt"]) {
    assert.ok(sourceColumns.includes(column), column);
  }
});
