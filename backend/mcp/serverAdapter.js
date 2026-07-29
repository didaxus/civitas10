'use strict';

const { validatePrincipal } = require('./contracts');

function createMcpServerAdapter({ authenticationPort, executionService }) {
  if (!authenticationPort?.authenticate || !executionService?.execute || !executionService?.listTools) throw new TypeError('MCP server ports are required');
  async function listTools(request) {
    const principal = validatePrincipal(await authenticationPort.authenticate(request));
    return executionService.listTools({ principal, correlationId: request.correlationId });
  }
  async function callTool(request) {
    const principal = validatePrincipal(await authenticationPort.authenticate(request));
    return executionService.execute({ toolId: request.toolId, version: request.version, input: request.input, consent: request.consent }, { principal, correlationId: request.correlationId });
  }
  return Object.freeze({ listTools, callTool });
}

module.exports = { createMcpServerAdapter };
