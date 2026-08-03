'use strict';

const { validatePrincipal } = require('./contracts');

function createAuthenticatedMcpClient({ identityPort, transportPort, audience, clock = () => new Date() }) {
  if (!identityPort?.authenticate || !transportPort?.callTool) throw new TypeError('identity and transport ports are required');
  async function callTool({ credential, toolId, version, input, correlationId, consent }) {
    const identity = await identityPort.authenticate({ credential, audience });
    if (!identity || identity.audience !== audience || identity.expiresAt <= clock().getTime()) throw new Error('mcp_client_authentication_failed');
    const principal = validatePrincipal(identity.principal, clock());
    return transportPort.callTool(Object.freeze({ toolId, version, input, correlationId, consent }), Object.freeze({ principal, authenticatedClientId: identity.clientId }));
  }
  return Object.freeze({ callTool });
}

module.exports = { createAuthenticatedMcpClient };
