const test = require('node:test');
const assert = require('node:assert/strict');
const { digest, createProductionHandoffService, createPlasmaProductionHandoffAdapter, createProductionHandoffInbox, HandoffContractError } = require('../production-handoff');

const content = '{"release":"approved"}';
const hash = digest(content);
const base = Object.freeze({ handoffId: 'handoff-1', organizationId: 'org-1', planId: 'plan-1', planVersion: 7, planState:'approved', planImmutable:true, contentHash: hash, content, outputSpecs:[{id:'output-1'}], priorities:[{id:'priority-1',rank:1}], dependencies:[{id:'dependency-1'}], acceptanceCriteria:[{id:'criterion-1'}], governedReferences:[{kind:'planning-document',id:'doc-1',version:'3'}], permission:'planning.production_handoffs.manage', dataScope:'approved_plans', authorizationDecisionId:'decision-1', provenance: { kind: 'civitas-approved-plan', approvedAt: '2026-07-29T00:00:00.000Z', approvedBy: 'user-1', sourceVersion:'planning/v7', decisionId:'approval-1' }, correlationId: 'corr-1', operationId: 'op-1' });

function fixture(overrides = {}) {
  const rows = new Map(), emitted = [], calls = [];
  const client = {
    async submitRelease(payload) { calls.push(payload); return { receiptId: 'receipt-1', status: 'accepted', tenant: payload.tenant, externalId: payload.release.externalId, digest: payload.release.digest }; },
    async getReleaseReceipt({ tenant, externalId }) { return { receiptId: 'receipt-recovered', organizationId: tenant, handoffId: externalId, contentHash: hash }; },
    async cancelRelease() { return {status:'cancelled'}; }, async activatePriorRelease() { return {receiptId:'rollback-1'}; }, ...overrides.client,
  };
  const operations = { async findByHandoff(org, id) { return [...rows.values()].find(x => x.organizationId === org && x.handoffId === id) || null; }, async create(row) { rows.set(row.id, row); }, async transition(id, state, detail = {}) { const row = { ...rows.get(id), ...detail, state }; rows.set(id, row); return row; } };
  const plans = { async getApprovedVersion() { return overrides.approved === undefined ? { version: 7, contentHash: hash, state:'approved', immutable:true } : overrides.approved; }, hash: digest };
  const events = { async append(event) { emitted.push(event); } };
  const port = createPlasmaProductionHandoffAdapter({ client });
  return { service: createProductionHandoffService({ port, plans, operations, events, timeoutMs: overrides.timeoutMs || 20 }), calls, emitted, rows };
}

test('duplicate delivery is idempotent and does not call Plasma twice', async () => {
  const f = fixture(); await f.service.handoff(base); const duplicate = await f.service.handoff(base);
  assert.equal(f.calls.length, 1); assert.equal(duplicate.state, 'succeeded');
});

test('wrong receipt tenant is rejected canonically', async () => {
  const f = fixture({ client: { async submitRelease(p) { return { receiptId: 'bad', status: 'accepted', tenant: 'org-other', externalId: p.release.externalId, digest: p.release.digest }; } } });
  await assert.rejects(() => f.service.handoff(base), e => e.reasonCode === 'handoff_receipt_tenant_mismatch');
  assert.equal(f.emitted.at(-1).type, 'production.handoff.rejected'); assert.equal(f.rows.get('op-1').state, 'failed');
});

test('unapproved versions and inconsistent hashes are rejected before delivery', async () => {
  const version = fixture({ approved: { version: 6, contentHash: hash, state:'approved', immutable:true } });
  await assert.rejects(() => version.service.handoff(base), e => e.reasonCode === 'handoff_plan_version_not_approved'); assert.equal(version.calls.length, 0);
  const mismatch = fixture({ approved: { version: 7, contentHash: digest('different'), state:'approved', immutable:true } });
  await assert.rejects(() => mismatch.service.handoff(base), e => e.reasonCode === 'handoff_hash_mismatch'); assert.equal(mismatch.calls.length, 0);
});

test('receiver inbox makes duplicate receipt idempotent and rejects a changed hash', async () => {
  const stored = new Map(); let effects = 0;
  const inbox = createProductionHandoffInbox({ receipts:{ async find(org,id){return stored.get(`${org}:${id}`)||null;},async insert(r){stored.set(`${r.organizationId}:${r.handoffId}`,r);} }, apply:async()=>{effects++;return {receiptId:'receipt-1'};} });
  const handoff = require('../production-handoff').createProductionHandoff(base);
  await inbox.receive(handoff); const duplicate = await inbox.receive(handoff);
  assert.equal(effects,1); assert.equal(duplicate.duplicate,true);
  await assert.rejects(()=>inbox.receive({...handoff,contentHash:digest('tampered')}),e=>e.reasonCode==='handoff_receipt_hash_mismatch');
});

test('cancellation and semantic rollback enforce operation state', async () => {
  const cancelled = fixture(); cancelled.rows.set('op-1',{id:'op-1',organizationId:'org-1',handoffId:'handoff-1',state:'running'});
  assert.equal((await cancelled.service.cancel(base)).state,'cancelled');
  const rolled = fixture(); await rolled.service.handoff(base);
  assert.equal((await rolled.service.rollback(base,{handoffId:'prior-1',contentHash:digest('prior')})).state,'rolled_back');
});

test('provider rejection is recorded', async () => {
  const f = fixture({ client: { async submitRelease(p) { return { receiptId: 'no', status: 'rejected', tenant: p.tenant, externalId: p.release.externalId, digest: p.release.digest }; } } });
  await assert.rejects(() => f.service.handoff(base), HandoffContractError); assert.equal(f.emitted.at(-1).type, 'production.handoff.rejected');
});

test('timeout is recorded and matching reconciliation recovers delivery', async () => {
  const f = fixture({ timeoutMs: 5, client: { async submitRelease() { return new Promise(() => {}); } } });
  assert.equal((await f.service.handoff(base)).state, 'timed_out'); assert.equal(f.emitted.at(-1).type, 'production.handoff.timed_out');
  const recovered = await f.service.reconcile(base); assert.equal(recovered.reconciled, true); assert.equal(f.emitted.at(-1).type, 'production.handoff.reconciled');
});

test('wire request and canonical events contain no private task or asset details', async () => {
  const f = fixture(); await f.service.handoff({ ...base, tasks: [{ secret: 'private' }], assets: [{ source: 'internal' }], providerConfig: { token: 'secret' } });
  const serialized = JSON.stringify({ calls: f.calls, events: f.emitted });
  for (const forbidden of ['tasks', 'assets', 'providerConfig', 'private', 'internal', 'token']) assert.equal(serialized.includes(forbidden), false);
});
