"use strict";

const { randomUUID, createHash } = require("node:crypto");
const { Planning, PLANNING_STATES } = require("../domain/planning");
const { ERROR_CODES, PlanningDomainError } = require("../domain/errors");

function digest(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function encodeCursor(row) { return Buffer.from(JSON.stringify({ updatedAt: new Date(row.updated_at).toISOString(), id: row.id })).toString("base64url"); }
function decodeCursor(cursor) {
  if (!cursor) return null;
  try { const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")); if (typeof value.id !== "string" || typeof value.updatedAt !== "string" || Number.isNaN(Date.parse(value.updatedAt))) throw new Error(); return value; }
  catch { throw new PlanningDomainError(ERROR_CODES.INVALID_ARGUMENT, "Planning cursor is invalid"); }
}

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
        const update = await db.query(`update planning_plans set profile_id=$3,name=$4,plan_type=$5,state=$6,current_version=$7,revision=$8,updated_at=$9
          where organization_id=$1 and id=$2 and revision=$10`, [snapshot.organizationId, snapshot.id, snapshot.profileId, snapshot.name, snapshot.planType, snapshot.state, snapshot.currentVersion, snapshot.revision, snapshot.updatedAt, expectedRevision]);
        if (!update.rowCount) {
          const insert = expectedRevision === 0 && await db.query(`insert into planning_plans(organization_id,id,profile_id,name,plan_type,state,current_version,revision,created_at,updated_at)
            values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict do nothing`, [snapshot.organizationId, snapshot.id, snapshot.profileId, snapshot.name, snapshot.planType, snapshot.state, snapshot.currentVersion, snapshot.revision, snapshot.createdAt, snapshot.updatedAt]);
          if (!insert?.rowCount) throw new PlanningDomainError(ERROR_CODES.VERSION_CONFLICT, "Planning aggregate was concurrently modified");
        }
        for (const version of snapshot.versions) {
          const existing = await db.query("select state,content,approved_by,approved_at from planning_versions where organization_id=$1 and plan_id=$2 and version=$3", [snapshot.organizationId, snapshot.id, version.version]);
          if (existing.rows[0]?.state === PLANNING_STATES.APPROVED) {
            const row=existing.rows[0];
            if (version.state !== PLANNING_STATES.APPROVED || JSON.stringify(row.content) !== JSON.stringify(version.content) || row.approved_by !== version.approvedBy || new Date(row.approved_at).getTime() !== new Date(version.approvedAt).getTime()) throw new PlanningDomainError(ERROR_CODES.APPROVED_VERSION_IMMUTABLE, "Approved versions cannot be modified");
            continue;
          }
          await db.query(`insert into planning_versions(organization_id,plan_id,version,state,content,created_by,created_at,approved_by,approved_at,source_version,source_hash,source_actor,source_at,source_reason)
            values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) on conflict (organization_id,plan_id,version) do update
            set state=excluded.state,approved_by=excluded.approved_by,approved_at=excluded.approved_at`, [snapshot.organizationId, snapshot.id, version.version, version.state, version.content, version.createdBy, version.createdAt, version.approvedBy || null, version.approvedAt || null, version.sourceVersion || null, version.sourceHash || null, version.sourceActor || null, version.sourceAt || null, version.sourceReason || null]);
        }
        return aggregate;
      },
      async createPlan(input) {
        const profileId = input.profileId || "default";
        await db.query("insert into planning_profiles(organization_id,id) values($1,$2) on conflict do nothing", [input.organizationId, profileId]);
        const suppliedContent = input.content ?? input.payload ?? {};
        const content = Object.prototype.hasOwnProperty.call(input, "description") ? { ...suppliedContent, description: input.description } : suppliedContent;
        const aggregate = Planning.create({ organizationId: input.organizationId, id: input.planId || input.id, profileId, name: input.name || input.title, planType:input.planType || "operational", content, actorId: input.actorId || "system" });
        await persistencePort.save(aggregate, { expectedRevision: 0 });
        return dto(aggregate);
      },
      async readPlan({ organizationId, planId }) { const item = await persistencePort.findById(organizationId, planId); return item && dto(item); },
      async listPlans({ organizationId, constraints = {} }) {
        const limit = constraints.limit || 50;
        const cursor = decodeCursor(constraints.cursor);
        const values = [organizationId, limit + 1];
        const cursorClause = cursor ? "and (p.updated_at,p.id) < ($3::timestamptz,$4)" : "";
        if (cursor) values.push(cursor.updatedAt, cursor.id);
        const result = await db.query(`select p.*,v.content from planning_plans p join planning_versions v on v.organization_id=p.organization_id and v.plan_id=p.id and v.version=p.current_version where p.organization_id=$1 ${constraints.includeArchived ? "" : "and p.state <> 'archived'"} ${cursorClause} order by p.updated_at desc,p.id desc limit $2`, values);
        const hasMore = result.rows.length > limit;
        const rows = result.rows.slice(0, limit);
        return { items: rows.map((row) => ({ organizationId: row.organization_id, planId: row.id, profileId: row.profile_id, name: row.name, planType: row.plan_type, description: row.content?.description ?? null, status: row.state, content: row.content, version: row.revision, updatedAt: row.updated_at })), page: { nextCursor: hasMore ? encodeCursor(rows.at(-1)) : null, hasMore } };
      },
      async updatePlan(input) {
        const aggregate = await persistencePort.findById(input.organizationId, input.planId, { forUpdate: true });
        if (!aggregate) return null;
        const expected = Number(input.ifMatch);
        if (aggregate.revision !== expected) throw new PlanningDomainError(ERROR_CODES.VERSION_CONFLICT, "ETag does not match");
        const snapshot = aggregate.toSnapshot();
        const current = snapshot.versions.find((version) => version.version === snapshot.currentVersion)?.content || {};
        const suppliedContent = input.content ?? input.payload;
        const content = suppliedContent ?? (Object.prototype.hasOwnProperty.call(input, "description") ? { ...current, description: input.description } : current);
        aggregate.revise({ content, name: input.title ?? input.name ?? aggregate.name, actorId: input.actorId || "system" });
        await persistencePort.save(aggregate, { expectedRevision: expected });
        return dto(aggregate);
      },
      async readProfile({ organizationId, profileId = "default" }) {
        const result = await db.query("select * from planning_profiles where organization_id=$1 and id=$2", [organizationId, profileId]);
        return result.rowCount ? profileDto(result.rows[0]) : null;
      },
      async replaceProfile(input) {
        const id = input.profileId || "default";
        const configuration = input.configuration ?? input.profile ?? { planningMode: input.planningMode, preferences: input.preferences || {} };
        const result = await db.query(`insert into planning_profiles(organization_id,id,configuration) values($1,$2,$3)
          on conflict (organization_id,id) do update set configuration=excluded.configuration,version=planning_profiles.version+1,updated_at=now()
          where planning_profiles.version=$4 returning *`, [input.organizationId, id, configuration, input.ifMatch ? Number(input.ifMatch) : 1]);
        if (!result.rowCount) throw new PlanningDomainError(ERROR_CODES.VERSION_CONFLICT, "Profile was concurrently modified");
        return profileDto(result.rows[0]);
      },
    };

    const auditPort = { record: async (entry) => db.query(`insert into planning_audit(organization_id,id,plan_id,action,actor_id,aggregate_revision,details,correlation_id)
      values($1,$2,$3,$4,$5,$6,$7,$8)`, [entry.organizationId, randomUUID(), entry.targetId || null, entry.action, entry.actorId || "system", entry.aggregateRevision || null, entry.details || {}, entry.correlationId]) };
    const outboxPort = { enqueue: async (event) => db.query(`insert into integration_outbox_events(event_id,event_type,schema_version,logto_organization_id,aggregate_type,aggregate_id,aggregate_version,actor_json,correlation_id,source_json,sensitivity,payload)
      values($1,$2,'1',$3,$4,$5,$6,$7,$8,$9,'internal',$10)`, [randomUUID(), event.type, event.organizationId, event.aggregateType || "planning.plan", event.aggregateId, String(event.aggregateVersion || event.payload?.version || 1), event.actor || { type: "system" }, event.correlationId, { moduleId: "planning", component: "postgres-adapter" }, event.payload || {}]) };
    const idempotencyLedgerPort = {
      lookup: async ({ organizationId, principalId, operationId, key }) => { if (!key) return null; const result = await db.query("select * from planning_idempotency where organization_id=$1 and principal_id=$2 and operation_id=$3 and idempotency_key=$4", [organizationId, principalId, operationId, key]); return result.rowCount ? { fingerprint: result.rows[0].fingerprint, result: result.rows[0].result } : null; },
      recordSuccess: async ({ organizationId, principalId, operationId, key, fingerprint, result }) => db.query("insert into planning_idempotency(organization_id,principal_id,operation_id,idempotency_key,fingerprint,result) values($1,$2,$3,$4,$5,$6)", [organizationId, principalId, operationId, key, fingerprint || digest(result), result]),
    };
    const concurrencyPort = { assertIfMatch: async ({ organizationId, aggregateType, aggregateId, ifMatch }) => {
      if (ifMatch == null) throw new PlanningDomainError(ERROR_CODES.VERSION_CONFLICT, "If-Match is required");
      const result = aggregateType === "planning.profile"
        ? await db.query("select version from planning_profiles where organization_id=$1 and id='default' for update", [organizationId])
        : await db.query("select revision as version from planning_plans where organization_id=$1 and id=$2 for update", [organizationId, aggregateId]);
      if (!result.rowCount || String(result.rows[0].version) !== String(ifMatch)) throw new PlanningDomainError(ERROR_CODES.VERSION_CONFLICT, "ETag does not match");
      return true;
    } };
    return { persistencePort, auditPort, outboxPort, idempotencyLedgerPort, concurrencyPort };
  }

  const root = bind(pool);
  return { ...root.persistencePort, ...root, transaction, executeAtomically: transaction };
}

