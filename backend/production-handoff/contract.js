const { createHash, randomUUID } = require('node:crypto');

const CONTRACT_VERSION = 'civitas-production-handoff/v1';
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const PROVENANCE_KINDS = new Set(['civitas-approved-plan', 'civitas-approved-release']);

class HandoffContractError extends Error {
  constructor(reasonCode, message) { super(message); this.name = 'HandoffContractError'; this.reasonCode = reasonCode; }
}

function digest(value) {
  return `sha256:${createHash('sha256').update(Buffer.isBuffer(value) ? value : String(value)).digest('hex')}`;
}

/** Build the complete, provider-neutral wire contract. Internal task/asset data is deliberately not accepted. */
function createProductionHandoff(input = {}) {
  const handoff = {
    contractVersion: CONTRACT_VERSION,
    handoffId: input.handoffId || randomUUID(),
    organizationId: input.organizationId,
    plan: { id: input.planId, version: input.planVersion },
    contentHash: input.contentHash,
    provenance: input.provenance && { kind: input.provenance.kind, approvedAt: input.provenance.approvedAt, approvedBy: input.provenance.approvedBy },
    correlationId: input.correlationId,
    operationId: input.operationId,
  };
  if (!handoff.organizationId) throw new HandoffContractError('handoff_organization_required', 'organizationId is required');
  if (!handoff.plan.id || handoff.plan.version == null) throw new HandoffContractError('handoff_plan_required', 'plan id and version are required');
  if (!HASH_PATTERN.test(handoff.contentHash || '')) throw new HandoffContractError('handoff_hash_invalid', 'contentHash must be a sha256 digest');
  if (!handoff.provenance?.approvedAt || !handoff.provenance?.approvedBy || !PROVENANCE_KINDS.has(handoff.provenance.kind)) throw new HandoffContractError('handoff_provenance_invalid', 'approved provenance is required');
  if (!handoff.correlationId || !handoff.operationId) throw new HandoffContractError('handoff_trace_required', 'correlationId and operationId are required');
  return Object.freeze({ ...handoff, plan: Object.freeze(handoff.plan), provenance: Object.freeze(handoff.provenance) });
}

module.exports = { CONTRACT_VERSION, HandoffContractError, createProductionHandoff, digest };
