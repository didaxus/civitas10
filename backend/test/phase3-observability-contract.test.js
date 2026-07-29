'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { canonicalContext, createTelemetry, redact } = require('../observability/phase3-telemetry');

test('telemetry emits canonical correlation fields and redacts sensitive fields', () => {
  const lines = [];
  const telemetry = createTelemetry({ service: 'integration', version: '3.0.0', environment: 'test', sink: (line) => lines.push(line) });
  telemetry.log('info', 'operation.accepted', { email: 'person@example.test', safe: 'ok' }, { tenantId: 'tenant-a' });
  const record = JSON.parse(lines[0]);
  assert.match(record.traceId, /^[0-9a-f]{32}$/);
  assert.match(record.spanId, /^[0-9a-f]{16}$/);
  assert.equal(record.fields.email, '[REDACTED]');
  assert.equal(record.fields.safe, 'ok');
  assert.equal(record.tenantId, 'tenant-a');
});

test('invalid externally supplied trace identifiers fail closed', () => {
  assert.throws(() => canonicalContext({ traceId: 'unsafe' }), /CANONICAL_TRACE_ID_INVALID/);
});

test('redaction is recursive, including arrays', () => {
  assert.deepEqual(redact({ nested: [{ accessToken: 'x', count: 2 }] }), { nested: [{ accessToken: '[REDACTED]', count: 2 }] });
});
