'use strict';

const { randomUUID } = require('node:crypto');

const PLANNING_MCP_TOOL_IDS = Object.freeze([
  'civitas.planning.plans.search',
  'civitas.planning.plans.read',
  'civitas.planning.roadmaps.read',
  'civitas.planning.plans.validate',
]);

const DEFAULT_LIMITS = Object.freeze({ maxPageSize: 50, maxCursorLength: 512, maxOutputBytes: 64 * 1024, timeoutMs: 2_000 });
const TOOL_ERROR_CODES = Object.freeze({
  INVALID: 'invalid_tool_input', DENIED: 'authorization_denied', NOT_FOUND: 'not_found',
  UNAVAILABLE: 'runtime_unavailable', TIMEOUT: 'tool_timeout', OUTPUT: 'tool_output_limit_exceeded',
});

class PlanningMcpToolError extends Error {
  constructor(code, details = {}) { super(code); this.name = 'PlanningMcpToolError'; this.code = code; this.details = details; }
}

const closedObject = (properties, required = []) => Object.freeze({ type: 'object', additionalProperties: false, properties, required });
const DEFINITIONS = Object.freeze([
  { id: PLANNING_MCP_TOOL_IDS[0], version: '1.0.0', status: 'active', effect: 'read', risk: 'R0', permission: 'planning.plans.read', capabilityId: 'planning.plans', operationId: 'planning.plans.list', actionId: 'planning.plans.read', service: 'listPlans', inputSchema: closedObject({ query: { type: 'string', maxLength: 256 }, cursor: { type: 'string', maxLength: 512 }, limit: { type: 'integer', minimum: 1, maximum: 50 } }) },
  { id: PLANNING_MCP_TOOL_IDS[1], version: '1.0.0', status: 'active', effect: 'read', risk: 'R0', permission: 'planning.plans.read', capabilityId: 'planning.plans', operationId: 'planning.plans.get', actionId: 'planning.plans.read', service: 'readPlan', inputSchema: closedObject({ planId: { type: 'string', minLength: 1, maxLength: 128 } }, ['planId']) },
  { id: PLANNING_MCP_TOOL_IDS[2], version: '1.0.0', status: 'active', effect: 'read', risk: 'R0', permission: 'planning.plans.read', capabilityId: 'planning.roadmaps', operationId: 'planning.roadmaps.get', actionId: 'planning.plans.read', service: 'readRoadmap', inputSchema: closedObject({ roadmapId: { type: 'string', minLength: 1, maxLength: 128 } }, ['roadmapId']) },
  { id: PLANNING_MCP_TOOL_IDS[3], version: '1.0.0', status: 'active', effect: 'read', risk: 'R0', permission: 'planning.plans.read', capabilityId: 'planning.plans', operationId: 'planning.plans.validate', actionId: 'planning.plans.read', service: 'validatePlan', inputSchema: closedObject({ plan: { type: 'object' } }, ['plan']) },
]);

function fail(code, details) { throw new PlanningMcpToolError(code, details); }
function validateId(value, field) { if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) fail(TOOL_ERROR_CODES.INVALID, { field }); return value; }
function normalizeInput(definition, value, limits) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(TOOL_ERROR_CODES.INVALID);
  const allowed = new Set(Object.keys(definition.inputSchema.properties));
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(TOOL_ERROR_CODES.INVALID, { field: key });
  if (definition.service === 'listPlans') {
    if (value.query !== undefined && (typeof value.query !== 'string' || value.query.length > 256)) fail(TOOL_ERROR_CODES.INVALID, { field: 'query' });
    if (value.cursor !== undefined && (typeof value.cursor !== 'string' || value.cursor.length > limits.maxCursorLength)) fail(TOOL_ERROR_CODES.INVALID, { field: 'cursor' });
    const limit = value.limit === undefined ? limits.maxPageSize : value.limit;
    if (!Number.isInteger(limit) || limit < 1) fail(TOOL_ERROR_CODES.INVALID, { field: 'limit' });
    return Object.freeze({ cursor: value.cursor || null, limit: Math.min(limit, limits.maxPageSize), filters: Object.freeze(value.query ? { query: value.query } : {}) });
  }
  if (definition.service === 'readPlan') return Object.freeze({ planId: validateId(value.planId, 'planId') });
  if (definition.service === 'readRoadmap') return Object.freeze({ roadmapId: validateId(value.roadmapId, 'roadmapId') });
  if (!value.plan || typeof value.plan !== 'object' || Array.isArray(value.plan)) fail(TOOL_ERROR_CODES.INVALID, { field: 'plan' });
  return Object.freeze({ plan: structuredClone(value.plan), dryRun: true });
}

