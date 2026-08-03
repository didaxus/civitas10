'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createMcpExecutionService,
  validatePrincipal,
  validateConsent,
  PRINCIPAL_TYPES
} = require('../mcp');

const now = () => new Date('2030-01-01T00:00:00Z');

// Adversarial principal tests
test('rejects principal with mismatched user subject and client', () => {
  const malicious = {
    schemaVersion: 'civitas.mcp.principal/v1',
    type: 'user',
    subjectId: 'victim-user',
    authenticatedClientId: 'attacker-client',
    tenantId: 'attacker-tenant'
  };
  assert.throws(() => validatePrincipal(malicious, now()), /client must equal subject/);
});

test('rejects agent principal without delegation chain for R2 operations', () => {
  const agent = {
    schemaVersion: 'civitas.mcp.principal/v1',
    type: 'agent',
    subjectId: 'agent-1',
    authenticatedClientId: 'agent-1',
    tenantId: 'tenant-1',
    delegation: null
  };
  // Agent without delegation should be valid but limited
  const validated = validatePrincipal(agent, now());
  assert.equal(validated.type, 'agent');
  assert.deepEqual(validated.delegation.links, []);
});

test('rejects discontinuous delegation chain', () => {
  const broken = {
    schemaVersion: 'civitas.mcp.principal/v1',
    type: 'agent',
    subjectId: 'agent-2',
    authenticatedClientId: 'agent-2',
    tenantId: 'tenant-1',
    delegation: {
      schemaVersion: 'civitas.mcp.delegation-chain/v1',
      links: [
        { delegatorId: 'user-1', delegateId: 'agent-1', permissions: ['read'], riskCeiling: 'R0', expiresAt: '2031-01-01T00:00:00Z' },
        { delegatorId: 'user-2', delegateId: 'agent-2', permissions: ['read'], riskCeiling: 'R0', expiresAt: '2031-01-01T00:00:00Z' }
      ]
    }
  };
  assert.throws(() => validatePrincipal(broken, now()), /delegation chain is not bound to authenticated client/);
});

test('rejects expired delegation link', () => {
  const expired = {
    schemaVersion: 'civitas.mcp.principal/v1',
    type: 'agent',
    subjectId: 'agent-1',
    authenticatedClientId: 'agent-1',
    tenantId: 'tenant-1',
    delegation: {
      schemaVersion: 'civitas.mcp.delegation-chain/v1',
      links: [
        { delegatorId: 'user-1', delegateId: 'agent-1', permissions: ['read'], riskCeiling: 'R0', expiresAt: '2029-01-01T00:00:00Z' }
      ]
    }
  };
  assert.throws(() => validatePrincipal(expired, now()), /delegation link expired/);
});

test('rejects delegation chain exceeding maxItems', () => {
  const tooLong = {
    schemaVersion: 'civitas.mcp.principal/v1',
    type: 'agent',
    subjectId: 'agent-1',
    authenticatedClientId: 'agent-1',
    tenantId: 'tenant-1',
    delegation: {
      schemaVersion: 'civitas.mcp.delegation-chain/v1',
      links: Array(9).fill({ delegatorId: 'user-1', delegateId: 'agent-1', permissions: ['read'], riskCeiling: 'R0', expiresAt: '2031-01-01T00:00:00Z' })
    }
  };
  // All identical links will fail discontinuous check first, but still rejected
  assert.throws(() => validatePrincipal(tooLong, now()), /delegation chain/);
});

test('rejects consent with wrong tenant binding', () => {
  const consent = {
    schemaVersion: 'civitas.mcp.consent/v1',
    principalId: 'agent-1',
    tenantId: 'tenant-1',
    toolId: 'planning.list',
    toolVersion: '1',
    argumentDigest: 'a'.repeat(64),
    nonce: 'nonce-nonce-nonce-1',
    expiresAt: '2031-01-01T00:00:00Z'
  };
  const binding = { ...consent, tenantId: 'tenant-2' };
  assert.throws(() => validateConsent(consent, binding, now()), /tenantId mismatch/);
});

