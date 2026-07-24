const test = require('node:test');
const assert = require('node:assert/strict');

async function loadProbe() {
  return import('../../scripts/discovery/logto-identity-federation-probe.mjs');
}

function policy(mod) {
  return mod.buildPolicy({ endpoint: 'https://auth.didaxus.com', allowedPaths: ['/api/users'], maxResponseBytes: 16 });
}

const publicResolver = async () => [{ address: '93.184.216.34', family: 4 }];

test('probe rejects unsafe management methods before transport', async () => {
  const mod = await loadProbe();
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    let called = false;
    await assert.rejects(() => mod.guardedFetch('https://auth.didaxus.com/api/users', { method, policy: policy(mod), transport: async () => { called = true; }, resolver: publicResolver }), /blocked before network/);
    assert.equal(called, false);
  }
});

test('probe allows POST only for the exact token endpoint', async () => {
  const mod = await loadProbe();
  const p = policy(mod);
  assert.equal(mod.assertRequestAllowed({ method: 'POST', url: 'https://auth.didaxus.com/oidc/token', policy: p, isTokenRequest: true }), true);
  assert.throws(() => mod.assertRequestAllowed({ method: 'POST', url: 'https://auth.didaxus.com/api/users', policy: p, isTokenRequest: true }), /only exact token endpoint/);
});

test('probe rejects unknown host and unknown path before transport', async () => {
  const mod = await loadProbe();
  for (const url of ['https://evil.example/api/users', 'https://auth.didaxus.com/api/unknown']) {
    let called = false;
    await assert.rejects(() => mod.guardedFetch(url, { method: 'GET', policy: policy(mod), transport: async () => { called = true; }, resolver: publicResolver }), /unknown (host|path)/);
    assert.equal(called, false);
  }
});

test('probe rejects redirect to unknown host', async () => {
  const mod = await loadProbe();
  const response = { status: 302, ok: false, headers: new Map([['location', 'https://evil.example/callback']]), text: async () => '' };
  await assert.rejects(() => mod.guardedFetch('https://auth.didaxus.com/api/users', { method: 'GET', policy: policy(mod), transport: async () => response, resolver: publicResolver }), /redirect to unknown host/);
});

test('probe rejects response above size limit', async () => {
  const mod = await loadProbe();
  const response = { status: 200, ok: true, headers: new Map(), text: async () => 'x'.repeat(32) };
  await assert.rejects(() => mod.guardedFetch('https://auth.didaxus.com/api/users', { method: 'GET', policy: policy(mod), transport: async () => response, resolver: publicResolver }), /response above size limit/);
});

test('probe blocks private IP hosts and unexpected query parameters before transport', async () => {
  const mod = await loadProbe();
  assert.throws(() => mod.buildPolicy({ endpoint: 'https://127.0.0.1', allowedPaths: ['/api/users'] }), /private or loopback/);
  let called = false;
  await assert.rejects(() => mod.guardedFetch('https://auth.didaxus.com/api/users?unsafe=true', { method: 'GET', policy: policy(mod), transport: async () => { called = true; }, resolver: publicResolver }), /unknown query parameter/);
  assert.equal(called, false);
});

test('probe enforces response size while streaming', async () => {
  const mod = await loadProbe();
  const encoder = new TextEncoder();
  const response = { status: 200, ok: true, headers: new Map(), body: new ReadableStream({ start(controller) { controller.enqueue(encoder.encode('0123456789')); controller.enqueue(encoder.encode('overflow')); controller.close(); } }) };
  await assert.rejects(() => mod.guardedFetch('https://auth.didaxus.com/api/users', { method: 'GET', policy: policy(mod), transport: async () => response, resolver: publicResolver }), /during streaming/);
});


test('probe rejects allowed hostname that resolves to loopback before transport', async () => {
  const mod = await loadProbe();
  let called = false;
  await assert.rejects(
    () => mod.guardedFetch('https://auth.didaxus.com/api/users', {
      method: 'GET',
      policy: policy(mod),
      transport: async () => { called = true; },
      resolver: async () => [{ address: '127.0.0.1', family: 4 }],
    }),
    /non-public address before network/,
  );
  assert.equal(called, false);
});

test('probe rejects allowed hostname that resolves to RFC1918 IPv4 before transport', async () => {
  const mod = await loadProbe();
  let called = false;
  await assert.rejects(
    () => mod.guardedFetch('https://auth.didaxus.com/api/users', {
      method: 'GET',
      policy: policy(mod),
      transport: async () => { called = true; },
      resolver: async () => [{ address: '10.23.45.67', family: 4 }],
    }),
    /non-public address before network/,
  );
  assert.equal(called, false);
});

test('probe rejects allowed hostname with mixed public and private results before transport', async () => {
  const mod = await loadProbe();
  let called = false;
  await assert.rejects(
    () => mod.guardedFetch('https://auth.didaxus.com/api/users', {
      method: 'GET',
      policy: policy(mod),
      transport: async () => { called = true; },
      resolver: async () => [{ address: '93.184.216.34', family: 4 }, { address: '10.23.45.67', family: 4 }],
    }),
    /non-public address before network/,
  );
  assert.equal(called, false);
});