function mapAggregate(plan, versions) { return { organizationId: plan.organization_id, id: plan.id, profileId: plan.profile_id, name: plan.name, planType:plan.plan_type, state: plan.state, currentVersion: plan.current_version, revision: plan.revision, createdAt: plan.created_at, updatedAt: plan.updated_at, versions: versions.map((v) => ({ version: v.version, state: v.state, content: v.content, createdBy: v.created_by, createdAt: v.created_at, approvedBy: v.approved_by, approvedAt: v.approved_at, sourceVersion:v.source_version, sourceHash:v.source_hash, sourceActor:v.source_actor, sourceAt:v.source_at, sourceReason:v.source_reason })) }; }
function dto(aggregate) { const s = aggregate.toSnapshot(); const current = s.versions.find((v) => v.version === s.currentVersion); return { organizationId: s.organizationId, planId: s.id, profileId: s.profileId, name: s.name, title: s.name, planType: s.planType, description: current.content?.description ?? null, status: s.state, content: current.content, version: s.revision, planVersion: s.currentVersion, updatedAt: s.updatedAt }; }
function profileDto(row) { return { organizationId: row.organization_id, profileId: row.id, configuration: row.configuration, version: row.version, updatedAt: row.updated_at }; }

module.exports = { createPostgresPlanningPersistence };