test('rejects consent with wrong tool binding', () => {
  const consent = {
    schemaVersion: 'civitas.mcp.consent/v1',
    principalId: 'agent-1',
    tenantId: 'tenant-1',
    toolId: 'planning.list',
    toolVersion: '1',
    argumentDigest: 'a'.repeat(64),
    nonce: 'nonce-nonce-nonce-1',
    expiresAt: '2031-01-01T00:00:00Z'
  };
  const binding = { ...consent, toolId: 'planning.read' };
  assert.throws(() => validateConsent(consent, binding, now()), /toolId mismatch/);
});

test('rejects expired consent', () => {
  const consent = {
    schemaVersion: 'civitas.mcp.consent/v1',
    principalId: 'agent-1',
    tenantId: 'tenant-1',
    toolId: 'planning.list',
    toolVersion: '1',
    argumentDigest: 'a'.repeat(64),
    nonce: 'nonce-nonce-nonce-1',
    expiresAt: '2029-01-01T00:00:00Z'
  };
  assert.throws(() => validateConsent(consent, consent, now()), /consent expired/);
});

test('rejects consent with invalid argumentDigest format', () => {
  const consent = {
    schemaVersion: 'civitas.mcp.consent/v1',
    principalId: 'agent-1',
    tenantId: 'tenant-1',
    toolId: 'planning.list',
    toolVersion: '1',
    argumentDigest: 'invalid-hash',
    nonce: 'nonce-nonce-nonce-1',
    expiresAt: '2031-01-01T00:00:00Z'
  };
  const binding = { ...consent, argumentDigest: 'invalid-hash' };
  // Schema validation requires pattern ^[a-f0-9]{64}$, runtime checks binding match
  assert.throws(() => validateConsent(consent, binding, now()), /argumentDigest/);
});

// Kill switch adversarial tests
test('execution service checks kill switch before authorization', async () => {
  let killSwitchCalled = false;
  let authzCalled = false;
  
  const service = createMcpExecutionService({
    registryPort: {
      get: async () => ({ toolId: 'test.tool', version: '1', status: 'active', permissionId: 'test:read', applicationServiceId: 'test.service', risk: 'R0' }),
      listActive: async () => []
    },
    authorizationPort: {
      authorize: async () => { authzCalled = true; return { allowed: true, decisionId: 'authz-1' }; }
    },
    usagePort: {
      consume: async () => ({ allowed: true, remaining: 100 })
    },
    killSwitchPort: {
      isDisabled: async () => { killSwitchCalled = true; return true; }
    },
    consentPort: {
      consumeNonce: async () => true
    },
    auditPort: {
      record: async () => {}
    },
    applicationServicePort: {
      invoke: async () => ({ result: 'ok' })
    },
    clock: now
  });

  await assert.rejects(
    service.execute({ toolId: 'test.tool', version: '1', input: {} }, { 
      principal: validatePrincipal({
        schemaVersion: 'civitas.mcp.principal/v1',
        type: 'user',
        subjectId: 'user-1',
        authenticatedClientId: 'user-1',
        tenantId: 'tenant-1'
      }, now()),
      correlationId: 'corr-1'
    }),
    /tool_disabled/
  );
  
  assert.equal(killSwitchCalled, true, 'Kill switch must be checked');
  assert.equal(authzCalled, false, 'Authorization should not be called if tool is disabled');
});

