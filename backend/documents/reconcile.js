async function reconcileDeadLetter({ pool, organizationId, operationId, action, producer }) {
  if (!['retry','discard'].includes(action)) throw new Error('invalid reconciliation action');
  const client = await pool.connect();
  try {
    await client.query('begin'); await client.query("select set_config('civitas.organization_id',$1,true)",[organizationId]);
    const found = await client.query('select * from document_operation_dead_letters where operation_id=$1 and logto_organization_id=$2 for update',[operationId,organizationId]);
    if (!found.rows[0]) return null;
    if (action === 'retry') { await client.query("update operational_operations set status='pending',operation_state='accepted',attempts=0,problem_json=null,completed_at=null,next_retry_at=now(),version=version+1 where id=$1 and logto_organization_id=$2",[operationId,organizationId]); await client.query("update document_operation_dead_letters set reconciliation_status='requeued',updated_at=now() where operation_id=$1",[operationId]); }
    else await client.query("update document_operation_dead_letters set reconciliation_status='discarded',updated_at=now() where operation_id=$1",[operationId]);
    await client.query('commit');
    if (action === 'retry') await producer.enqueue({id:operationId,organizationId});
    return { operationId, action };
  } catch(e) { await client.query('rollback'); throw e; } finally { client.release(); }
}
module.exports = { reconcileDeadLetter };
