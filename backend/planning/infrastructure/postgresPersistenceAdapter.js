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
    const reviewRepository = {
      async loadEvents({ organizationId, planId }) {
        const result=await db.query("select payload from planning_review_events where logto_organization_id=$1 and plan_id=$2 order by aggregate_version",[organizationId,planId]);
        return result.rows.map((row)=>row.payload);
      },
      async append({ organizationId, planId, expectedVersion, event }) {
        await db.query("insert into planning_review_streams(logto_organization_id,plan_id,current_version) values($1,$2,0) on conflict do nothing",[organizationId,planId]);
        const locked=await db.query("select current_version from planning_review_streams where logto_organization_id=$1 and plan_id=$2 for update",[organizationId,planId]);
        if (Number(locked.rows[0].current_version)!==Number(expectedVersion)) throw new PlanningDomainError(ERROR_CODES.VERSION_CONFLICT,"Review stream was concurrently modified");
        await db.query("insert into planning_review_events(event_id,logto_organization_id,plan_id,aggregate_version,event_type,payload,occurred_at) values($1,$2,$3,$4,$5,$6,$7)",[event.eventId,organizationId,planId,event.aggregateVersion,event.type,event,event.occurredAt]);
        await projectReviewEvent(db,event);
        await db.query("update planning_review_streams set current_version=$3 where logto_organization_id=$1 and plan_id=$2",[organizationId,planId,event.aggregateVersion]);
      },
    };
    const reviewIdempotencyLedger = {
      async lookup({organizationId,operation,key}) { const r=await db.query("select request_fingerprint,result_json from planning_review_idempotency where logto_organization_id=$1 and operation=$2 and idempotency_key=$3",[organizationId,operation,key]); return r.rowCount?{fingerprint:r.rows[0].request_fingerprint,result:r.rows[0].result_json}:null; },
      async recordSuccess({organizationId,operation,key,fingerprint,result}) { await db.query("insert into planning_review_idempotency(logto_organization_id,operation,idempotency_key,request_fingerprint,result_json) values($1,$2,$3,$4,$5)",[organizationId,operation,key,fingerprint,result]); },
    };
    return { persistencePort, auditPort, outboxPort, idempotencyLedgerPort, reviewRepository, reviewIdempotencyLedger, concurrencyPort: { assertIfMatch: async () => true } };
  }

  const root = bind(pool);
  return { ...root.persistencePort, ...root, transaction, executeAtomically: transaction };
}

async function projectReviewEvent(db,event) {
  const p=[event.organizationId,event.planId];
  if(event.type==='planning.collaborator_added.v1') await db.query("insert into planning_collaborators(logto_organization_id,plan_id,collaborator_id,capabilities) values($1,$2,$3,$4) on conflict(logto_organization_id,plan_id,collaborator_id) do update set capabilities=excluded.capabilities,active=true",[...p,event.collaboratorId,event.capabilities||['edit']]);
  if(event.type==='planning.maker_checker_policy_versioned.v1') await db.query("insert into planning_maker_checker_policies(logto_organization_id,plan_id,version,policy,created_by,created_at) values($1,$2,$3,$4,$5,$6)",[...p,event.policy.version,event.policy,event.actorId,event.occurredAt]);
  if(event.type==='planning.review_assignment_created.v1') await db.query("insert into planning_review_assignments(assignment_id,logto_organization_id,plan_id,assignee_id,assignment_role,plan_version,policy_version,assigned_by) values($1,$2,$3,$4,$5,$6,$7,$8)",[event.assignmentId,...p,event.assigneeId,event.role,event.planVersion,event.policyVersion,event.actorId]);
  if(event.type==='planning.review_requested.v1') await db.query("insert into planning_review_requests(review_request_id,logto_organization_id,plan_id,plan_version,policy_version,assignment_ids,requested_by) values($1,$2,$3,$4,$5,$6,$7)",[event.reviewRequestId,...p,event.planVersion,event.policyVersion,event.assignmentIds,event.actorId]);
  if(event.type==='planning.review_approved.v1'||event.type==='planning.review_changes_requested.v1') {
    await db.query("insert into planning_review_decisions(decision_id,logto_organization_id,plan_id,assignment_id,actor_id,decision,plan_version,policy_version,rationale) values($1,$2,$3,$4,$5,$6,$7,$8,$9)",[event.decisionId,...p,event.assignmentId,event.actorId,event.decision,event.planVersion,event.policyVersion,event.rationale||null]);
    await db.query("update planning_review_assignments set active=false where logto_organization_id=$1 and assignment_id=$2",[event.organizationId,event.assignmentId]);
    if(event.reviewRequestId) await db.query("update planning_review_requests set status='completed' where logto_organization_id=$1 and review_request_id=$2",[event.organizationId,event.reviewRequestId]);
  }
  if(event.type==='planning.review_approved.v1') await db.query("insert into planning_approved_snapshots(logto_organization_id,plan_id,plan_version,snapshot,snapshot_hash,provenance,approved_by,approved_at) values($1,$2,$3,$4,$5,$6,$7,$8)",[...p,event.planVersion,event.approvedSnapshot,event.snapshotHash,event.provenance,event.actorId,event.occurredAt]);
}

function mapAggregate(plan, versions) { return { organizationId: plan.organization_id, id: plan.id, profileId: plan.profile_id, name: plan.name, state: plan.state, currentVersion: plan.current_version, revision: plan.revision, createdAt: plan.created_at, updatedAt: plan.updated_at, versions: versions.map((v) => ({ version: v.version, state: v.state, content: v.content, createdBy: v.created_by, createdAt: v.created_at, approvedBy: v.approved_by, approvedAt: v.approved_at })) }; }
function dto(aggregate) { const s = aggregate.toSnapshot(); const current = s.versions.find((v) => v.version === s.currentVersion); return { organizationId: s.organizationId, planId: s.id, profileId: s.profileId, name: s.name, status: s.state, content: current.content, version: s.revision, planVersion: s.currentVersion, updatedAt: s.updatedAt }; }
function profileDto(row) { return { organizationId: row.organization_id, profileId: row.id, configuration: row.configuration, version: row.version, updatedAt: row.updated_at }; }

module.exports = { createPostgresPlanningPersistence };
