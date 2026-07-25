const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const contractsDir = path.join(root, 'contracts', 'events', 'planning');
const schemasDir = path.join(contractsDir, 'schemas');
const fixturesDir = path.join(contractsDir, 'fixtures');

const unsafeKey = /(secret|password|token|api[_-]?key|authorization|bearer|private[_-]?key|credential|cookie|email|phone|address|name)/i;
const unsafeValue = /(bearer\s+|authorization:|[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|\w+:\w+@)/i;
const schemaByEventType = {
  'planning.plan.created.v1': 'planning-plan-created-v1.schema.json',
  'planning.profile.updated.v1': 'planning-profile-updated-v1.schema.json',
};

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function assertSafeObject(value, pathName = 'event') {
  if (Array.isArray(value)) return value.forEach((item, index) => assertSafeObject(item, `${pathName}[${index}]`));
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string') assert.doesNotMatch(value, unsafeValue, `${pathName} has unsafe value`);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    assert.doesNotMatch(key, unsafeKey, `${pathName}.${key} has unsafe key`);
    assertSafeObject(child, `${pathName}.${key}`);
  }
}

function validatePlanningEvent(event) {
  assert.ok(schemaByEventType[event.eventType], 'known planning event type');
  assert.equal(event.version, 1);
  for (const key of ['eventId', 'occurredAt', 'organizationId', 'actor', 'correlationId', 'decision', 'causation', 'sensitivity', 'payload', 'diff']) {
    assert.notEqual(event[key], undefined, `${key} is required`);
  }
  assert.match(event.eventId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.ok(!Number.isNaN(Date.parse(event.occurredAt)), 'occurredAt is date-time');
  assert.match(event.organizationId, /\S/);
  assert.ok(['user', 'service', 'system'].includes(event.actor.type));
  assert.match(event.actor.id, /\S/);
  assert.equal(event.actor.redacted, true, 'actor must be redacted');
  assert.match(event.correlationId, /\S/);
  assert.match(event.decision.decisionId, /\S/);
  assert.match(event.decision.policyVersion, /\S/);
  assert.match(event.causation.causationId, /\S/);
  assert.ok(['public', 'internal', 'confidential', 'restricted'].includes(event.sensitivity));
  assert.equal(event.payload.redacted, true, 'payload must be marked redacted');
  assert.equal(event.diff.redacted, true, 'diff must be marked redacted');
  assert.ok(Array.isArray(event.diff.changes), 'diff changes are required');
  for (const change of event.diff.changes) {
    assert.doesNotMatch(change.path, unsafeKey, `${change.path} is sensitive`);
    if ('before' in change) assert.ok(change.before === '[redacted]' || change.before === null, 'before values must be redacted');
    if ('after' in change) assert.ok(change.after === '[redacted]' || change.after === null, 'after values must be redacted');
  }
  assertSafeObject(event.payload, 'payload');
  assertSafeObject(event.diff, 'diff');
}

test('planning event schemas require governed metadata and redacted payload/diff fields', () => {
  for (const [eventType, file] of Object.entries(schemaByEventType)) {
    const schema = readJson(path.join(schemasDir, file));
    for (const key of ['eventId', 'eventType', 'version', 'occurredAt', 'organizationId', 'actor', 'correlationId', 'decision', 'causation', 'sensitivity', 'payload', 'diff']) {
      assert.ok(schema.required.includes(key), `${file} requires ${key}`);
    }
    assert.equal(schema.properties.eventType.const, eventType);
    assert.equal(schema.properties.version.const, 1);
    assert.equal(schema.$defs.redactedDiff.properties.redacted.const, true);
    assert.equal(schema.$defs.safePayload.properties.redacted.const, true);
  }
});

test('planning valid compatibility fixtures are accepted', () => {
  for (const file of fs.readdirSync(path.join(fixturesDir, 'valid'))) {
    assert.doesNotThrow(() => validatePlanningEvent(readJson(path.join(fixturesDir, 'valid', file))), file);
  }
});

test('planning unsafe or sensitive compatibility fixtures are rejected', () => {
  for (const file of fs.readdirSync(path.join(fixturesDir, 'rejected'))) {
    assert.throws(() => validatePlanningEvent(readJson(path.join(fixturesDir, 'rejected', file))), undefined, file);
  }
});