function deadline(promise, milliseconds) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new PlanningMcpToolError(TOOL_ERROR_CODES.TIMEOUT)), milliseconds); })]).finally(() => clearTimeout(timer));
}
function boundedOutput(value, limits) {
  let normalized = value;
  if (value?.items && Array.isArray(value.items) && value.items.length > limits.maxPageSize) normalized = { ...value, items: value.items.slice(0, limits.maxPageSize), page: { ...(value.page || {}), limit: limits.maxPageSize } };
  if (Buffer.byteLength(JSON.stringify(normalized), 'utf8') > limits.maxOutputBytes) fail(TOOL_ERROR_CODES.OUTPUT, { maxOutputBytes: limits.maxOutputBytes });
  return normalized;
}
function principalFrom(context) {
  const principal = context?.principal;
  if (!principal?.principalId || !principal?.subject || !principal?.organizationId) fail(TOOL_ERROR_CODES.DENIED);
  const delegation = context.delegation || principal.delegation || null;
  if (delegation && (!delegation.delegatorId || !Array.isArray(delegation.permissionCeiling))) fail(TOOL_ERROR_CODES.DENIED);
  return { principal, delegation };
}

/** Thin MCP exposure over the same authorization decision and application ports used by REST. */
function createPlanningMcpToolRuntime({ applicationServices = {}, remotePort = {}, authorization, availabilityResolver, limits: configuredLimits = {} } = {}) {
  const limits = Object.freeze({ ...DEFAULT_LIMITS, ...configuredLimits });
  const definitions = new Map(DEFINITIONS.map((definition) => [definition.id, definition]));
  async function execute(request, trustedContext) {
    const definition = definitions.get(request?.toolId);
    if (!definition) fail(TOOL_ERROR_CODES.UNAVAILABLE);
    const { principal, delegation } = principalFrom(trustedContext);
    const availability = await availabilityResolver?.resolve?.({ moduleId: 'planning', capabilityId: definition.capabilityId, organizationId: principal.organizationId, executionKind: 'read' }) || { executable: true, state: 'active', decisionId: 'local' };
    if (availability.executable !== true || !['active', 'degraded'].includes(availability.state || 'active')) fail(TOOL_ERROR_CODES.UNAVAILABLE, { state: availability.state });
    const decision = await authorization?.authorize?.({ principal, delegation, organizationId: principal.organizationId, permission: definition.permission, actionId: definition.actionId, operation: definition.operationId, capabilityId: definition.capabilityId, surface: 'mcp', policies: ['same-organization', 'membership-required'] });
    if (decision?.allowed !== true) {
      if (definition.service === 'readPlan' || definition.service === 'readRoadmap') fail(TOOL_ERROR_CODES.NOT_FOUND);
      fail(TOOL_ERROR_CODES.DENIED);
    }
    const input = normalizeInput(definition, request.input || {}, limits);
    const service = applicationServices[definition.service] || remotePort[definition.service] || (definition.service === 'readPlan' ? remotePort.getPlan : null);
    if (typeof service !== 'function') fail(TOOL_ERROR_CODES.UNAVAILABLE);
    const correlationId = trustedContext.correlationId || `corr_${randomUUID()}`;
    const serviceContext = Object.freeze({
      organizationId: principal.organizationId, subjectId: principal.subject, principal, delegation,
      operation: Object.freeze({ moduleId: 'planning', capabilityId: definition.capabilityId, operationId: definition.operationId, actionId: definition.actionId, permission: definition.permission, executionKind: 'read' }),
      authorizationDecision: Object.freeze({ ...decision, organizationId: principal.organizationId }),
      availabilityDecision: Object.freeze({ ...availability, decisionId: availability.decisionId || availability.availabilityDecisionId }),
      correlationId, deadline: Date.now() + limits.timeoutMs, readOnly: true,
    });
    let result;
    try { result = await deadline(Promise.resolve().then(() => service(input, serviceContext)), limits.timeoutMs); }
    catch (error) { if (error.code === TOOL_ERROR_CODES.TIMEOUT) throw error; throw error; }
    if (result?.ok === false) {
      const notFound = result.problem?.category === 'not_found' || /not_found|tenant_mismatch/.test(result.problem?.code || '');
      fail(notFound ? TOOL_ERROR_CODES.NOT_FOUND : result.problem?.code || TOOL_ERROR_CODES.UNAVAILABLE);
    }
    return boundedOutput(result?.ok === true ? result.value : result, limits);
  }
  return Object.freeze({ execute, callTool: execute, listTools: () => DEFINITIONS.map((item) => ({ ...item })) });
}

module.exports = { createPlanningMcpToolRuntime, PLANNING_MCP_TOOL_IDS, PLANNING_MCP_TOOL_DEFINITIONS: DEFINITIONS, PlanningMcpToolError, PLANNING_MCP_TOOL_PROBLEMS: TOOL_ERROR_CODES, DEFAULT_PLANNING_MCP_LIMITS: DEFAULT_LIMITS };
