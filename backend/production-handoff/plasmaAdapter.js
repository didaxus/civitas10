const { createProductionHandoffPort } = require('./port');

function createPlasmaProductionHandoffAdapter({ client }) {
  if (!client || typeof client.submitRelease !== 'function') throw new TypeError('Plasma client is required');
  return createProductionHandoffPort({
    async deliver(handoff, { signal } = {}) {
      const response = await client.submitRelease({
        tenant: handoff.organizationId,
        release: { externalId: handoff.handoffId, planId: handoff.plan.id, planVersion: handoff.plan.version, digest: handoff.contentHash },
        provenance: handoff.provenance,
        trace: { correlationId: handoff.correlationId, operationId: handoff.operationId },
      }, { signal });
      return { receiptId: response.receiptId, status: response.status, organizationId: response.tenant, handoffId: response.externalId, contentHash: response.digest };
    },
    async lookupReceipt(handoff) { return client.getReleaseReceipt({ tenant: handoff.organizationId, externalId: handoff.handoffId }); },
    async cancel(handoff) { return client.cancelRelease({ tenant: handoff.organizationId, externalId: handoff.handoffId }); },
    async rollback(handoff, target) { return client.activatePriorRelease({ tenant: handoff.organizationId, externalId: handoff.handoffId, target }); },
  });
}
module.exports = { createPlasmaProductionHandoffAdapter };
