const test = require('node:test');
const assert = require('node:assert/strict');
const { SignJWT, generateKeyPair, exportJWK } = require('jose');
const { createLogtoEnterpriseSsoAdapter, safeJsonFetch } = require('../identity-federation/adapters/logtoEnterpriseSsoAdapter');

const ISSUER = 'https://auth.example.com/oidc';
const RESOURCE = 'https://civitas.example.com/api';
const publicDns = async () => [{ address: '93.184.216.34', family: 4 }];

function jsonResponse(value, init = {}) {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json', ...(init.headers || {}) } });
}

async function signedToken(claims = {}, header = {}) {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'test-key';
  const token = await new SignJWT({ sub: 'user-1', ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key', ...header })
    .setIssuer(claims.iss || ISSUER)
    .setAudience(claims.aud || RESOURCE)
    .setExpirationTime('5m')
    .sign(privateKey);
  return { token, jwks: { keys: [jwk] } };
}

function adapterWith({ metadata = {}, jwks, maxResponseBytes } = {}) {
  const fetchImpl = async (url) => {
    const path = new URL(url).pathname;
    if (path.endsWith('/.well-known/openid-configuration')) return jsonResponse({ issuer: ISSUER, jwks_uri: `${ISSUER}/jwks`, ...metadata });
    if (path.endsWith('/jwks')) return jsonResponse(jwks || { keys: [] });
    throw new Error(`unexpected URL ${url}`);
  };
  return createLogtoEnterpriseSsoAdapter({ issuer_or_entity_id: ISSUER, civitas_api_resource: RESOURCE, signing_algorithms: ['RS256'], secret_reference: 'vault://logto/sso', max_response_bytes: maxResponseBytes }, { fetchImpl, dnsLookup: publicDns, jwks });
}

test('enterprise SSO adapter rejects issuer path mismatch in OIDC metadata', async () => {
  const adapter = adapterWith({ metadata: { issuer: 'https://auth.example.com' } });
  await assert.rejects(() => adapter.discover(), /exactly match issuer_or_entity_id/);
});

test('enterprise SSO adapter rejects wrong audience', async () => {
  const { token, jwks } = await signedToken({ aud: 'https://wrong.example.com/api' });
  const adapter = adapterWith({ jwks });
  await assert.rejects(() => adapter.verifyOidcToken(token), /unexpected "aud" claim value|audience/);
});

test('enterprise SSO adapter validates azp against Civitas API resource', async () => {
  const { token, jwks } = await signedToken({ aud: [RESOURCE, 'https://other.example.com/api'], azp: 'https://other.example.com/api' });
  const adapter = adapterWith({ jwks });
  await assert.rejects(() => adapter.verifyOidcToken(token), /authorized party/);
});

test('enterprise SSO adapter rejects alg none before signature verification', async () => {
  const token = `${Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')}.${Buffer.from(JSON.stringify({ iss: ISSUER, aud: RESOURCE })).toString('base64url')}.`;
  const adapter = adapterWith();
  await assert.rejects(() => adapter.verifyOidcToken(token), /unsigned OIDC tokens are rejected/);
});

test('enterprise SSO adapter blocks loopback and private discovery URLs before transport', async () => {
  let called = false;
  const adapter = createLogtoEnterpriseSsoAdapter({ issuer_or_entity_id: 'https://127.0.0.1/oidc', civitas_api_resource: RESOURCE, signing_algorithms: ['RS256'], secretsRef: 'vault://logto/sso' }, { fetchImpl: async () => { called = true; return jsonResponse({}); }, dnsLookup: publicDns });
  await assert.rejects(() => adapter.discover(), /private or loopback/);
  assert.equal(called, false);

  const privateDnsAdapter = createLogtoEnterpriseSsoAdapter({ issuer_or_entity_id: ISSUER, civitas_api_resource: RESOURCE, signing_algorithms: ['RS256'], secretsRef: 'vault://logto/sso' }, { fetchImpl: async () => { called = true; return jsonResponse({}); }, dnsLookup: async () => [{ address: '10.0.0.3', family: 4 }] });
  await assert.rejects(() => privateDnsAdapter.discover(), /private or loopback/);
});

test('enterprise SSO adapter rejects oversized OIDC metadata and JWKS responses', async () => {
  await assert.rejects(() => safeJsonFetch(`${ISSUER}/.well-known/openid-configuration`, { dnsLookup: publicDns, maxResponseBytes: 8, fetchImpl: async () => new Response('{"issuer":"' + 'x'.repeat(32), { status: 200 }) }), /size limit/);

  const adapter = adapterWith({ maxResponseBytes: 8 });
  await assert.rejects(() => adapter.fetchJwks({ jwks_uri: `${ISSUER}/jwks` }), /size limit/);
});

test('enterprise SSO adapter rejects plaintext credential fields', () => {
  assert.throws(() => createLogtoEnterpriseSsoAdapter({ issuer_or_entity_id: ISSUER, civitas_api_resource: RESOURCE, signing_algorithms: ['RS256'], client_secret: 'plaintext' }), /secret_reference or secretsRef/);
});
