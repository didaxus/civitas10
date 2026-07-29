const { HandoffContractError } = require('./contract');

/** Receiver-side exactly-once effect guard, keyed by tenant and handoff. */
function createProductionHandoffInbox({ receipts, apply }) {
  if (!receipts || typeof receipts.find !== 'function' || typeof receipts.insert !== 'function' || typeof apply !== 'function') throw new TypeError('receipts and apply are required');
  return Object.freeze({
    async receive(handoff) {
      const existing = await receipts.find(handoff.organizationId, handoff.handoffId);
      if (existing) {
        if (existing.contentHash !== handoff.contentHash) throw new HandoffContractError('handoff_receipt_hash_mismatch', 'duplicate handoff has a different hash', 409);
        return { ...existing, duplicate: true };
      }
      const outcome = await apply(handoff);
      const receipt = { receiptId: outcome.receiptId, status: outcome.status || 'accepted', organizationId: handoff.organizationId, handoffId: handoff.handoffId, contentHash: handoff.contentHash };
      try { await receipts.insert(receipt); } catch (error) {
        if (error.code !== '23505') throw error;
        const winner = await receipts.find(handoff.organizationId, handoff.handoffId);
        if (!winner || winner.contentHash !== handoff.contentHash) throw new HandoffContractError('handoff_receipt_hash_mismatch', 'concurrent duplicate has a different hash', 409);
        return { ...winner, duplicate: true };
      }
      return receipt;
    },
  });
}
module.exports = { createProductionHandoffInbox };