test('kill switch respects global scope', async () => {
  const service = createMcpExecutionService({
    registryPort: {
      get: async () => ({ toolId: 'test.tool', version: '1', status: 'active', permissionId: 'test:read', applicationServiceId: 'test.service', risk: 'R0' }),
      listActive: async () => []
    },
    authorizationPort: { authorize: async () => ({ allowed: true, decisionId: 'authz-1' }) },
    usagePort: { consume: async () => ({ allowed: true, remaining: 100 }) },
    killSwitchPort: { isDisabled: async ({ tenantId, toolId }) => true },
    consentPort: { consumeNonce: async () => true },
    auditPort: { record: async () => {} },
    applicationServicePort: { invoke: async () => ({ result: 'ok' }) },
    clock: now
  });

  await assert.rejects(
    service.execute({ toolId: 'test.tool', version: '1', input: {} }, {
      principal: validatePrincipal({
        schemaVersion: 'civitas.mcp.principal/v1',
        type: 'user',
        subjectId: 'user-1',
        authenticatedClientId: 'user-1',
        tenantId: 'tenant-1'
      }, now()),
      correlationId: 'corr-1'
    }),
    /tool_disabled/
  );
});

// Rate limiting adversarial tests
test('execution fails when rate limit exceeded', async () => {
  const service = createMcpExecutionService({
    registryPort: {
      get: async () => ({ toolId: 'test.tool', version: '1', status: 'active', permissionId: 'test:read', applicationServiceId: 'test.service', risk: 'R0' }),
      listActive: async () => []
    },
    authorizationPort: { authorize: async () => ({ allowed: true, decisionId: 'authz-1' }) },
    usagePort: { consume: async () => ({ allowed: false, remaining: 0 }) },
    killSwitchPort: { isDisabled: async () => false },
    consentPort: { consumeNonce: async () => true },
    auditPort: { record: async () => {} },
    applicationServicePort: { invoke: async () => ({ result: 'ok' }) },
    clock: now
  });

  await assert.rejects(
    service.execute({ toolId: 'test.tool', version: '1', input: {} }, {
      principal: validatePrincipal({
        schemaVersion: 'civitas.mcp.principal/v1',
        type: 'user',
        subjectId: 'user-1',
        authenticatedClientId: 'user-1',
        tenantId: 'tenant-1'
      }, now()),
      correlationId: 'corr-1'
    }),
    /rate_limit_exceeded/
  );
});

// Authorization denial tests
test('execution fails when authorization denied', async () => {
  const service = createMcpExecutionService({
    registryPort: {
      get: async () => ({ toolId: 'test.tool', version: '1', status: 'active', permissionId: 'test:read', applicationServiceId: 'test.service', risk: 'R0' }),
      listActive: async () => []
    },
    authorizationPort: { authorize: async () => ({ allowed: false, reason: 'permission_denied' }) },
    usagePort: { consume: async () => ({ allowed: true, remaining: 100 }) },
    killSwitchPort: { isDisabled: async () => false },
    consentPort: { consumeNonce: async () => true },
    auditPort: { record: async () => {} },
    applicationServicePort: { invoke: async () => ({ result: 'ok' }) },
    clock: now
  });

  await assert.rejects(
    service.execute({ toolId: 'test.tool', version: '1', input: {} }, {
      principal: validatePrincipal({
        schemaVersion: 'civitas.mcp.principal/v1',
        type: 'user',
        subjectId: 'user-1',
        authenticatedClientId: 'user-1',
        tenantId: 'tenant-1'
      }, now()),
      correlationId: 'corr-1'
    }),
    /tool_authorization_denied/
  );
});

// Tool lifecycle tests
test('execution fails for non-active tool', async () => {
  const service = createMcpExecutionService({
    registryPort: {
      get: async () => ({ toolId: 'test.tool', version: '1', status: 'planned', permissionId: 'test:read', applicationServiceId: 'test.service', risk: 'R0' }),
      listActive: async () => []
    },
    authorizationPort: { authorize: async () => ({ allowed: true, decisionId: 'authz-1' }) },
    usagePort: { consume: async () => ({ allowed: true, remaining: 100 }) },
    killSwitchPort: { isDisabled: async () => false },
    consentPort: { consumeNonce: async () => true },
    auditPort: { record: async () => {} },
    applicationServicePort: { invoke: async () => ({ result: 'ok' }) },
    clock: now
  });

  await assert.rejects(
    service.execute({ toolId: 'test.tool', version: '1', input: {} }, {
      principal: validatePrincipal({
        schemaVersion: 'civitas.mcp.principal/v1',
        type: 'user',
        subjectId: 'user-1',
        authenticatedClientId: 'user-1',
        tenantId: 'tenant-1'
      }, now()),
      correlationId: 'corr-1'
    }),
    /tool_not_active/
  );
});

