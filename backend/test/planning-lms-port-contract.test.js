const test = require('node:test');
const assert = require('node:assert/strict');
const { createPlanningLmsPort, CONTEXT_VERSION, HANDOFF_VERSION, PLANNING_LMS_CAPABILITIES, deliverPlanningLmsHandoff } = require('../planning/application');
const { contractEnvelope } = require('../planning/testing/planningLmsPortContract');

test('tenant mismatch is stopped before an adapter receives the handoff', async () => {
  let delivered = false;
  const port = createPlanningLmsPort({ async negotiateCapabilities() { throw new Error('must not negotiate'); }, async deliverHandoff() { delivered = true; } });
  const envelope = contractEnvelope(); envelope.handoff.organizationId = 'organization-other';
  await assert.rejects(() => deliverPlanningLmsHandoff(port, envelope), error => error.reasonCode === 'planning_lms_tenant_mismatch');
  assert.equal(delivered, false);
});

test('incompatible capabilities prevent delivery', async () => {
  let delivered = false;
  const port = createPlanningLmsPort({ async negotiateCapabilities({ organizationId }) { return { organizationId, contextVersion: CONTEXT_VERSION, handoffVersion: HANDOFF_VERSION, capabilities: [] }; }, async deliverHandoff() { delivered = true; } });
  await assert.rejects(() => deliverPlanningLmsHandoff(port, contractEnvelope()), error => error.reasonCode === 'planning_lms_capability_incompatible');
  assert.equal(delivered, false);
});

test('application behavior is unchanged when the adapter is substituted', async () => {
  const replacement = createPlanningLmsPort({
    async negotiateCapabilities({ organizationId }) { return { organizationId, contextVersion: CONTEXT_VERSION, handoffVersion: HANDOFF_VERSION, capabilities: [PLANNING_LMS_CAPABILITIES.PUBLISH_PLAN] }; },
    async deliverHandoff({ handoff }) { return { receiptId: 'replacement-1', status: 'accepted', organizationId: handoff.organizationId, handoffId: handoff.handoffId }; },
  });
  assert.equal((await deliverPlanningLmsHandoff(replacement, contractEnvelope())).receiptId, 'replacement-1');
});
