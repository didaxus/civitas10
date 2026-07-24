const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ScimProtocolError,
  assertPayloadSize,
  assertScimJsonContentType,
  createScimError,
  generateEtag,
  paginateScim,
  parseScimFilter,
  stableOrder,
  validateIfMatch,
} = require('../scim/protocol');

test('SCIM content type handling is strict to application/scim+json', () => {
  assert.doesNotThrow(() => assertScimJsonContentType('application/scim+json'));
  assert.doesNotThrow(() => assertScimJsonContentType('Application/Scim+Json; charset=utf-8'));
  assert.throws(() => assertScimJsonContentType('application/json'), /Content-Type/);
  assert.throws(() => assertScimJsonContentType('application/scim+json; profile=x'), /Content-Type/);
});

test('payload size limit reports SCIM protocol error', () => {
  assert.equal(assertPayloadSize('abc', 3), 3);
  assert.throws(() => assertPayloadSize('abcd', 3), (error) => error instanceof ScimProtocolError && error.status === 413 && error.scimType === 'tooLarge');
});

test('SCIM pagination is one-based and returns ListResponse metadata', () => {
  const response = paginateScim([{ id: '1' }, { id: '2' }, { id: '3' }], { startIndex: 2, count: 1 });
  assert.deepEqual(response.Resources, [{ id: '2' }]);
  assert.equal(response.startIndex, 2);
  assert.equal(response.itemsPerPage, 1);
  assert.equal(response.totalResults, 3);
});

test('stable ordering sorts by configured selector with id tie-breaker', () => {
  const ordered = stableOrder([{ id: 'b', userName: 'sam' }, { id: 'a', userName: 'sam' }, { id: 'c', userName: 'amy' }], ['userName']);
  assert.deepEqual(ordered.map((item) => item.id), ['c', 'a', 'b']);
});

test('ETags are canonical and If-Match validation rejects mismatches', () => {
  const etag = generateEtag({ b: 2, a: 1 });
  assert.equal(etag, generateEtag({ a: 1, b: 2 }));
  assert.equal(validateIfMatch(etag, etag), true);
  assert.equal(validateIfMatch('*', etag), true);
  assert.throws(() => validateIfMatch('W/"other"', etag), (error) => error.status === 412);
});

test('RFC 7644 error response shape includes status and optional scimType', () => {
  assert.deepEqual(createScimError(400, 'Bad filter', 'invalidFilter'), {
    schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
    status: '400',
    detail: 'Bad filter',
    scimType: 'invalidFilter',
  });
});

test('allowlisted filters support only MVP equality attributes', () => {
  assert.deepEqual(parseScimFilter('userName eq "ada"'), { attribute: 'userName', operator: 'eq', value: 'ada' });
  assert.deepEqual(parseScimFilter('externalId eq "ext-1"'), { attribute: 'externalId', operator: 'eq', value: 'ext-1' });
  assert.deepEqual(parseScimFilter('id eq "u-1"'), { attribute: 'id', operator: 'eq', value: 'u-1' });
  assert.deepEqual(parseScimFilter('displayName eq "Ada Lovelace"'), { attribute: 'displayName', operator: 'eq', value: 'Ada Lovelace' });
  assert.throws(() => parseScimFilter('emails.value eq "a@example.com"'), (error) => error.status === 400 && error.scimType === 'invalidFilter');
  assert.throws(() => parseScimFilter('userName co "ada"'), (error) => error.status === 400 && error.scimType === 'invalidFilter');
});