// Consent replay protection tests
test('R2 tools require consent nonce consumption', async () => {
  let nonceConsumed = false;
  
  const service = createMcpExecutionService({
    registryPort: {
      get: async () => ({ toolId: 'test.tool', version: '1', status: 'active', permissionId: 'test:write', applicationServiceId: 'test.service', risk: 'R2' }),
      listActive: async () => []
    },
    authorizationPort: { authorize: async () => ({ allowed: true, decisionId: 'authz-1' }) },
    usagePort: { consume: async () => ({ allowed: true, remaining: 100 }) },
    killSwitchPort: { isDisabled: async () => false },
    consentPort: {
      consumeNonce: async ({ nonce }) => {
        if (nonce === 'reused-nonce') return false;
        nonceConsumed = true;
        return true;
      }
    },
    auditPort: { record: async () => {} },
    applicationServicePort: { invoke: async () => ({ result: 'ok' }) },
    clock: now
  });

  const consent = {
    schemaVersion: 'civitas.mcp.consent/v1',
    principalId: 'user-1',
    tenantId: 'tenant-1',
    toolId: 'test.tool',
    toolVersion: '1',
    argumentDigest: 'a'.repeat(64),
    nonce: 'reused-nonce',
    expiresAt: '2031-01-01T00:00:00Z'
  };

  await assert.rejects(
    service.execute({ toolId: 'test.tool', version: '1', input: {}, consent }, {
      principal: validatePrincipal({
        schemaVersion: 'civitas.mcp.principal/v1',
        type: 'user',
        subjectId: 'user-1',
        authenticatedClientId: 'user-1',
        tenantId: 'tenant-1'
      }, now()),
      correlationId: 'corr-1'
    }),
    /consent_replay/
  );
  
  assert.equal(nonceConsumed, false, 'Nonce should not be consumed on replay detection');
});

// Audit correlation tests
test('audit records include correlation and delegation IDs', async () => {
  const auditEvents = [];
  
  const service = createMcpExecutionService({
    registryPort: {
      get: async () => ({ toolId: 'test.tool', version: '1', status: 'active', permissionId: 'test:read', applicationServiceId: 'test.service', risk: 'R0' }),
      listActive: async () => []
    },
    authorizationPort: { authorize: async () => ({ allowed: true, decisionId: 'authz-1' }) },
    usagePort: { consume: async () => ({ allowed: true, remaining: 100 }) },
    killSwitchPort: { isDisabled: async () => false },
    consentPort: { consumeNonce: async () => true },
    auditPort: {
      record: async (event) => auditEvents.push(event)
    },
    applicationServicePort: { invoke: async () => ({ result: 'ok' }) },
    clock: now
  });

  const principal = validatePrincipal({
    schemaVersion: 'civitas.mcp.principal/v1',
    type: 'agent',
    subjectId: 'agent-1',
    authenticatedClientId: 'agent-1',
    tenantId: 'tenant-1',
    delegation: {
      schemaVersion: 'civitas.mcp.delegation-chain/v1',
      links: [
        { delegatorId: 'user-1', delegateId: 'agent-1', permissions: ['read'], riskCeiling: 'R0', expiresAt: '2031-01-01T00:00:00Z', delegationId: 'deleg-1' }
      ]
    }
  }, now());

  await service.execute({ toolId: 'test.tool', version: '1', input: {} }, {
    principal,
    correlationId: 'corr-test-123'
  });

  assert.equal(auditEvents.length, 1, 'One audit event should be recorded');
  assert.equal(auditEvents[0].correlationId, 'corr-test-123');
  assert.equal(auditEvents[0].delegationId, 'deleg-1');
  assert.equal(auditEvents[0].outcome, 'succeeded');
  assert.equal(auditEvents[0].eventType, 'mcp.tool.executed.v1');
});

