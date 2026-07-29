"use strict";

const { randomUUID, createHash } = require("node:crypto");
const { Planning } = require("../domain/planning");
const { ERROR_CODES, PlanningDomainError } = require("../domain/errors");

function digest(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

function createPostgresPlanningPersistence({ pool }) {
  if (!pool || typeof pool.connect !== "function") throw new TypeError("A pg Pool is required");

  async function transaction(work) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const ports = bind(client);
      const result = await work(ports);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
  }

  function bind(db) {
    const persistencePort = {
      transaction,
      async findById(organizationId, planId, { forUpdate = false } = {}) {
        const plan = await db.query(`select * from planning_plans where organization_id=$1 and id=$2${forUpdate ? " for update" : ""}`, [organizationId, planId]);
        if (!plan.rowCount) return null;
        const versions = await db.query("select * from planning_versions where organization_id=$1 and plan_id=$2 order by version", [organizationId, planId]);
        return Planning.restore(mapAggregate(plan.rows[0], versions.rows));
      },
      async save(aggregate, { expectedRevision = aggregate.revision - 1 } = {}) {
        const snapshot = aggregate.toSnapshot();
        const update = await db.query(`update planning_plans set profile_id=$3,name=$4,state=$5,current_version=$6,revision=$7,updated_at=$8
          where organization_id=$1 and id=$2 and revision=$9`, [snapshot.organizationId, snapshot.id, snapshot.profileId, snapshot.name, snapshot.state, snapshot.currentVersion, snapshot.revision, snapshot.updatedAt, expectedRevision]);
        if (!update.rowCount) {
          const insert = expectedRevision === 0 && await db.query(`insert into planning_plans(organization_id,id,profile_id,name,state,current_version,revision,created_at,updated_at)
            values($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict do nothing`, [snapshot.organizationId, snapshot.id, snapshot.profileId, snapshot.name, snapshot.state, snapshot.currentVersion, snapshot.revision, snapshot.createdAt, snapshot.updatedAt]);
          if (!insert?.rowCount) throw new PlanningDomainError(ERROR_CODES.VERSION_CONFLICT, "Planning aggregate was concurrently modified");
        }
        for (const version of snapshot.versions) {
          await db.query(`insert into planning_versions(organization_id,plan_id,version,state,content,created_by,created_at,approved_by,approved_at)
            values($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (organization_id,plan_id,version) do update
            set state=excluded.state,approved_by=excluded.approved_by,approved_at=excluded.approved_at
            where planning_versions.state <> 'approved'`, [snapshot.organizationId, snapshot.id, version.version, version.state, version.content, version.createdBy, version.createdAt, version.approvedBy || null, version.approvedAt || null]);
        }
        return aggregate;
      },
      async createPlan(input) {
        const profileId = input.profileId || "default";
        await db.query("insert into planning_profiles(organization_id,id) values($1,$2) on conflict do nothing", [input.organizationId, profileId]);
        const aggregate = Planning.create({ organizationId: input.organizationId, id: input.planId || input.id, profileId, name: input.name || input.title, content: input.content || input.payload || {}, actorId: input.actorId || "system" });
        await persistencePort.save(aggregate, { expectedRevision: 0 });
        return dto(aggregate);
      },
      async readPlan({ organizationId, planId }) { const item = await persistencePort.findById(organizationId, planId); return item && dto(item); },
      async listPlans({ organizationId, constraints = {} }) {
        const values = [organizationId, constraints.limit || 50];
        const result = await db.query(`select * from planning_plans where organization_id=$1 ${constraints.includeArchived ? "" : "and state <> 'archived'"} order by updated_at desc limit $2`, values);
        return { items: result.rows.map((row) => ({ organizationId: row.organization_id, planId: row.id, profileId: row.profile_id, name: row.name, status: row.state, version: row.revision, updatedAt: row.updated_at })), nextCursor: null };
      },
      async updatePlan(input) {
        const aggregate = await persistencePort.findById(input.organizationId, input.planId, { forUpdate: true });
        if (!aggregate) return null;
        const expected = Number(input.ifMatch);
        if (aggregate.revision !== expected) throw new PlanningDomainError(ERROR_CODES.VERSION_CONFLICT, "ETag does not match");
        aggregate.revise({ content: input.content || input.payload || {}, actorId: input.actorId || "system" });
        await persistencePort.save(aggregate, { expectedRevision: expected });
        return dto(aggregate);
      },
      async readProfile({ organizationId, profileId = "default" }) {
        const result = await db.query("select * from planning_profiles where organization_id=$1 and id=$2", [organizationId, profileId]);
        return result.rowCount ? profileDto(result.rows[0]) : null;
      },
      async replaceProfile(input) {
        const id = input.profileId || "default";
        const result = await db.query(`insert into planning_profiles(organization_id,id,configuration) values($1,$2,$3)
          on conflict (organization_id,id) do update set configuration=excluded.configuration,version=planning_profiles.version+1,updated_at=now()
          where $4::integer is null or planning_profiles.version=$4 returning *`, [input.organizationId, id, input.configuration || input.profile || {}, input.ifMatch ? Number(input.ifMatch) : null]);
        if (!result.rowCount) throw new PlanningDomainError(ERROR_CODES.VERSION_CONFLICT, "Profile was concurrently modified");
        return profileDto(result.rows[0]);
      },
    };

    const auditPort = { record: async (entry) => db.query(`insert into planning_audit(organization_id,id,plan_id,action,actor_id,aggregate_revision,details,correlation_id)
      values($1,$2,$3,$4,$5,$6,$7,$8)`, [entry.organizationId, randomUUID(), entry.targetId || null, entry.action, entry.actorId || "system", entry.aggregateRevision || null, entry.details || {}, entry.correlationId]) };
    const outboxPort = { enqueue: async (event) => db.query(`insert into integration_outbox_events(event_id,event_type,schema_version,logto_organization_id,aggregate_type,aggregate_id,aggregate_version,actor_json,correlation_id,source_json,sensitivity,payload)
      values($1,$2,'1',$3,$4,$5,$6,$7,$8,$9,'internal',$10)`, [randomUUID(), event.type, event.organizationId, event.aggregateType || "planning.plan", event.aggregateId, String(event.aggregateVersion || event.payload?.version || 1), event.actor || { type: "system" }, event.correlationId, { moduleId: "planning", component: "postgres-adapter" }, event.payload || {}]) };
    const idempotencyLedgerPort = {
      lookup: async ({ organizationId, key }) => { if (!key) return null; const result = await db.query("select * from planning_idempotency where organization_id=$1 and idempotency_key=$2", [organizationId, key]); return result.rowCount ? { fingerprint: result.rows[0].fingerprint, result: result.rows[0].result } : null; },
      recordSuccess: async ({ organizationId, key, fingerprint, result }) => db.query("insert into planning_idempotency(organization_id,idempotency_key,fingerprint,result) values($1,$2,$3,$4)", [organizationId, key, fingerprint || digest(result), result]),
    };
    return { persistencePort, auditPort, outboxPort, idempotencyLedgerPort, concurrencyPort: { assertIfMatch: async () => true } };
  }

  const root = bind(pool);
  return { ...root.persistencePort, ...root, transaction, executeAtomically: transaction };
}

function mapAggregate(plan, versions) { return { organizationId: plan.organization_id, id: plan.id, profileId: plan.profile_id, name: plan.name, state: plan.state, currentVersion: plan.current_version, revision: plan.revision, createdAt: plan.created_at, updatedAt: plan.updated_at, versions: versions.map((v) => ({ version: v.version, state: v.state, content: v.content, createdBy: v.created_by, createdAt: v.created_at, approvedBy: v.approved_by, approvedAt: v.approved_at })) }; }
function dto(aggregate) { const s = aggregate.toSnapshot(); const current = s.versions.find((v) => v.version === s.currentVersion); return { organizationId: s.organizationId, planId: s.id, profileId: s.profileId, name: s.name, status: s.state, content: current.content, version: s.revision, planVersion: s.currentVersion, updatedAt: s.updatedAt }; }
function profileDto(row) { return { organizationId: row.organization_id, profileId: row.id, configuration: row.configuration, version: row.version, updatedAt: row.updated_at }; }

module.exports = { createPostgresPlanningPersistence };
