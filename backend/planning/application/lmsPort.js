const CONTEXT_VERSION = 'civitas.planning-lms-context/v1';
const HANDOFF_VERSION = 'civitas.planning-lms-handoff/v1';

const PLANNING_LMS_CAPABILITIES = Object.freeze({
  PUBLISH_PLAN: 'planning.plan.publish',
  IDEMPOTENT_HANDOFF: 'planning.handoff.idempotent',
});

class PlanningLmsContractError extends Error {
  constructor(reasonCode, message = reasonCode) {
    super(message);
    this.name = 'PlanningLmsContractError';
    this.reasonCode = reasonCode;
  }
}

function requiredString(value, reasonCode) {
  if (typeof value !== 'string' || !value.trim()) throw new PlanningLmsContractError(reasonCode);
  return value;
}

function assertPlanningLmsEnvelope({ context, handoff } = {}) {
  if (context?.schemaVersion !== CONTEXT_VERSION) throw new PlanningLmsContractError('planning_lms_context_version_unsupported');
  if (handoff?.schemaVersion !== HANDOFF_VERSION) throw new PlanningLmsContractError('planning_lms_handoff_version_unsupported');
  const tenant = requiredString(context.organizationId, 'planning_lms_tenant_required');
  if (requiredString(handoff.organizationId, 'planning_lms_tenant_required') !== tenant) {
    throw new PlanningLmsContractError('planning_lms_tenant_mismatch');
  }
  requiredString(context.correlationId, 'planning_lms_correlation_required');
  requiredString(handoff.handoffId, 'planning_lms_handoff_id_required');
  requiredString(handoff.plan?.id, 'planning_lms_plan_required');
  if (!Number.isInteger(handoff.plan?.version) || handoff.plan.version < 1) throw new PlanningLmsContractError('planning_lms_plan_required');
  for (const audience of handoff.audiences || []) {
    if (audience.organizationId !== tenant) throw new PlanningLmsContractError('planning_lms_tenant_mismatch');
  }
  return tenant;
}

function createPlanningLmsPort(candidate) {
  for (const method of ['negotiateCapabilities', 'deliverHandoff']) {
    if (typeof candidate?.[method] !== 'function') throw new TypeError(`PlanningLmsPort.${method} is required`);
  }
  return Object.freeze(candidate);
}

async function negotiatePlanningLmsCapabilities(port, request = {}) {
  const required = [...new Set(request.requiredCapabilities || [])];
  const result = await port.negotiateCapabilities({
    organizationId: requiredString(request.organizationId, 'planning_lms_tenant_required'),
    contextVersions: [CONTEXT_VERSION], handoffVersions: [HANDOFF_VERSION], requiredCapabilities: required,
  });
  if (result?.organizationId !== request.organizationId) throw new PlanningLmsContractError('planning_lms_tenant_mismatch');
  const supported = new Set(result.capabilities || []);
  if (result.contextVersion !== CONTEXT_VERSION || result.handoffVersion !== HANDOFF_VERSION || required.some(value => !supported.has(value))) {
    throw new PlanningLmsContractError('planning_lms_capability_incompatible');
  }
  return Object.freeze({ ...result, capabilities: Object.freeze([...supported]) });
}

async function deliverPlanningLmsHandoff(port, envelope, { requiredCapabilities = [PLANNING_LMS_CAPABILITIES.PUBLISH_PLAN] } = {}) {
  const organizationId = assertPlanningLmsEnvelope(envelope);
  const negotiation = await negotiatePlanningLmsCapabilities(port, { organizationId, requiredCapabilities });
  const receipt = await port.deliverHandoff(envelope, { negotiation });
  if (receipt?.organizationId !== organizationId) throw new PlanningLmsContractError('planning_lms_tenant_mismatch');
  if (receipt?.handoffId !== envelope.handoff.handoffId) throw new PlanningLmsContractError('planning_lms_receipt_inconsistent');
  return receipt;
}

module.exports = { CONTEXT_VERSION, HANDOFF_VERSION, PLANNING_LMS_CAPABILITIES, PlanningLmsContractError, assertPlanningLmsEnvelope, createPlanningLmsPort, negotiatePlanningLmsCapabilities, deliverPlanningLmsHandoff };
