"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { Pool } = require("pg");
const { runSqlMigrations } = require("../runtime/migrations");

const run = process.env.DATABASE_URL ? test : test.skip;

function quoteIdent(value) { return '"' + String(value).replace(/"/g, '""') + '"'; }

run("all migrations create nullable global role-label version rows and partial uniqueness is idempotent", async () => {
  const schema = `role_label_migration_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const admin = new Pool({ connectionString: process.env.DATABASE_URL });
  await admin.query(`create schema ${quoteIdent(schema)}`);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const wrappedPool = {
    async connect() {
      const client = await pool.connect();
      await client.query(`set search_path to ${quoteIdent(schema)}`);
      return client;
    },
  };
  try {
    await runSqlMigrations({ pool: wrappedPool, logger: { log() {} } });
    await runSqlMigrations({ pool: wrappedPool, logger: { log() {} } });

    const global = await admin.query(`select scope, logto_organization_id, version from ${quoteIdent(schema)}.civitas_role_label_versions where scope='global'`);
    assert.equal(global.rowCount, 1);
    assert.equal(global.rows[0].logto_organization_id, null);

    await admin.query(`insert into ${quoteIdent(schema)}.civitas_role_label_versions(scope, logto_organization_id, version) values('organization', 'org-a', 0)`);
    await assert.rejects(
      () => admin.query(`insert into ${quoteIdent(schema)}.civitas_role_label_versions(scope, logto_organization_id, version) values('global', null, 0)`),
      (error) => error.code === "23505",
    );
    await assert.rejects(
      () => admin.query(`insert into ${quoteIdent(schema)}.civitas_role_label_versions(scope, logto_organization_id, version) values('organization', 'org-a', 0)`),
      (error) => error.code === "23505",
    );
    const idempotent = await admin.query(`select count(*)::int as count from ${quoteIdent(schema)}.civitas_role_label_versions where scope='global' and logto_organization_id is null`);
    assert.equal(idempotent.rows[0].count, 1);
  } finally {
    await pool.end();
    await admin.query(`drop schema if exists ${quoteIdent(schema)} cascade`);
    await admin.end();
  }
});
