const { randomUUID } = require("node:crypto");
const { getPool } = require("../lib/db");

const rowModel = (row) => row && ({
  id: row.id, organizationId: row.logto_organization_id, state: row.status,
  version: row.version, documentId: row.document_id, acceptedAt: row.accepted_at,
  completedAt: row.completed_at, attempts: row.attempts, maxAttempts: row.max_attempts,
  cancellationRequestedAt: row.cancellation_requested_at,
  planVersion: row.input_json.planVersion, profileVersion: row.input_json.profileVersion,
  templateVersion: row.input_json.templateVersion, templateId: row.input_json.templateId,
  parameters: row.input_json.parameters || {}, classification: row.input_json.classification,
  retentionClass: row.input_json.retentionClass, legalHold: row.input_json.legalHold,
  visibility: row.input_json.visibility, requestedBy: row.requested_by_json?.subject,
  problem: row.problem_json,
});

function createPostgresDocumentRepository({ pool = getPool() } = {}) {
  const query = (text, values) => pool.query(text, values);
  return {
    async transaction(fn) {
      const client = await pool.connect();
      try { await client.query("begin"); const value = await fn(createPostgresDocumentRepository({ pool: client })); await client.query("commit"); return value; }
      catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
    },
    async createGeneration(input) {
      const frozen = { templateId: input.templateId, parameters: input.parameters || {}, visibility: input.visibility,
        planVersion: input.planVersion, profileVersion: input.profileVersion, templateVersion: input.templateVersion,
        classification: input.classification, retentionClass: input.retentionClass, legalHold: Boolean(input.legalHold) };
      const result = await query(`insert into operational_operations
        (logto_organization_id, operation_type, entity_type, status, operation_state, input_json,
         requested_by_json, idempotency_key, max_attempts, accepted_at, version, queue_name)
        values ($1, 'documents.generate', 'document', 'pending', 'accepted', $2::jsonb, $3::jsonb, $4, $5, $6, 1, 'document_generation')
        on conflict (logto_organization_id, idempotency_key) where operation_type = 'documents.generate' and idempotency_key is not null
        do nothing returning *`, [input.organizationId, JSON.stringify(frozen), JSON.stringify({ subject: input.requestedBy }), input.idempotencyKey, input.maxAttempts || 3, input.now]);
      if (result.rows[0]) return { operation: rowModel(result.rows[0]), duplicate: false };
      const existing = await query("select * from operational_operations where logto_organization_id=$1 and operation_type='documents.generate' and idempotency_key=$2", [input.organizationId, input.idempotencyKey]);
      return { operation: rowModel(existing.rows[0]), duplicate: true };
    },
    async appendOutbox(event) {
      await query(`insert into integration_outbox_events
        (event_id,event_type,schema_version,logto_organization_id,aggregate_type,aggregate_id,aggregate_version,
         actor_json,correlation_id,operation_id,source_json,sensitivity,payload)
        values($1,$2,'1',$3,'document_operation',$4,$5,'{}',$4,$6,'{"module":"documents"}','internal',$7)
        on conflict(event_id) do nothing`, [randomUUID(), event.type, event.organizationId, event.aggregateId, String(event.version), event.operationId || event.aggregateId, JSON.stringify({ state: event.state })]);
    },
    async getOperation(org, id) { const r = await query("select * from operational_operations where id=$1 and logto_organization_id=$2 and operation_type='documents.generate'", [id, org]); return rowModel(r.rows[0]); },
    async saveOperation(row) { const r = await query(`update operational_operations set status=$3, operation_state=$3, version=$4,
      document_id=$5, completed_at=$6, problem_json=$7, cancellation_requested_at=$8, heartbeat_at=now(), attempts=coalesce($9,attempts), updated_at=now()
      where id=$1 and logto_organization_id=$2 returning *`, [row.id,row.organizationId,row.state,row.version,row.documentId,row.completedAt,row.problem && JSON.stringify(row.problem),row.cancellationRequestedAt,row.attempts]); return rowModel(r.rows[0]); },
    async claim(org, id, workerId) { const r = await query(`update operational_operations set status='running',operation_state='running',claimed_by=$3,claimed_at=now(),heartbeat_at=now(),attempts=attempts+1,version=version+1
      where id=$1 and logto_organization_id=$2 and status in ('pending','failed','running') and cancellation_requested_at is null returning *`, [id,org,workerId]); return rowModel(r.rows[0]); },
    async saveDocument(row) { await query(`insert into documents(id,logto_organization_id,operation_id,title,media_type,visibility,file_reference,content_hash,checksum_algorithm,size_bytes,classification,retention_class,document_version,provenance_json,retention_until,legal_hold)
      values($1,$2,$3,$4,$5,$6,$7,$8,'sha256',$9,$10,$11,$12,$13,$14,$15) on conflict(logto_organization_id,file_reference) do nothing`, [row.id,row.organizationId,row.operationId,row.title,row.mediaType,row.visibility,row.fileReference,row.hash,row.sizeBytes,row.classification,row.retentionClass,row.version,JSON.stringify(row.provenance),row.retentionUntil,row.legalHold]); return row; },
    async getDocument(org,id) { const r=await query("select * from documents where id=$1 and logto_organization_id=$2",[id,org]); const x=r.rows[0]; return x && { id:x.id,organizationId:x.logto_organization_id,operationId:x.operation_id,title:x.title,mediaType:x.media_type,visibility:x.visibility,fileReference:x.file_reference,hash:x.content_hash,sizeBytes:Number(x.size_bytes),classification:x.classification,retentionClass:x.retention_class,version:x.document_version,provenance:x.provenance_json,retentionUntil:x.retention_until,legalHold:x.legal_hold,createdAt:x.created_at }; },
    async listExpired(now) { const r=await query("select * from documents where legal_hold=false and retention_until <= $1",[now]); return r.rows.map(x=>({id:x.id,organizationId:x.logto_organization_id,fileReference:x.file_reference,operationId:x.operation_id,version:x.document_version})); },
    async deleteDocument(row) { await query("delete from documents where id=$1 and logto_organization_id=$2 and legal_hold=false",[row.id,row.organizationId]); },
    async deadLetter(op, reasonCode) { await query(`insert into document_operation_dead_letters(operation_id,logto_organization_id,reason_code,attempts) values($1,$2,$3,$4) on conflict(operation_id) do update set reason_code=excluded.reason_code,attempts=excluded.attempts,updated_at=now()`,[op.id,op.organizationId,reasonCode,op.attempts]); },
    async recoverStale(before) { const r=await query(`update operational_operations set status='pending',operation_state='accepted',claimed_by=null,claimed_at=null,next_retry_at=now(),version=version+1,updated_at=now() where operation_type='documents.generate' and status='running' and heartbeat_at < $1 and cancellation_requested_at is null returning *`,[before]); return r.rows.map(rowModel); },
  };
}
module.exports = { createPostgresDocumentRepository, rowModel };