test('probe rejects allowed hostname that resolves to IPv6 ULA or link-local before transport', async () => {
  const mod = await loadProbe();
  for (const address of ['fd00::1', 'fe80::1']) {
    let called = false;
    await assert.rejects(
      () => mod.guardedFetch('https://auth.didaxus.com/api/users', {
        method: 'GET',
        policy: policy(mod),
        transport: async () => { called = true; },
        resolver: async () => [{ address, family: 6 }],
      }),
      /non-public address before network/,
    );
    assert.equal(called, false);
  }
});

test('probe allows allowed hostname that resolves only to public IP addresses', async () => {
  const mod = await loadProbe();
  let called = false;
  const response = { status: 200, ok: true, headers: new Map(), text: async () => '{}' };
  const result = await mod.guardedFetch('https://auth.didaxus.com/api/users', {
    method: 'GET',
    policy: policy(mod),
    transport: async () => { called = true; return response; },
    resolver: async () => [{ address: '93.184.216.34', family: 4 }, { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 }],
  });
  assert.equal(called, true);
  assert.equal(result.status, 200);
});

test('probe includes exact read-only jit sso connectors endpoint for an organization', async () => {
  const mod = await loadProbe();
  const path = mod.organizationJitSsoConnectorsPath('org_123');
  assert.equal(path, '/api/organizations/org_123/jit-sso-connectors');
  const p = mod.buildPolicy({ endpoint: 'https://auth.didaxus.com', allowedPaths: mod.discoveryEndpoints({ organizationId: 'org_123' }) });
  assert.equal(mod.assertRequestAllowed({ method: 'GET', url: `https://auth.didaxus.com${path}`, policy: p }), true);
  assert.throws(() => mod.assertRequestAllowed({ method: 'GET', url: 'https://auth.didaxus.com/api/organizations/org_123', policy: p }), /unknown path/);
});

test('evidence artifact redacts response shape and hashes stable correlation candidates', async () => {
  const mod = await loadProbe();
  const artifact = mod.buildEvidenceArtifact({
    endpoint: 'https://auth.didaxus.com',
    observations: [{
      method: 'GET',
      path: '/api/organizations/org_123/jit-sso-connectors',
      status: 200,
      body: [{ id: 'jit_abc', connectorId: 'conn_xyz', email: 'person@example.com', clientSecret: 'super-secret' }],
    }],
    customTokenScriptClaimSample: { user: { sso_identities: [{ profile: { groups: ['faculty'] } }] } },
  });

  const serialized = JSON.stringify(artifact);
  assert.equal(artifact.probeVersion, mod.PROBE_VERSION);
  assert.equal(artifact.logtoEndpointHash, mod.sha256('https://auth.didaxus.com'));
  assert.equal(artifact.endpoints[0].method, 'GET');
  assert.equal(artifact.endpoints[0].httpStatus, 200);
  assert.equal(artifact.externalGroupsPresent, true);
  assert.equal(artifact.groupCompletenessCanBeDetermined, true);
  assert.match(serialized, /redacted/);
  assert.doesNotMatch(serialized, /person@example\.com|super-secret|faculty|jit_abc|conn_xyz/);
  assert.deepEqual(artifact.stableCorrelationCandidates.map((candidate) => candidate.hash), [mod.sha256('jit_abc'), mod.sha256('conn_xyz')]);
});

test('custom token script claim-shape detection identifies absent, present, and overage groups', async () => {
  const mod = await loadProbe();
  assert.deepEqual(mod.detectExternalGroupShape({ user: { sso_identities: [{ profile: {} }] } }), {
    customTokenScriptClaimShape: { userSsoIdentitiesProfileGroupsAvailable: false },
    externalGroupsPresent: false,
    groupCompletenessCanBeDetermined: false,
  });
  assert.deepEqual(mod.detectExternalGroupShape({ user: { sso_identities: [{ profile: { groups: [] } }] } }), {
    customTokenScriptClaimShape: { userSsoIdentitiesProfileGroupsAvailable: true },
    externalGroupsPresent: false,
    groupCompletenessCanBeDetermined: true,
  });
  assert.deepEqual(mod.detectExternalGroupShape({ user: { sso_identities: [{ profile: { groups: ['g1'], _claim_names: { groups: 'src1' } } }] } }), {
    customTokenScriptClaimShape: { userSsoIdentitiesProfileGroupsAvailable: true },
    externalGroupsPresent: true,
    groupCompletenessCanBeDetermined: false,
  });
});

test('evidence artifact output contains no raw pii, tokens, or secrets', async () => {
  const mod = await loadProbe();
  const artifact = mod.buildEvidenceArtifact({
    endpoint: 'https://auth.didaxus.com',
    observations: [{
      method: 'GET',
      path: '/api/users',
      status: 200,
      body: { id: 'user_123', name: 'Jane Learner', email: 'jane@example.com', accessToken: 'ey.secret.token', phone: '+15555550100' },
    }],
    customTokenScriptClaimSample: { user: { sso_identities: [{ profile: { groups: ['students'], hasgroups: true } }] } },
  });
  const output = JSON.stringify(artifact);
  assert.doesNotMatch(output, /Jane Learner|jane@example\.com|ey\.secret\.token|\+15555550100|students/);
  assert.equal(artifact.groupCompletenessCanBeDetermined, false);
});
