const crypto = require('node:crypto');

const TOOL_PROBLEMS = Object.freeze({
  DISABLED: 'tool_disabled', INVALID: 'invalid_tool_input', CONSENT: 'consent_required',
  REPLAY: 'idempotency_conflict', PRECONDITION: 'precondition_failed', DELEGATION: 'delegation_ceiling_exceeded',
  TENANT: 'tenant_mismatch', APPROVAL: 'maker_checker_required', SELF_APPROVAL: 'self_approval_denied', TIMEOUT: 'tool_timeout',
});

class ToolExecutionError extends Error {
  constructor(code, details = {}) { super(code); this.name = 'ToolExecutionError'; this.code = code; this.details = details; }
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function fingerprint(value) { return crypto.createHash('sha256').update(stableJson(value)).digest('hex'); }
function required(value, name) { if (typeof value !== 'string' || !value.trim()) throw new ToolExecutionError(TOOL_PROBLEMS.INVALID, { field: name }); return value.trim(); }
function withTimeout(promise, timeoutMs) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new ToolExecutionError(TOOL_PROBLEMS.TIMEOUT)), timeoutMs); })]).finally(() => clearTimeout(timer));
}

/**
 * Tool definitions are server-owned adapters to already-active application services.
 * Prompt text is deliberately not accepted by this boundary.
 */
function createApplicationServiceToolGateway({ tools, applicationServices, killSwitch, consentVerifier, authorization, approvals, idempotency, audit, clock = () => new Date() }) {
  const exposed = new Map((tools || []).filter((tool) => tool.status === 'active' && tool.exposure === 'curated').map((tool) => [tool.id, Object.freeze({ ...tool })]));

  async function execute(request, trustedContext) {
    const toolId = required(request?.toolId, 'toolId');
    const definition = exposed.get(toolId);
    if (!definition) throw new ToolExecutionError(TOOL_PROBLEMS.DISABLED);
    const tenantId = required(trustedContext?.tenantId, 'trustedContext.tenantId');
    const actorId = required(trustedContext?.actorId, 'trustedContext.actorId');
    const correlationId = required(trustedContext?.correlationId, 'trustedContext.correlationId');
    if (request.tenantId && request.tenantId !== tenantId) throw new ToolExecutionError(TOOL_PROBLEMS.TENANT);
    if (await killSwitch?.isDisabled?.({ tenantId, toolId })) throw new ToolExecutionError(TOOL_PROBLEMS.DISABLED);

    const input = definition.validateInput(request.input); // must return a new, allowlisted value
    const command = Object.freeze(definition.buildCommand(input, { tenantId }));
    const key = required(request.idempotencyKey, 'idempotencyKey');
    const requestFingerprint = fingerprint({ toolId, tenantId, command });
    if (request.fingerprint !== requestFingerprint) throw new ToolExecutionError(TOOL_PROBLEMS.INVALID, { field: 'fingerprint' });
    const existing = await idempotency.lookup({ tenantId, toolId, key });
    if (existing) {
      if (existing.fingerprint !== requestFingerprint) throw new ToolExecutionError(TOOL_PROBLEMS.REPLAY);
      if (existing.status === 'succeeded') return existing.result;
      if (existing.status === 'running') throw new ToolExecutionError(TOOL_PROBLEMS.REPLAY, { reason: 'in_progress' });
    }

    const consent = await consentVerifier.verify({ proof: request.consentProof, actorId, tenantId, toolId, fingerprint: requestFingerprint });
    if (!consent?.verified) throw new ToolExecutionError(TOOL_PROBLEMS.CONSENT);
    const decision = await authorization.authorize({ actorId, delegatorId: trustedContext.delegatorId || null, tenantId, toolId, permission: definition.permission, delegationCeiling: trustedContext.delegationCeiling });
    if (!decision?.allowed) throw new ToolExecutionError(decision?.reason === 'delegation_ceiling' ? TOOL_PROBLEMS.DELEGATION : TOOL_PROBLEMS.INVALID);
    if (definition.requiresIfMatch && !request.ifMatch) throw new ToolExecutionError(TOOL_PROBLEMS.PRECONDITION);
    if (definition.makerChecker) {
      const approval = await approvals.verify({ approvalId: request.approvalId, tenantId, toolId, fingerprint: requestFingerprint });
      if (!approval?.verified) throw new ToolExecutionError(TOOL_PROBLEMS.APPROVAL);
      if (approval.approverId === actorId) throw new ToolExecutionError(TOOL_PROBLEMS.SELF_APPROVAL);
    }

    const service = applicationServices[definition.applicationServiceId];
    if (typeof service !== 'function') throw new ToolExecutionError(TOOL_PROBLEMS.DISABLED);
    const startedAt = clock().toISOString();
    await idempotency.reserve({ tenantId, toolId, key, fingerprint: requestFingerprint, correlationId });
    try {
      const result = await withTimeout(Promise.resolve().then(() => service(command, Object.freeze({ tenantId, actorId, delegatorId: trustedContext.delegatorId || null, correlationId, decisionId: decision.decisionId, ifMatch: request.ifMatch }))), definition.timeoutMs || 5000);
      await idempotency.succeed({ tenantId, toolId, key, fingerprint: requestFingerprint, result });
      await audit.record({ decisionId: decision.decisionId, actorId, delegatorId: trustedContext.delegatorId || null, tenantId, toolId, toolVersion: definition.version, correlationId, effect: definition.effect, outcome: 'succeeded', startedAt, completedAt: clock().toISOString() });
      return result;
    } catch (error) {
      await idempotency.fail({ tenantId, toolId, key, fingerprint: requestFingerprint, code: error.code || 'application_service_failed' });
      await audit.record({ decisionId: decision.decisionId, actorId, delegatorId: trustedContext.delegatorId || null, tenantId, toolId, toolVersion: definition.version, correlationId, effect: definition.effect, outcome: 'failed', errorCode: error.code || 'application_service_failed', startedAt, completedAt: clock().toISOString() });
      throw error;
    }
  }
  return Object.freeze({ execute, listTools: () => [...exposed.values()].map(({ validateInput, buildCommand, ...publicDefinition }) => publicDefinition) });
}

module.exports = { createApplicationServiceToolGateway, ToolExecutionError, TOOL_PROBLEMS, fingerprint };
