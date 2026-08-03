'use strict';

const { createHash } = require('node:crypto');
const { validateConsent } = require('./contracts');

function digest(value) { return createHash('sha256').update(JSON.stringify(value, Object.keys(value || {}).sort())).digest('hex'); }
function createMcpExecutionService({ registryPort, authorizationPort, usagePort, killSwitchPort, consentPort, auditPort, applicationServicePort, clock = () => new Date() }) {
  const ports = { registryPort, authorizationPort, usagePort, killSwitchPort, consentPort, auditPort, applicationServicePort };
  for (const [name, port] of Object.entries(ports)) if (!port) throw new TypeError(`${name} is required`);

  async function listTools({ principal }) {
    const tools = await registryPort.listActive({ tenantId: principal.tenantId });
    return tools.map(({ contractJson, ...tool }) => Object.freeze({ ...tool, inputSchema: contractJson.inputSchema, outputSchema: contractJson.outputSchema }));
  }
  async function execute(request, context) {
    const { principal } = context;
    const tool = await registryPort.get({ toolId: request.toolId, version: request.version });
    if (!tool || tool.status !== 'active') throw new Error('tool_not_active');
    if (await killSwitchPort.isDisabled({ tenantId: principal.tenantId, toolId: tool.toolId, version: tool.version })) throw new Error('tool_disabled');
    const decision = await authorizationPort.authorize({ principal, permissionId: tool.permissionId, toolId: tool.toolId, risk: tool.risk });
    if (!decision?.allowed) throw new Error('tool_authorization_denied');
    const argumentDigest = digest(request.input);
    if (tool.risk === 'R2') {
      const proof = validateConsent(request.consent, { principalId: principal.subjectId, tenantId: principal.tenantId, toolId: tool.toolId, toolVersion: tool.version, argumentDigest }, clock());
      if (!await consentPort.consumeNonce({ nonce: proof.nonce, principalId: principal.subjectId, tenantId: principal.tenantId, toolId: tool.toolId })) throw new Error('consent_replay');
    }
    const quota = await usagePort.consume({ tenantId: principal.tenantId, toolId: tool.toolId, principalId: principal.subjectId, units: 1, correlationId: context.correlationId });
    if (!quota?.allowed) throw new Error('rate_limit_exceeded');
    let outcome = 'succeeded';
    try {
      return await applicationServicePort.invoke(tool.applicationServiceId, request.input, Object.freeze({ principal, decisionId: decision.decisionId, correlationId: context.correlationId }));
    } catch (error) { outcome = 'failed'; throw error; }
    finally { await auditPort.record({ eventType: 'mcp.tool.executed.v1', tenantId: principal.tenantId, toolId: tool.toolId, toolVersion: tool.version, principalId: principal.subjectId, decisionId: decision.decisionId, correlationId: context.correlationId, delegationId: principal.delegation.links.at(-1)?.delegationId || null, outcome }); }
  }
  return Object.freeze({ listTools, execute });
}

module.exports = { createMcpExecutionService, digest };
