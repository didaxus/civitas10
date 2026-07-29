const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');

const { runSqlMigrations, assertOperationalSchema } = require('../runtime/migrations');
const {
  createPostgresIntegrationRepository,
  createIntegrationDispatcher,
  createIntegrationEvent,
  REASON_CODES,
  OPERATION_STATES,
  IntegrationEventError,
} = require('../services/integrationEvents');

if (!process.env.DATABASE_URL && process.env.P3_010_POSTGRES_CHECK === '1') {
  throw new Error('DATABASE_URL is required for integration:p3-010:postgres-check');
}

if (!process.env.DATABASE_URL) {
  test('P3-010 PostgreSQL integration requires DATABASE_URL only in postgres-check', {
    skip: 'DATABASE_URL is mandatory for integration:p3-010:postgres-check',
  }, () => {});
  return;
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 12 });

before(async () => {
  await runSqlMigrations({ pool, logger: { log() {} } });
  await assertOperationalSchema({ pool });
});

beforeEach(async () => {
  await pool.query(`
    truncate table
      integration_dead_letters,
      integration_inbox_receipts,
      integration_outbox_events,
      operational_operation_steps,
      operational_operations,
      audit_logs
    restart identity cascade
  `);
});

after(async () => {
  await pool.end();
});

function event(id = '00000000-0000-4000-8000-000000000001', organizationId = 'orgA') {
  return createIntegrationEvent({
    eventId: id,
    eventType: 'operations.operation.started',
    organizationId,
    aggregate: { type: 'operation', id: 'op1' },
    actor: { type: 'system', serviceId: 'svc' },
    correlation: { correlationId: `corr-${organizationId}` },
    causation: {},
    source: {
      moduleId: 'operations',
      capabilityId: 'operations.lifecycle',
      component: 'test',
    },
    payload: { operationId: 'op1' },
  });
}

async function claimSingle(repository, leaseOwner) {
  const claimed = await repository.claimBatch({ limit: 1, leaseOwner });
  assert.equal(claimed.length, 1);
  return claimed[0];
}

test('PostgreSQL outbox/inbox operations support atomicity, duplicate delivery and tenant isolation', async () => {
  const repository = createPostgresIntegrationRepository({ pool });
  await repository.appendEvent(event());
  await repository.appendEvent(event('00000000-0000-4000-8000-000000000002', 'orgB'));

  const [first, second] = await Promise.all([
    repository.claimBatch({ limit: 1, leaseOwner: 'w1' }),
    repository.claimBatch({ limit: 1, leaseOwner: 'w2' }),
  ]);
  assert.equal(new Set([first[0].event_id, second[0].event_id]).size, 2);

  await repository.markPublished({ eventId: first[0].event_id, leaseOwner: first[0].lease_owner });
  assert.equal(
    (await repository.findByEventId({
      organizationId: first[0].logto_organization_id,
      eventId: first[0].event_id,
    })).state,
    'published',
  );

  const receipt = await repository.claimInbox({ consumerId: 'operations.projection', event: event() });
  await repository.markInboxProcessed({
    consumerId: 'operations.projection',
    eventId: event().eventId,
    leaseOwner: receipt.lease_owner,
    result: { reference: 'ok' },
  });
  await assert.rejects(
    () => repository.claimInbox({ consumerId: 'operations.projection', event: event() }),
    { code: REASON_CODES.INBOX_DUPLICATE },
  );
  assert.equal(
    await repository.findByEventId({ organizationId: 'orgB', eventId: event().eventId }),
    null,
  );

  const operation = await repository.createOperation({
    organizationId: 'orgA',
    operationType: 'integration.test',
    moduleId: 'operations',
    capabilityId: 'operations.lifecycle',
    requestedBy: { type: 'system' },
    correlationId: 'corr-op',
  });
  const queued = await repository.transitionOperation({
    organizationId: 'orgA',
    operationId: operation.id,
    expectedVersion: operation.version,
    toState: OPERATION_STATES.QUEUED,
    principal: { principalType: 'system' },
    reason: 'queue',
  });
  const running = await repository.transitionOperation({
    organizationId: 'orgA',
    operationId: operation.id,
    expectedVersion: queued.version,
    toState: OPERATION_STATES.RUNNING,
    principal: { principalType: 'system' },
    reason: 'run',
    progress: { percentage: 10 },
  });
  await repository.transitionOperation({
    organizationId: 'orgA',
    operationId: operation.id,
    expectedVersion: running.version,
    toState: OPERATION_STATES.SUCCEEDED,
    principal: { principalType: 'system' },
    reason: 'done',
    result: { reference: 'result' },
  });
  await assert.rejects(
    () => repository.transitionOperation({
      organizationId: 'orgA',
      operationId: operation.id,
      expectedVersion: running.version,
      toState: OPERATION_STATES.RUNNING,
    }),
    { code: REASON_CODES.OPERATION_VERSION_CONFLICT },
  );
  await assert.rejects(
    () => repository.transitionOperation({
      organizationId: 'orgB',
      operationId: operation.id,
      expectedVersion: 1,
      toState: OPERATION_STATES.QUEUED,
    }),
    { code: REASON_CODES.OPERATION_VERSION_CONFLICT },
  );
});

