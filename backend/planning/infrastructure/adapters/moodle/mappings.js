const { PlanningLmsContractError, assertPlanningLmsEnvelope } = require('../../../application/lmsPort');

function toMoodleCapabilityRequest(request) {
  return { tenantid: request.organizationId, contextversions: request.contextVersions, handoffversions: request.handoffVersions, capabilities: request.requiredCapabilities };
}

function fromMoodleCapabilities(response) {
  return { organizationId: response.tenantid, contextVersion: response.contextversion, handoffVersion: response.handoffversion, capabilities: response.capabilities || [] };
}

function toMoodleHandoff(envelope) {
  assertPlanningLmsEnvelope(envelope);
  const { context, handoff } = envelope;
  return { tenantid: context.organizationId, requestid: context.correlationId, userid: context.actor?.id, idempotencykey: handoff.handoffId, course: { externalid: handoff.plan.id, revision: handoff.plan.version, title: handoff.plan.title }, audiences: (handoff.audiences || []).map(a => ({ externalid: a.id, tenantid: a.organizationId })) };
}

function fromMoodleReceipt(response) {
  if (!response) throw new PlanningLmsContractError('planning_lms_provider_invalid_response');
  return { receiptId: response.receiptid, status: response.status, organizationId: response.tenantid, handoffId: response.idempotencykey };
}

module.exports = { toMoodleCapabilityRequest, fromMoodleCapabilities, toMoodleHandoff, fromMoodleReceipt };
