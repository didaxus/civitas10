const test = require('node:test');
const assert = require('node:assert/strict');
const { digest, createProductionHandoffService, createPlasmaProductionHandoffAdapter, HandoffContractError } = require('../production-handoff');

const content = '{"release":"approved"}';
const hash = digest(content);
const base = Object.freeze({ handoffId: 'handoff-1', organizationId: 'org-1', planId: 'plan-1', planVersion: 7, contentHash: hash, content, provenance: { kind: 'civitas-approved-plan', approvedAt: '2026-07-29T00:00:00.000Z', approvedBy: 'user-1' }, correlationId: 'corr-1', operationId: 'op-1' });

function fixture(overrides = {}) {
  const rows = new Map(), emitted = [], calls = [];
  const client = {
    async submitRelease(payload) { calls.push(payload); return { receiptId: 'receipt-1', status: 'accepted', tenant: payload.tenant, externalId: payload.release.externalId, digest: payload.release.digest }; },
    async getReleaseReceipt({ tenant, externalId }) { return { receiptId: 'receipt-recovered', organizationId: tenant, handoffId: externalId, contentHash: hash }; },
    async cancelRelease() {}, async activatePriorRelease() {}, ...overrides.client,
  };
  const operations = { async findByHandoff(org, id) { return [...rows.values()].find(x => x.organizationId === org && x.handoffId === id) || null; }, async create(row) { rows.set(row.id, row); }, async transition(id, state, detail = {}) { const row = { ...rows.get(id), ...detail, state }; rows.set(id, row); return row; } };
  const plans = { async getApprovedVersion() { return overrides.approved === undefined ? { version: 7, contentHash: hash } : overrides.approved; }, hash: digest };
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
  const version = fixture({ approved: { version: 6, contentHash: hash } });
  await assert.rejects(() => version.service.handoff(base), e => e.reasonCode === 'handoff_plan_version_not_approved'); assert.equal(version.calls.length, 0);
  const mismatch = fixture({ approved: { version: 7, contentHash: digest('different') } });
  await assert.rejects(() => mismatch.service.handoff(base), e => e.reasonCode === 'handoff_hash_mismatch'); assert.equal(mismatch.calls.length, 0);
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