test('operation idempotency is scoped by organization and safe under concurrency', async () => {
  const repository = createPostgresIntegrationRepository({ pool });
  const input = {
    operationType: 'integration.test',
    moduleId: 'operations',
    capabilityId: 'operations.lifecycle',
    requestedBy: { type: 'system' },
    idempotencyKey: 'same-request',
  };

  const sameTenant = await Promise.all([
    repository.createOperation({ ...input, organizationId: 'orgA' }),
    repository.createOperation({ ...input, organizationId: 'orgA' }),
    repository.createOperation({ ...input, organizationId: 'orgA' }),
  ]);
  assert.equal(new Set(sameTenant.map((operation) => operation.id)).size, 1);

  const otherTenant = await repository.createOperation({ ...input, organizationId: 'orgB' });
  assert.notEqual(otherTenant.id, sameTenant[0].id);

  const firstWithoutKey = await repository.createOperation({ ...input, organizationId: 'orgA', idempotencyKey: null });
  const secondWithoutKey = await repository.createOperation({ ...input, organizationId: 'orgA', idempotencyKey: null });
  assert.notEqual(firstWithoutKey.id, secondWithoutKey.id);
});

test('dispatcher marks published after ack and sends terminal failures to DLQ', async () => {
  const repository = createPostgresIntegrationRepository({ pool });
  await repository.appendEvent(event());
  const dispatcher = createIntegrationDispatcher({
    repository,
    transport: { publish: async () => true },
  });
  assert.equal((await dispatcher.dispatchOnce()).at(0).state, 'published');

  await repository.appendEvent(event('00000000-0000-4000-8000-000000000003'));
  const failingDispatcher = createIntegrationDispatcher({
    repository,
    transport: {
      publish: async () => {
        throw new IntegrationEventError(REASON_CODES.PAYLOAD_PROHIBITED, 'bad');
      },
    },
  });
  const result = await failingDispatcher.dispatchOnce();
  assert.equal(result[0].state, 'terminal');
  assert.equal((await pool.query('select * from integration_dead_letters')).rowCount, 1);
});

