const test = require('node:test');
const assert = require('node:assert/strict');
const { createPlanningApplicationServices } = require('../planning/application');

function context(useCase, overrides = {}) {
  const base = {
    createPlan: ['planning.plans', 'planning.plans.create', 'planning.plans.create', 'planning.plans.manage', 'write', { key: 'idem-1' }],
    listPlans: ['planning.plans', 'planning.plans.list', 'planning.plans.read', 'planning.plans.read', 'read', null],
    getPlan: ['planning.plans', 'planning.plans.get', 'planning.plans.read', 'planning.plans.read', 'read', null],
    updatePlan: ['planning.plans', 'planning.plans.update', 'planning.plans.update', 'planning.plans.manage', 'write', { key: 'idem-1' }],
    getProfile: ['planning.profile', 'planning.profile.get', 'planning.profile.read', 'planning.profile.read', 'read', null],
    replaceProfile: ['planning.profile', 'planning.profile.replace', 'planning.profile.replace', 'planning.profile.manage', 'write', { key: 'idem-1' }],
  }[useCase];
  return {
    organizationId: 'org-1', subjectId: 'user-1', correlationId: 'corr-1', contractVersion: 'v1',
    operation: { moduleId: 'planning', capabilityId: base[0], operationId: base[1], actionId: base[2], permission: base[3], executionKind: base[4] },
    authorizationDecision: { decisionId: 'authz-1', organizationId: 'org-1' },
    availabilityDecision: { decisionId: 'avail-1', executable: true, runtimeBindingVersion: '1' },
    idempotency: base[5], ...overrides,
  };
}
function ports(seed = {}) {
  const plans = new Map(seed.plans?.map((p) => [p.planId, p]) || []);
  const profiles = new Map(seed.profiles?.map((p) => [p.organizationId, p]) || []);
  const ledger = new Map();
  const calls = [];
  const api = { calls, ledger,
    persistencePort: {
      async createPlan(input) { calls.push(['createPlan', input]); const row = { planId: input.planId || 'p1', title: input.title, organizationId: input.organizationId, status: input.status, version: '1' }; plans.set(row.planId, row); return row; },
      async listPlans(input) { calls.push(['listPlans', input]); return { items: [...plans.values()].filter((p) => p.organizationId === input.organizationId && (input.constraints.includeArchived || !p.archived)), page: { limit: input.constraints.limit } }; },
      async readPlan(input) { calls.push(['readPlan', input]); return plans.get(input.planId) || null; },
      async updatePlan(input) { calls.push(['updatePlan', input]); const row = { ...plans.get(input.planId), ...input, version: '2' }; plans.set(input.planId, row); return row; },
      async readProfile(input) { calls.push(['readProfile', input]); return profiles.get(input.organizationId) || null; },
      async replaceProfile(input) { calls.push(['replaceProfile', input]); const row = { organizationId: input.organizationId, planningMode: input.planningMode, preferences: input.preferences, version: '2' }; profiles.set(input.organizationId, row); return row; },
    },
    authorizationContextPort: { async validateDataScope(input) { calls.push(['scope', input]); return { allowed: true }; } },
    idempotencyLedgerPort: { async lookup({ key }) { return ledger.get(key) || null; }, async recordSuccess({ key, fingerprint, result }) { ledger.set(key, { fingerprint, result }); } },
    concurrencyPort: { async assertIfMatch(input) { calls.push(['ifMatch', input]); } },
    auditPort: { async record(input) { calls.push(['audit', input]); } },
    outboxPort: { async enqueue(input) { calls.push(['outbox', input]); } },
    unitOfWorkPort: { async transaction(work) { calls.push(['transaction']); return work(api); } },
  };
  return api;
}

test('create plan validates scope, records idempotency, audit and outbox atomically', async () => {
  const p = ports();
  const services = createPlanningApplicationServices(p);
  const result = await services.createPlan({ title: 'Roadmap' }, context('createPlan'));
  assert.equal(result.ok, true);
  assert.equal(result.value.organizationId, 'org-1');
  assert.deepEqual(p.calls.map(([name]) => name), ['scope', 'transaction', 'createPlan', 'audit', 'outbox']);
  assert.equal(p.ledger.get('idem-1').result.planId, 'p1');
});

test('list plans applies constraints before persistence lookup returns page', async () => {
  const p = ports({ plans: [{ planId: 'p1', organizationId: 'org-1', title: 'A' }, { planId: 'p2', organizationId: 'org-1', title: 'B', archived: true }] });
  const result = await createPlanningApplicationServices(p).listPlans({ limit: 1000 }, context('listPlans'));
  assert.equal(result.ok, true);
  assert.equal(result.value.items.length, 1);
  assert.equal(p.calls.find(([name]) => name === 'listPlans')[1].constraints.limit, 100);
});

test('read plan validates tenant data scope before lookup or disclosure', async () => {
  const p = ports({ plans: [{ planId: 'p1', organizationId: 'org-1', title: 'A' }] });
  const result = await createPlanningApplicationServices(p).readPlan({ planId: 'p1' }, context('getPlan'));
  assert.equal(result.ok, true);
  assert.deepEqual(p.calls.map(([name]) => name).slice(0, 2), ['scope', 'readPlan']);
});

test('update plan rejects stale If-Match and approved-plan mutation', async () => {
  const p = ports({ plans: [{ planId: 'p1', organizationId: 'org-1', title: 'A', status: 'draft', version: '3' }] });
  const stale = await createPlanningApplicationServices(p).updatePlan({ planId: 'p1', title: 'B' }, context('updatePlan', { concurrency: { etag: '2' } }));
  assert.equal(stale.ok, false);
  assert.equal(stale.problem.code, 'planning.remote.precondition_failed');
  const approvedPorts = ports({ plans: [{ planId: 'p2', organizationId: 'org-1', title: 'A', status: 'approved', version: '1' }] });
  const approved = await createPlanningApplicationServices(approvedPorts).updatePlan({ planId: 'p2', title: 'B' }, context('updatePlan', { concurrency: { etag: '1' } }));
  assert.equal(approved.problem.detailKey, 'approved_plan_mutation_denied');
});

test('idempotency fingerprint conflict and replay are enforced', async () => {
  const p = ports();
  const services = createPlanningApplicationServices(p);
  const ctx = context('createPlan', { idempotency: { key: 'same-key', requestFingerprint: 'fp-1' } });
  assert.equal((await services.createPlan({ title: 'A' }, ctx)).ok, true);
  assert.equal((await services.createPlan({ title: 'A' }, ctx)).value.planId, 'p1');
  const conflict = await services.createPlan({ title: 'A' }, context('createPlan', { idempotency: { key: 'same-key', requestFingerprint: 'fp-2' } }));
  assert.equal(conflict.problem.code, 'planning.remote.idempotency_conflict');
});

test('read and replace profile enforce scope, If-Match, audit, outbox and idempotency', async () => {
  const p = ports({ profiles: [{ organizationId: 'org-1', planningMode: 'standard', preferences: {}, version: '1' }] });
  const services = createPlanningApplicationServices(p);
  assert.equal((await services.readProfile({}, context('getProfile'))).ok, true);
  const result = await services.replaceProfile({ planningMode: 'agile', preferences: {}, ifMatch: '1' }, context('replaceProfile', { concurrency: { etag: '1' } }));
  assert.equal(result.ok, true);
  assert.ok(p.calls.some(([name]) => name === 'audit'));
  assert.ok(p.calls.some(([name]) => name === 'outbox'));
});
