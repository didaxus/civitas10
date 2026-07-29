const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { NAMED_USE_CASES } = require('../planning/application/remotePort');
const { paths } = require('../planning/infrastructure/runtimeContractV1');

test('planning remote port exposes only six scoped plan/profile use cases', () => {
  assert.deepEqual(Object.keys(NAMED_USE_CASES).sort(), ['createPlan', 'listPlans', 'readPlan', 'readProfile', 'replaceProfile', 'updatePlan']);
  assert.equal(NAMED_USE_CASES.replaceProfile.operationId, 'planning.profile.replace');
  assert.equal(NAMED_USE_CASES.readProfile.permission, 'planning.profile.read');
  assert.equal(NAMED_USE_CASES.archivePlan, undefined);
});

test('planning runtime v1 matches replace profile and excludes archive from active paths', () => {
  assert.equal(paths.replaceProfile, '/private/planning-runtime/v1/profile:replace');
  assert.equal(paths.archivePlan, undefined);
  const runtime = JSON.parse(fs.readFileSync('contracts/federation/planning-runtime/v1/schema.json', 'utf8'));
  assert.equal(Object.keys(runtime.operations).length, 6);
  assert.ok(runtime.plannedNotMounted.includes('planning.plans.archive'));
});

test('public planning OpenAPI declares all required REST metadata and stays planned', () => {
  const doc = fs.readFileSync('contracts/openapi/modules/planning.yaml', 'utf8');
  for (const op of ['planningPlansCreate', 'planningPlansList', 'planningPlansRead', 'planningPlansUpdate', 'planningProfileRead', 'planningProfileReplace']) {
    assert.match(doc, new RegExp(`operationId: ${op}`));
  }
  assert.equal((doc.match(/x-civitas-status: planned/g) || []).length, 6);
  assert.equal(doc.includes('x-civitas-status: active'), false);
  assert.match(doc, /Idempotency-Key/);
  assert.match(doc, /If-Match/);
  assert.match(doc, /nextCursor/);
});

test('planning event contracts include tenant actor correlation sensitivity and safe diff', () => {
  const created = JSON.parse(fs.readFileSync('contracts/events/planning/v1/plan-created.schema.json', 'utf8'));
  const updated = JSON.parse(fs.readFileSync('contracts/events/planning/v1/profile-updated.schema.json', 'utf8'));
  assert.equal(created.properties.eventType.const, 'planning.plan.created.v1');
  assert.equal(updated.properties.eventType.const, 'planning.profile.updated.v1');
  for (const field of ['organizationId', 'actor', 'correlationId', 'sensitivity']) {
    assert.ok(created.required.includes(field));
    assert.ok(updated.required.includes(field));
  }
  assert.ok(updated.required.includes('safeDiff'));
});