test('inbox claim ownership is atomic across duplicates, active leases, expired leases and processed receipts', async () => {
  const repository = createPostgresIntegrationRepository({ pool });
  const inboxEvent = event('00000000-0000-4000-8000-000000000010');
  const claims = await Promise.allSettled([
    repository.claimInbox({ consumerId: 'operations.projection', event: inboxEvent, leaseOwner: 'c1', leaseSeconds: 30 }),
    repository.claimInbox({ consumerId: 'operations.projection', event: inboxEvent, leaseOwner: 'c2', leaseSeconds: 30 }),
  ]);
  assert.equal(claims.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(
    claims.filter((result) => result.status === 'rejected' && result.reason.code === REASON_CODES.INBOX_PROCESSING).length,
    1,
  );

  const activeOwner = claims.find((result) => result.status === 'fulfilled').value.lease_owner;
  await assert.rejects(
    () => repository.claimInbox({ consumerId: 'operations.projection', event: inboxEvent, leaseOwner: 'thief', leaseSeconds: 30 }),
    { code: REASON_CODES.INBOX_PROCESSING },
  );
  assert.equal(
    (await pool.query(
      'select lease_owner from integration_inbox_receipts where consumer_id=$1 and event_id=$2',
      ['operations.projection', inboxEvent.eventId],
    )).rows[0].lease_owner,
    activeOwner,
  );

  await pool.query(
    "update integration_inbox_receipts set lease_expires_at=now()-interval '1 second' where consumer_id=$1 and event_id=$2",
    ['operations.projection', inboxEvent.eventId],
  );
  const reacquired = await repository.claimInbox({
    consumerId: 'operations.projection',
    event: inboxEvent,
    leaseOwner: 'reacquire',
    leaseSeconds: 30,
  });
  assert.notEqual(reacquired.lease_owner, activeOwner);

  await repository.markInboxProcessed({
    consumerId: 'operations.projection',
    eventId: inboxEvent.eventId,
    leaseOwner: reacquired.lease_owner,
    result: { reference: 'ok' },
  });
  await assert.rejects(
    () => repository.claimInbox({ consumerId: 'operations.projection', event: inboxEvent }),
    { code: REASON_CODES.INBOX_DUPLICATE },
  );
});

test('DLQ is durable for terminal errors, exhausted retries and rolls back when DLQ insert fails', async () => {
  const repository = createPostgresIntegrationRepository({ pool });

  const terminal = event('00000000-0000-4000-8000-000000000020');
  await repository.appendEvent(terminal);
  const terminalClaim = await claimSingle(repository, 'terminal');
  await repository.moveToDeadLetter({
    eventId: terminal.eventId,
    leaseOwner: terminalClaim.lease_owner,
    reasonCode: REASON_CODES.PAYLOAD_PROHIBITED,
  });
  assert.equal((await pool.query('select count(*)::int as n from integration_dead_letters')).rows[0].n, 1);

  const exhausted = event('00000000-0000-4000-8000-000000000021');
  await repository.appendEvent(exhausted);
  const exhaustedClaim = await claimSingle(repository, 'retry');
  await pool.query(
    'update integration_outbox_events set attempt_count=max_attempts where event_id=$1',
    [exhausted.eventId],
  );
  await repository.scheduleRetry({
    eventId: exhausted.eventId,
    leaseOwner: exhaustedClaim.lease_owner,
    error: new Error('timeout'),
  });
  assert.equal(
    (await pool.query('select state from integration_outbox_events where event_id=$1', [exhausted.eventId])).rows[0].state,
    'dead_lettered',
  );
  assert.equal((await pool.query('select count(*)::int as n from integration_dead_letters')).rows[0].n, 2);

  const rollback = event('00000000-0000-4000-8000-000000000022');
  await repository.appendEvent(rollback);
  const rollbackClaim = await claimSingle(repository, 'rollback');
  const beforeState = (
    await pool.query('select state, version from integration_outbox_events where event_id=$1', [rollback.eventId])
  ).rows[0];
  await assert.rejects(
    () => repository.moveToDeadLetter({
      eventId: rollback.eventId,
      leaseOwner: rollbackClaim.lease_owner,
      reasonCode: 'x'.repeat(200),
    }),
  );
  const afterState = (
    await pool.query('select state, version from integration_outbox_events where event_id=$1', [rollback.eventId])
  ).rows[0];
  assert.deepEqual(afterState, beforeState);
  assert.equal(
    (await pool.query('select count(*)::int as n from integration_dead_letters where event_id=$1', [rollback.eventId])).rows[0].n,
    0,
  );
});
