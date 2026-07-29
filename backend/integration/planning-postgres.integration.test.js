"use strict";
const { test, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const { Pool } = require("pg");
const { runSqlMigrations } = require("../runtime/migrations");
const { Planning, PLANNING_STATES, ERROR_CODES } = require("../planning/domain");
const { createPostgresPlanningPersistence } = require("../planning/infrastructure/postgresPersistenceAdapter");

if (!process.env.DATABASE_URL) { test("Planning PostgreSQL integration requires DATABASE_URL", { skip: "DATABASE_URL not configured" }, () => {}); return; }
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
const adapter = createPostgresPlanningPersistence({ pool });
before(async () => runSqlMigrations({ pool, logger: { log() {} } }));
beforeEach(async () => pool.query("truncate planning_audit,planning_idempotency,planning_versions,planning_plans,planning_profiles restart identity cascade"));
after(async () => pool.end());

async function seed(org, content = { tenant: org }) {
  await pool.query("insert into planning_profiles(organization_id,id) values($1,'profile')", [org]);
  const item = Planning.create({ organizationId: org, id: "colliding-id", profileId: "profile", name: "Plan", content, actorId: "actor" });
  await adapter.save(item, { expectedRevision: 0 }); return item;
}

test("colliding identifiers remain isolated between two tenants", async () => {
  await seed("tenant-a"); await seed("tenant-b");
  assert.equal((await adapter.findById("tenant-a", "colliding-id")).versions[0].content.tenant, "tenant-a");
  assert.equal((await adapter.findById("tenant-b", "colliding-id")).versions[0].content.tenant, "tenant-b");
});

test("an invalid transition performs no PostgreSQL write", async () => {
  const item = await seed("tenant-a");
  assert.throws(() => item.transition(PLANNING_STATES.APPROVED, { actorId: "reviewer" }), { code: ERROR_CODES.INVALID_TRANSITION });
  assert.equal((await adapter.findById("tenant-a", "colliding-id")).state, PLANNING_STATES.DRAFT);
  assert.equal((await pool.query("select count(*)::integer as count from planning_versions where organization_id='tenant-a'")).rows[0].count, 1);
});

test("optimistic concurrency permits one writer and preserves history", async () => {
  await seed("tenant-a");
  const [left, right] = await Promise.all([adapter.findById("tenant-a", "colliding-id"), adapter.findById("tenant-a", "colliding-id")]);
  left.revise({ content: { writer: "left" }, actorId: "left" }); right.revise({ content: { writer: "right" }, actorId: "right" });
  const outcomes = await Promise.allSettled([adapter.save(left, { expectedRevision: 1 }), adapter.save(right, { expectedRevision: 1 })]);
  assert.equal(outcomes.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(outcomes.find((x) => x.status === "rejected").reason.code, ERROR_CODES.VERSION_CONFLICT);
  assert.equal((await adapter.findById("tenant-a", "colliding-id")).versions.length, 2);
});

test("unit of work rolls back aggregate, audit, outbox and idempotency", async () => {
  await assert.rejects(() => adapter.transaction(async (tx) => {
    const created = await tx.persistencePort.createPlan({ organizationId: "tenant-a", planId: "rollback", profileId: "profile", name: "Rollback", content: {}, actorId: "actor" });
    await tx.auditPort.record({ organizationId: "tenant-a", targetId: created.planId, action: "planning.plan.created", actorId: "actor", correlationId: "corr" });
    await tx.outboxPort.enqueue({ type: "planning.plan.created", organizationId: "tenant-a", aggregateId: created.planId, aggregateVersion: created.version, payload: created, correlationId: "corr" });
    await tx.idempotencyLedgerPort.recordSuccess({ organizationId: "tenant-a", key: "request", fingerprint: "hash", result: created });
    throw new Error("force rollback");
  }), /force rollback/);
  for (const table of ["planning_plans", "planning_audit", "planning_idempotency"]) assert.equal((await pool.query(`select 1 from ${table}`)).rowCount, 0);
  assert.equal((await pool.query("select 1 from integration_outbox_events where logto_organization_id='tenant-a' and aggregate_type='planning.plan'")).rowCount, 0);
});

test("database protects approved version history from update and delete", async () => {
  const item = await seed("tenant-a"); item.transition(PLANNING_STATES.IN_REVIEW, { actorId: "actor" }); item.transition(PLANNING_STATES.APPROVED, { actorId: "reviewer" });
  await adapter.save(item, { expectedRevision: 1 });
  await assert.rejects(() => pool.query("update planning_versions set content='{}' where organization_id='tenant-a' and plan_id='colliding-id'"), { code: "23514" });
  await assert.rejects(() => pool.query("delete from planning_versions where organization_id='tenant-a' and plan_id='colliding-id'"), { code: "23514" });
});
