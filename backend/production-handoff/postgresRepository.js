/** Planning-owned persistence. It stores handoff envelopes and operational receipts, never Plasma tasks/assets. */
function createPostgresProductionHandoffRepository({ pool }) {
  const operations = {
    async findByHandoff(organizationId, handoffId) { const r = await pool.query('select * from planning_production_handoffs where organization_id=$1 and handoff_id=$2', [organizationId, handoffId]); return r.rowCount ? map(r.rows[0]) : null; },
    async findById(organizationId, id) { const r = await pool.query('select * from planning_production_handoffs where organization_id=$1 and operation_id=$2', [organizationId, id]); return r.rowCount ? map(r.rows[0]) : null; },
    async list(organizationId) { const r = await pool.query('select * from planning_production_handoffs where organization_id=$1 order by created_at desc', [organizationId]); return r.rows.map(map); },
    async create(row) { await pool.query(`insert into planning_production_handoffs(organization_id,handoff_id,operation_id,plan_id,plan_version,content_hash,state,correlation_id,contract_json) values($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [row.organizationId,row.handoffId,row.id,row.planId,row.planVersion,row.contentHash,row.state,row.correlationId,row.contract]); return row; },
    async transition(id, state, detail={}) { const r = await pool.query('update planning_production_handoffs set state=$2,result_json=$3,updated_at=now() where operation_id=$1 returning *', [id,state,detail]); return map(r.rows[0]); },
  };
  const receipts = {
    async find(organizationId, handoffId) { const r = await pool.query('select * from production_handoff_inbox where organization_id=$1 and handoff_id=$2', [organizationId,handoffId]); return r.rowCount ? receipt(r.rows[0]) : null; },
    async insert(value) { await pool.query('insert into production_handoff_inbox(organization_id,handoff_id,receipt_id,content_hash,status) values($1,$2,$3,$4,$5)', [value.organizationId,value.handoffId,value.receiptId,value.contentHash,value.status]); },
  };
  return Object.freeze({ operations, receipts });
}
function map(r) { return { id:r.operation_id, operationId:r.operation_id, organizationId:r.organization_id, handoffId:r.handoff_id, planId:r.plan_id, planVersion:r.plan_version, contentHash:r.content_hash, state:r.state, result:r.result_json, contract:r.contract_json, createdAt:r.created_at, updatedAt:r.updated_at }; }
function receipt(r) { return { organizationId:r.organization_id,handoffId:r.handoff_id,receiptId:r.receipt_id,contentHash:r.content_hash,status:r.status }; }
module.exports = { createPostgresProductionHandoffRepository };
