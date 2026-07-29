const { createProductionHandoff, HandoffContractError } = require('./contract');

const EVENT = Object.freeze({ REQUESTED: 'production.handoff.requested', RECEIVED: 'production.handoff.received', REJECTED: 'production.handoff.rejected', TIMED_OUT: 'production.handoff.timed_out', RECONCILED: 'production.handoff.reconciled' });

function createProductionHandoffService({ port, plans, operations, events, timeoutMs = 5000 }) {
  if (!port || !plans || !operations || !events) throw new TypeError('port, plans, operations and events are required');
  const emit = (type, h, payload = {}) => events.append({ type, organizationId: h.organizationId, aggregateId: h.handoffId, correlationId: h.correlationId, operationId: h.operationId, payload });
  const reject = async (h, reasonCode) => { await operations.transition(h.operationId, 'failed', { reasonCode }); await emit(EVENT.REJECTED, h, { reasonCode }); throw new HandoffContractError(reasonCode, reasonCode); };
  async function validate(h, content) {
    const approved = await plans.getApprovedVersion(h.organizationId, h.plan.id);
    if (!approved || approved.version !== h.plan.version) return reject(h, 'handoff_plan_version_not_approved');
    if (approved.contentHash !== h.contentHash || (content != null && plans.hash(content) !== h.contentHash)) return reject(h, 'handoff_hash_mismatch');
  }
  return Object.freeze({
    async handoff(input) {
      const h = createProductionHandoff(input);
      const existing = await operations.findByHandoff(h.organizationId, h.handoffId);
      if (existing) return existing;
      await operations.create({ id: h.operationId, organizationId: h.organizationId, handoffId: h.handoffId, correlationId: h.correlationId, state: 'accepted' });
      await validate(h, input.content);
      await operations.transition(h.operationId, 'running'); await emit(EVENT.REQUESTED, h, { planId: h.plan.id, planVersion: h.plan.version, contentHash: h.contentHash, provenance: h.provenance });
      const controller = new AbortController();
      let timer;
      try {
        const receipt = await Promise.race([port.deliver(h, { signal: controller.signal }), new Promise((_, rejectTimeout) => { timer = setTimeout(() => rejectTimeout(new HandoffContractError('handoff_timeout', 'handoff timed out')), timeoutMs); })]);
        if (receipt.organizationId !== h.organizationId) return reject(h, 'handoff_receipt_tenant_mismatch');
        if (receipt.handoffId !== h.handoffId || receipt.contentHash !== h.contentHash) return reject(h, 'handoff_receipt_inconsistent');
        if (receipt.status === 'rejected') return reject(h, 'handoff_provider_rejected');
        const result = { state: 'succeeded', receiptId: receipt.receiptId, handoffId: h.handoffId };
        await operations.transition(h.operationId, 'succeeded', result); await emit(EVENT.RECEIVED, h, { receiptId: receipt.receiptId }); return result;
      } catch (error) {
        if (error.reasonCode === 'handoff_timeout') { controller.abort(); await operations.transition(h.operationId, 'timed_out', { reasonCode: error.reasonCode }); await emit(EVENT.TIMED_OUT, h, { reasonCode: error.reasonCode }); return { state: 'timed_out', handoffId: h.handoffId }; }
        if (error instanceof HandoffContractError) throw error;
        return reject(h, 'handoff_provider_rejected');
      } finally { clearTimeout(timer); }
    },
    async reconcile(input) {
      const h = createProductionHandoff(input); const operation = await operations.findByHandoff(h.organizationId, h.handoffId);
      if (!operation) throw new HandoffContractError('handoff_operation_not_found', 'handoff operation not found');
      const receipt = await port.lookupReceipt(h);
      if (receipt.organizationId !== h.organizationId || receipt.handoffId !== h.handoffId || receipt.contentHash !== h.contentHash) return reject(h, 'handoff_receipt_inconsistent');
      const result = { state: 'succeeded', receiptId: receipt.receiptId, handoffId: h.handoffId, reconciled: true };
      await operations.transition(h.operationId, 'succeeded', result); await emit(EVENT.RECONCILED, h, { receiptId: receipt.receiptId }); return result;
    },
  });
}
module.exports = { EVENT, createProductionHandoffService };
