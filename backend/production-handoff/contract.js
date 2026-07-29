const { createHash, randomUUID } = require('node:crypto');

const CONTRACT_VERSION = 'civitas-production-handoff/v2';
const CANONICAL_PERMISSION = 'planning.production_handoffs.manage';
const REQUIRED_SCOPE = 'approved_plans';
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const PROVENANCE_KINDS = new Set(['civitas-approved-plan', 'civitas-approved-release']);

class HandoffContractError extends Error {
  constructor(reasonCode, message, status = 422) { super(message); this.name = 'HandoffContractError'; this.reasonCode = reasonCode; this.status = status; }
}
function digest(value) { return `sha256:${createHash('sha256').update(Buffer.isBuffer(value) ? value : String(value)).digest('hex')}`; }
function requiredArray(input, key) {
  if (!Array.isArray(input[key]) || !input[key].length) throw new HandoffContractError(`handoff_${key}_required`, `${key} must be a non-empty array`);
  return input[key].map((item) => Object.freeze({ ...item }));
}

/** Provider-neutral release instructions. Planning references outputs; Plasma alone owns tasks and assets. */
function createProductionHandoff(input = {}) {
  if (input.permission !== CANONICAL_PERMISSION) throw new HandoffContractError('handoff_permission_required', `canonical permission ${CANONICAL_PERMISSION} is required`, 403);
  if (input.dataScope !== REQUIRED_SCOPE) throw new HandoffContractError('handoff_scope_required', `data scope ${REQUIRED_SCOPE} is required`, 403);
  if (input.planState !== 'approved' || input.planImmutable !== true) throw new HandoffContractError('handoff_plan_version_not_immutable', 'an immutable approved plan version is required');
  const handoff = {
    contractVersion: CONTRACT_VERSION, handoffId: input.handoffId || randomUUID(), organizationId: input.organizationId,
    plan: Object.freeze({ id: input.planId, version: input.planVersion, state: 'approved', immutable: true }),
    contentHash: input.contentHash,
    outputSpecs: Object.freeze(requiredArray(input, 'outputSpecs')),
    priorities: Object.freeze(requiredArray(input, 'priorities')),
    dependencies: Object.freeze(requiredArray(input, 'dependencies')),
    acceptanceCriteria: Object.freeze(requiredArray(input, 'acceptanceCriteria')),
    governedReferences: Object.freeze(requiredArray(input, 'governedReferences')),
    provenance: input.provenance && Object.freeze({ kind: input.provenance.kind, approvedAt: input.provenance.approvedAt, approvedBy: input.provenance.approvedBy, sourceVersion: input.provenance.sourceVersion, decisionId: input.provenance.decisionId }),
    authorization: Object.freeze({ permission: input.permission, dataScope: input.dataScope, decisionId: input.authorizationDecisionId }),
    correlationId: input.correlationId, operationId: input.operationId,
  };
  if (!handoff.organizationId) throw new HandoffContractError('handoff_organization_required', 'organizationId is required');
  if (!handoff.plan.id || handoff.plan.version == null) throw new HandoffContractError('handoff_plan_required', 'plan id and version are required');
  if (!HASH_PATTERN.test(handoff.contentHash || '')) throw new HandoffContractError('handoff_hash_invalid', 'contentHash must be a sha256 digest');
  if (!handoff.provenance?.approvedAt || !handoff.provenance?.approvedBy || !handoff.provenance?.sourceVersion || !handoff.provenance?.decisionId || !PROVENANCE_KINDS.has(handoff.provenance.kind)) throw new HandoffContractError('handoff_provenance_invalid', 'complete approved provenance is required');
  if (!handoff.authorization.decisionId) throw new HandoffContractError('handoff_authorization_decision_required', 'authorization decision is required', 403);
  if (!handoff.correlationId || !handoff.operationId) throw new HandoffContractError('handoff_trace_required', 'correlationId and operationId are required');
  return Object.freeze(handoff);
}
module.exports = { CONTRACT_VERSION, CANONICAL_PERMISSION, REQUIRED_SCOPE, HandoffContractError, createProductionHandoff, digest };
