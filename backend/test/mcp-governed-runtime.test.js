'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMcpRegistryService, createAuthenticatedMcpClient, createMcpServerAdapter, validatePrincipal, validateConsent } = require('../mcp');

const now = () => new Date('2030-01-01T00:00:00Z');
const principal = { schemaVersion: 'civitas.mcp.principal/v1', type: 'agent', subjectId: 'agent-1', authenticatedClientId: 'agent-1', tenantId: 'tenant-1', delegation: { schemaVersion: 'civitas.mcp.delegation-chain/v1', links: [{ delegateId: 'agent-1', delegatorId: 'user-1', permissions: ['planning:read'], riskCeiling: 'R0', expiresAt: '2031-01-01T00:00:00Z' }] } };

test('versioned principals, delegation and consent remain tenant/client bound', () => {
  assert.equal(validatePrincipal(principal, now()).delegation.links[0].delegatorId, 'user-1');
  assert.throws(() => validatePrincipal({ ...principal, authenticatedClientId: 'shadow' }, now()), /authenticated client/);
  const consent = { schemaVersion: 'civitas.mcp.consent/v1', principalId: 'agent-1', tenantId: 'tenant-1', toolId: 'planning.list', toolVersion: '1', argumentDigest: 'a'.repeat(64), nonce: 'nonce-nonce-nonce-1', expiresAt: '2031-01-01T00:00:00Z' };
  assert.equal(validateConsent(consent, consent, now()).nonce, consent.nonce);
  assert.throws(() => validateConsent(consent, { ...consent, tenantId: 'tenant-2' }, now()), /tenantId mismatch/);
});

test('registry only permits the complete lifecycle and requires activation evidence', async () => {
  let stored = { toolId: 'planning.list', version: '1', status: 'planned', applicationServiceId: 'planning.list', permissionId: 'planning:read' };
  const events = [];
  const service = createMcpRegistryService({ registryPort: { get: async () => stored, save: async (value) => { stored = value; } }, auditPort: { record: async (event) => events.push(event) }, clock: now });
  await assert.rejects(service.transition({ toolId: stored.toolId, version: '1', to: 'active' }), /activation_evidence/);
  await service.transition({ toolId: stored.toolId, version: '1', to: 'active', actor: 'reviewer', correlationId: 'corr-1', evidence: { reviewId: 'review-1', rollbackRef: 'runbook-1' } });
  assert.equal(stored.status, 'active'); assert.equal(events[0].correlationId, 'corr-1');
  await assert.rejects(service.transition({ toolId: stored.toolId, version: '1', to: 'removed' }), /invalid_lifecycle/);
});

test('authenticated client and server adapter preserve in-process application boundary', async () => {
  const calls = [];
  const server = createMcpServerAdapter({ authenticationPort: { authenticate: async () => principal }, executionService: { listTools: async () => [], execute: async (request, context) => { calls.push({ request, context }); return { ok: true }; } } });
  const client = createAuthenticatedMcpClient({ audience: 'civitas-mcp', clock: now, identityPort: { authenticate: async () => ({ audience: 'civitas-mcp', expiresAt: Date.parse('2031-01-01'), clientId: 'agent-1', principal }) }, transportPort: { callTool: (request) => server.callTool({ ...request, credential: 'transport-bound' }) } });
  assert.deepEqual(await client.callTool({ credential: 'opaque', toolId: 'planning.list', version: '1', input: {}, correlationId: 'corr-2' }), { ok: true });
  assert.equal(calls[0].context.principal.tenantId, 'tenant-1');
});