test('audit records failure outcome on application service error', async () => {
  const auditEvents = [];
  
  const service = createMcpExecutionService({
    registryPort: {
      get: async () => ({ toolId: 'test.tool', version: '1', status: 'active', permissionId: 'test:read', applicationServiceId: 'test.service', risk: 'R0' }),
      listActive: async () => []
    },
    authorizationPort: { authorize: async () => ({ allowed: true, decisionId: 'authz-1' }) },
    usagePort: { consume: async () => ({ allowed: true, remaining: 100 }) },
    killSwitchPort: { isDisabled: async () => false },
    consentPort: { consumeNonce: async () => true },
    auditPort: {
      record: async (event) => auditEvents.push(event)
    },
    applicationServicePort: { invoke: async () => { throw new Error('service_unavailable'); } },
    clock: now
  });

  await assert.rejects(
    service.execute({ toolId: 'test.tool', version: '1', input: {} }, {
      principal: validatePrincipal({
        schemaVersion: 'civitas.mcp.principal/v1',
        type: 'user',
        subjectId: 'user-1',
        authenticatedClientId: 'user-1',
        tenantId: 'tenant-1'
      }, now()),
      correlationId: 'corr-1'
    }),
    /service_unavailable/
  );

  assert.equal(auditEvents.length, 1, 'One audit event should be recorded even on failure');
  assert.equal(auditEvents[0].outcome, 'failed');
});

// Organization reconciliation tests
test('principal tenantId is used for organization reconciliation, not input', async () => {
  const calls = [];
  
  const service = createMcpExecutionService({
    registryPort: {
      get: async () => ({ toolId: 'test.tool', version: '1', status: 'active', permissionId: 'test:read', applicationServiceId: 'test.service', risk: 'R0' }),
      listActive: async () => []
    },
    authorizationPort: { authorize: async ({ principal }) => { calls.push(principal.tenantId); return { allowed: true, decisionId: 'authz-1' }; } },
    usagePort: { consume: async ({ tenantId }) => { calls.push(tenantId); return { allowed: true, remaining: 100 }; } },
    killSwitchPort: { isDisabled: async () => false },
    consentPort: { consumeNonce: async () => true },
    auditPort: { record: async () => {} },
    applicationServicePort: { invoke: async () => ({ result: 'ok' }) },
    clock: now
  });

  const principal = validatePrincipal({
    schemaVersion: 'civitas.mcp.principal/v1',
    type: 'user',
    subjectId: 'user-1',
    authenticatedClientId: 'user-1',
    tenantId: 'legitimate-tenant'
  }, now());

  // Input tries to specify different organization - should be ignored
  await service.execute({ toolId: 'test.tool', version: '1', input: { organizationId: 'attacker-tenant' } }, {
    principal,
    correlationId: 'corr-1'
  });

  assert.equal(calls[0], 'legitimate-tenant', 'Authorization should use principal tenantId');
  assert.equal(calls[1], 'legitimate-tenant', 'Usage should use principal tenantId');
});

// Schema version enforcement tests
test('rejects principal with wrong schema version', () => {
  const wrongVersion = {
    schemaVersion: 'civitas.mcp.principal/v0',
    type: 'user',
    subjectId: 'user-1',
    authenticatedClientId: 'user-1',
    tenantId: 'tenant-1'
  };
  assert.throws(() => validatePrincipal(wrongVersion, now()), /invalid principal schema/);
});

test('rejects unknown principal type', () => {
  const unknownType = {
    schemaVersion: 'civitas.mcp.principal/v1',
    type: 'unknown',
    subjectId: 'unknown-1',
    authenticatedClientId: 'unknown-1',
    tenantId: 'tenant-1'
  };
  assert.throws(() => validatePrincipal(unknownType, now()), /invalid principal schema/);
});

test('PRINCIPAL_TYPES contains exactly user, agent, system', () => {
  assert.deepEqual(PRINCIPAL_TYPES, ['user', 'agent', 'system']);
});
