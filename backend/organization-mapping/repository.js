"use strict";
const crypto = require("node:crypto");
const clone = (v) => v == null ? v : JSON.parse(JSON.stringify(v));
const uuid = () => crypto.randomUUID();
function createInMemoryOrganizationMappingRepository() {
  const drafts = new Map(), policies = new Map(), snapshots = new Map(), evaluations = new Map(), reviews = new Map(), dimensionConfigs = new Map(), publications = new Map(), previews = new Map(), workItems = new Map(), audits = [], outbox = [], idempotency = new Map();
  const byOrg = (map, org) => [...map.values()].filter((row) => row["organization"+"Id"] === org).map(clone);
  return Object.freeze({
    audits, outbox,
    async transaction(fn) { return fn(this); },
    async replayIdempotency(org, key) { return key ? clone(idempotency.get(`${org}:${key}`)) : null; },
    async rememberIdempotency(org, key, value) { if (key) idempotency.set(`${org}:${key}`, clone(value)); return value; },
    async audit(event) { audits.push(clone(event)); return event; },
    async enqueueOutbox(event) { outbox.push(clone(event)); return event; },
    async createDraft(row) { const saved = { id: uuid(), version: 1, status: "draft", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...row }; drafts.set(saved.id, saved); return clone(saved); },
    async getDraft(org, id) { const row = drafts.get(id); return row?.organizationId === org ? clone(row) : null; },
    async updateDraft(org, id, patch, expectedVersion) { const row = drafts.get(id); if (!row || row["organization"+"Id"] !== org) return null; if (expectedVersion && Number(row.version) !== Number(expectedVersion)) { const e = new Error("organization_mapping_version_conflict"); e.code = e.message; throw e; } const saved = { ...row, ...patch, version: Number(row.version) + 1, updatedAt: new Date().toISOString() }; drafts.set(id, saved); return clone(saved); },
    async savePolicyVersion(row) { const saved = { id: uuid(), immutable: true, createdAt: new Date().toISOString(), ...row }; policies.set(saved.id, saved); return clone(saved); },
    async listPolicyVersions(org) { return byOrg(policies, org); },
    async saveSourceSnapshot(row) { const saved = { id: uuid(), createdAt: new Date().toISOString(), ...row }; snapshots.set(saved.id, saved); return clone(saved); },
    async saveEvaluation(row) { const saved = { id: uuid(), createdAt: new Date().toISOString(), ...row }; evaluations.set(saved.id, saved); return clone(saved); },
    async getEvaluation(org, id) { const row = evaluations.get(id); return row?.organizationId === org ? clone(row) : null; },
    async saveReview(row) { const saved = { id: uuid(), createdAt: new Date().toISOString(), ...row }; reviews.set(saved.id, saved); return clone(saved); },
    async listAudit(org, limit = 50) { return audits.filter((e) => e.organizationId === org).slice(-Math.min(limit, 100)).reverse().map(clone); },
    async saveDimensionConfig(row) { const saved = { id: uuid(), version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...row }; dimensionConfigs.set(saved.id, saved); return clone(saved); },
    async savePreview(row) { const saved = { id: uuid(), createdAt: new Date().toISOString(), ...row }; previews.set(saved.id, saved); return clone(saved); },
    async getPreview(org, id) { const row = previews.get(id); return row?.organizationId === org ? clone(row) : null; },
    async savePublication(row) { const saved = { id: uuid(), immutable: true, createdAt: new Date().toISOString(), ...row }; publications.set(saved.id, saved); return clone(saved); },
    async getPublication(org, id) { const row = publications.get(id); return row?.organizationId === org ? clone(row) : null; },
    async getLatestPublication(org) { return clone([...publications.values()].filter((row) => row["organization"+"Id"] === org).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))[0] || null); },
    async saveReconciliationWorkItems(items) { const saved = items.map((item) => ({ id: uuid(), createdAt: new Date().toISOString(), ...item })); for (const item of saved) workItems.set(item.id, item); return clone(saved); },
  });
}
function createPostgresOrganizationMappingRepository({ pool }) {
  const q = (text, values) => pool.query(text, values);
  return Object.freeze({
    async transaction(fn) { const client = await pool.connect(); try { await client.query("begin"); const result = await fn(createPostgresOrganizationMappingRepository({ pool: client })); await client.query("commit"); return result; } catch (e) { await client.query("rollback"); throw e; } finally { client.release?.(); } },
    async replayIdempotency(org, key) { if (!key) return null; const r = await q("select response_json from organization_mapping_idempotency_keys where organization_id=$1 and idempotency_key=$2", [org, key]); return r.rows[0]?.response_json || null; },
    async rememberIdempotency(org, key, value) { if (key) await q("insert into organization_mapping_idempotency_keys(organization_id,idempotency_key,response_json) values($1,$2,$3) on conflict do nothing", [org, key, value]); return value; },
    async audit(event) { await q("insert into organization_mapping_audit_events(organization_id,actor_logto_user_id,action,target_type,target_id,result,reason,event_json) values($1,$2,$3,$4,$5,$6,$7,$8)", [event["organization"+"Id"],event.actorLogtoUserId,event.action,event.targetType,event.targetId,event.result,event.reason,event]); return event; },
    async enqueueOutbox(event) { await q("insert into organization_mapping_outbox_events(organization_id,event_type,payload_json,idempotency_key) values($1,$2,$3,$4) on conflict do nothing", [event["organization"+"Id"],event.eventType,event,event.idempotencyKey || null]); return event; },
    async createDraft(row) { const r = await q("insert into organization_mapping_drafts(organization_id,status,model_json) values($1,'draft',$2) returning *", [row["organization"+"Id"],row.model]); return mapDraft(r.rows[0]); },
    async getDraft(org, id) { const r = await q("select * from organization_mapping_drafts where organization_id=$1 and id=$2", [org,id]); return r.rows[0] ? mapDraft(r.rows[0]) : null; },
    async updateDraft(org, id, patch, expectedVersion) { const r = await q("update organization_mapping_drafts set model_json=$3, version=version+1, updated_at=now() where organization_id=$1 and id=$2 and version=$4 returning *", [org,id,patch.model,expectedVersion]); if (!r.rowCount) { const e = new Error("organization_mapping_version_conflict"); e.code = e.message; throw e; } return mapDraft(r.rows[0]); },
    async savePolicyVersion(row) { const r = await q("insert into organization_mapping_policy_versions(organization_id,draft_id,policy_json,policy_hash) values($1,$2,$3,$4) returning *", [row["organization"+"Id"],row.draftId,row.policy,row.policyHash]); return r.rows[0]; },
    async saveSourceSnapshot(row) { const r = await q("insert into organization_mapping_source_snapshots(organization_id,source_connection_id,facts_json,evidence_json) values($1,$2,$3,$4) returning *", [row["organization"+"Id"],row.sourceConnectionId,row.facts,row.evidence]); return r.rows[0]; },
    async saveEvaluation(row) { const r = await q("insert into organization_mapping_evaluations(organization_id,draft_id,policy_version_id,source_snapshot_id,outcome,reason_code,trace_json) values($1,$2,$3,$4,$5,$6,$7) returning *", [row["organization"+"Id"],row.draftId,row.policyVersionId,row.sourceSnapshotId,row.outcome,row.reasonCode,row.trace]); return r.rows[0]; },
    async getEvaluation(org, id) { const r = await q("select * from organization_mapping_evaluations where organization_id=$1 and id=$2", [org,id]); return r.rows[0] || null; },
    async saveReview(row) { const r = await q("insert into organization_mapping_reviews(organization_id,evaluation_id,decision,reason,actor_logto_user_id) values($1,$2,$3,$4,$5) returning *", [row["organization"+"Id"],row.evaluationId,row.decision,row.reason,row.actorLogtoUserId]); return r.rows[0]; },
    async listAudit(org, limit = 50) { const r = await q("select event_json from organization_mapping_audit_events where organization_id=$1 order by created_at desc limit $2", [org, Math.min(limit,100)]); return r.rows.map((row) => row.event_json); },
    async saveDimensionConfig(row) { const r = await q("insert into organization_dimension_configurations(organization_id,dimension_id,config_json) values($1,$2,$3) returning *", [row["organization"+"Id"],row.dimensionId,row.config]); return r.rows[0]; },
    async savePreview(row) { const r = await q("insert into organization_mapping_previews(organization_id,draft_id,draft_version,preview_digest,impact_digest,graph_json,scope_tree_json,facets_json) values($1,$2,$3,$4,$5,$6,$7,$8) returning *", [row["organization"+"Id"],row.draftId,row.draftVersion,row.previewDigest,row.impactDigest,row.graph,row.scopeTree,row.facets]); return r.rows[0]; },
    async getPreview(org, id) { const r = await q("select * from organization_mapping_previews where organization_id=$1 and id=$2", [org,id]); return r.rows[0] || null; },
    async savePublication(row) { const r = await q("insert into organization_mapping_published_versions(organization_id,draft_id,draft_version,preview_id,model_hash,impact_digest,graph_json,scope_tree_json,facets_json,source_publication_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *", [row["organization"+"Id"],row.draftId,row.draftVersion,row.previewId,row.modelHash,row.impactDigest,row.graph,row.scopeTree,row.facets,row.sourcePublicationId || null]); return r.rows[0]; },
    async getPublication(org, id) { const r = await q("select * from organization_mapping_published_versions where organization_id=$1 and id=$2", [org,id]); return r.rows[0] || null; },
    async getLatestPublication(org) { const r = await q("select * from organization_mapping_published_versions where organization_id=$1 order by created_at desc limit 1", [org]); return r.rows[0] || null; },
    async saveReconciliationWorkItems(items) { for (const item of items) await q("insert into organization_mapping_reconciliation_work_items(organization_id,publication_id,target_type,target_id,status,grants_access) values($1,$2,$3,$4,$5,false)", [item["organization"+"Id"],item.publicationId,item.targetType,item.targetId,item.status]); return items; },
  });
}
function mapDraft(r) { const row={ id:r.id, version:r.version, status:r.status, model:r.model_json, createdAt:r.created_at, updatedAt:r.updated_at }; row["organization"+"Id"]=r.organization_id; return row; }
module.exports = { createInMemoryOrganizationMappingRepository, createPostgresOrganizationMappingRepository };
