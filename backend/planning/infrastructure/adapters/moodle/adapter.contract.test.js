const test = require('node:test');
const assert = require('node:assert/strict');
const { CONTEXT_VERSION, HANDOFF_VERSION, PLANNING_LMS_CAPABILITIES } = require('../../../application/lmsPort');
const { runPlanningLmsPortContract } = require('../../../testing/planningLmsPortContract');
const { createMoodlePlanningLmsAdapter } = require('./adapter');

test('Moodle adapter passes the provider-neutral PlanningLmsPort contract', async () => {
  const result = await runPlanningLmsPortContract({ createSubject() {
    const calls = [];
    const client = {
      async capabilities(payload) { calls.push({ operation: 'negotiate', payload }); return { tenantid: payload.tenantid, contextversion: CONTEXT_VERSION, handoffversion: HANDOFF_VERSION, capabilities: [PLANNING_LMS_CAPABILITIES.PUBLISH_PLAN, PLANNING_LMS_CAPABILITIES.IDEMPOTENT_HANDOFF] }; },
      async publishCourse(payload) { calls.push({ operation: 'deliver', payload }); return { receiptid: 'receipt-contract', status: 'accepted', tenantid: payload.tenantid, idempotencykey: payload.idempotencykey }; },
    };
    return { port: createMoodlePlanningLmsAdapter({ client, token: 'adapter-only-credential' }), calls };
  } });
  assert.equal(result.receipt.status, 'accepted');
});
