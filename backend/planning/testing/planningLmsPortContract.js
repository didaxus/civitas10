const assert = require('node:assert/strict');
const { CONTEXT_VERSION, HANDOFF_VERSION, PLANNING_LMS_CAPABILITIES, deliverPlanningLmsHandoff } = require('../application/lmsPort');

function contractEnvelope(organizationId = 'organization-contract') {
  return { context: { schemaVersion: CONTEXT_VERSION, organizationId, correlationId: 'correlation-contract', actor: { id: 'actor-contract', kind: 'service' } }, handoff: { schemaVersion: HANDOFF_VERSION, handoffId: 'handoff-contract', organizationId, plan: { id: 'plan-contract', version: 1, title: 'Contract plan' }, audiences: [{ id: 'audience-contract', organizationId }] } };
}

async function runPlanningLmsPortContract({ createSubject }) {
  const { port: adapter, calls } = createSubject();
  const receipt = await deliverPlanningLmsHandoff(adapter, contractEnvelope());
  assert.deepEqual({ organizationId: receipt.organizationId, handoffId: receipt.handoffId }, { organizationId: 'organization-contract', handoffId: 'handoff-contract' });
  assert.equal(calls.filter(call => call.operation === 'negotiate').length, 1);
  assert.equal(calls.filter(call => call.operation === 'deliver').length, 1);
  return { calls, receipt };
}

module.exports = { contractEnvelope, runPlanningLmsPortContract };
