const test = require('node:test');
const assert = require('node:assert/strict');
const { createScimCredentialService, InMemoryScimCredentialRepository, SCIM_CREDENTIAL_SCOPES, parseBearerToken, verifySecretHash, cidrAllows } = require('../scim/credentials');

test('SCIM credentials issue at least 256-bit opaque tokens and store only one-way hashes', async () => {
  const service = createScimCredentialService();
  const { bearerToken, credential } = await service.issueCredential({ logtoOrganizationId: 'org_1', connectionId: '00000000-0000-0000-0000-000000000001' });
  const parsed = parseBearerToken(bearerToken);
  assert.ok(parsed.secret.length >= 43);
  assert.equal(credential.secretHash, undefined);
  const stored = await service.repository.findByKeyId(credential.keyId);
  assert.notEqual(stored.secretHash, parsed.secret);
  assert.equal(verifySecretHash(parsed.secret, stored.secretHash), true);
});

test('SCIM credentials bind to one tenant connection and enforce scopes, CIDR, expiration and revocation', async () => {
  let now = new Date('2026-01-01T00:00:00Z');
  const service = createScimCredentialService({ repository: new InMemoryScimCredentialRepository(), clock: () => now });
  const { bearerToken } = await service.issueCredential({ logtoOrganizationId: 'org_1', connectionId: 'conn_1', scopes: ['scim.users.read'], cidrAllowlist: ['203.0.113.0/24'], expiresAt: '2026-01-01T01:00:00Z' });
  assert.equal((await service.authenticate({ authorization: `Bearer ${bearerToken}`, logtoOrganizationId: 'org_1', connectionId: 'conn_1', requiredScopes: ['scim.users.read'], ip: '203.0.113.9' })).ok, true);
  assert.equal((await service.authenticate({ authorization: bearerToken, logtoOrganizationId: 'org_2', connectionId: 'conn_1', requiredScopes: ['scim.users.read'], ip: '203.0.113.9' })).ok, false);
  assert.equal((await service.authenticate({ authorization: bearerToken, logtoOrganizationId: 'org_1', connectionId: 'conn_1', requiredScopes: ['scim.users.write'], ip: '203.0.113.9' })).ok, false);
  assert.equal((await service.authenticate({ authorization: bearerToken, logtoOrganizationId: 'org_1', connectionId: 'conn_1', requiredScopes: ['scim.users.read'], ip: '198.51.100.1' })).ok, false);
  now = new Date('2026-01-01T01:00:01Z');
  assert.equal((await service.authenticate({ authorization: bearerToken, logtoOrganizationId: 'org_1', connectionId: 'conn_1', requiredScopes: ['scim.users.read'], ip: '203.0.113.9' })).ok, false);
  await service.revokeCredential({ logtoOrganizationId: 'org_1', keyId: parseBearerToken(bearerToken).keyId });
  assert.equal((await service.authenticate({ authorization: bearerToken, logtoOrganizationId: 'org_1', connectionId: 'conn_1', requiredScopes: ['scim.users.read'], ip: '203.0.113.9' })).ok, false);
});

test('SCIM credential rotation supports dual-token overlap and exported scopes', async () => {
  let now = new Date('2026-01-01T00:00:00Z');
  const service = createScimCredentialService({ clock: () => now });
  const first = await service.issueCredential({ logtoOrganizationId: 'org_1', connectionId: 'conn_1' });
  const second = await service.rotateCredential({ logtoOrganizationId: 'org_1', connectionId: 'conn_1', previousKeyId: first.credential.keyId, overlapUntil: '2026-12-31T00:00:00Z' });
  assert.equal((await service.authenticate({ authorization: first.bearerToken, requiredScopes: ['scim.groups.write'] })).ok, true);
  assert.equal((await service.authenticate({ authorization: second.bearerToken, requiredScopes: ['scim.groups.write'] })).ok, true);
  now = new Date('2027-01-01T00:00:01Z');
  assert.equal((await service.authenticate({ authorization: first.bearerToken, requiredScopes: ['scim.groups.write'] })).ok, false);
  assert.equal((await service.authenticate({ authorization: second.bearerToken, requiredScopes: ['scim.groups.write'] })).ok, true);
  assert.deepEqual(SCIM_CREDENTIAL_SCOPES, ['scim.users.read','scim.users.write','scim.groups.read','scim.groups.write']);
  assert.equal(cidrAllows('192.0.2.4', ['192.0.2.0/24']), true);
});
