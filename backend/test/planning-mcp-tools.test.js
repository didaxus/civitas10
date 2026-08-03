'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createPlanningMcpToolRuntime, PLANNING_MCP_TOOL_IDS, PLANNING_MCP_TOOL_PROBLEMS } = require('../tools');

const principal = (organizationId, delegated = false) => ({ principalId: `p-${organizationId}`, subject: 'user-1', organizationId, ...(delegated ? { delegation: { delegatorId: 'human-1', permissionCeiling: ['planning.plans.read'] } } : {}) });
function fixture(overrides = {}) {
  const state = { calls: [], audits: [], outbox: [], writes: [] };
  const plans = { a: [{ planId: 'a1', organizationId: 'a', title: 'A' }], b: [{ planId: 'b1', organizationId: 'b', title: 'B' }] };
  const services = {
    async listPlans(query, context) { state.calls.push({ name: 'list', query, context }); return { items: plans[context.organizationId], page: { cursor: query.cursor, nextCursor: 'next', limit: query.limit } }; },
    async readPlan(query, context) { state.calls.push({ name: 'read', query, context }); return plans[context.organizationId].find((x) => x.planId === query.planId) || { ok: false, problem: { code: 'planning.remote.not_found', category: 'not_found' } }; },
    async readRoadmap(query, context) { return { roadmapId: query.roadmapId, organizationId: context.organizationId }; },
    async validatePlan(query, context) { state.calls.push({ name: 'validate', query, context }); return { valid: !!query.plan.title, violations: query.plan.title ? [] : ['title_required'] }; },
  };
  const runtime = createPlanningMcpToolRuntime({ applicationServices: services, authorization: { authorize: async (request) => ({ allowed: true, decisionId: 'authz-1', request }) }, availabilityResolver: { resolve: async () => ({ executable: true, state: 'active', decisionId: 'available-1' }) }, ...overrides });
  return { runtime, state };
}
const call = (runtime, toolId, input, organizationId = 'a', delegated = false) => runtime.execute({ toolId, input }, { principal: principal(organizationId, delegated), correlationId: 'corr-1' });
async function rejects(promise, code) { await assert.rejects(promise, (error) => error.code === code); }

test('registers exactly the four active Planning tools', () => { const { runtime } = fixture(); assert.deepEqual(runtime.listTools().map((x) => x.id), PLANNING_MCP_TOOL_IDS); assert.equal(runtime.listTools().every((x) => x.status === 'active'), true); });
test('REST application service and MCP have result and authorization parity', async () => { const { runtime, state } = fixture(); const result = await call(runtime, PLANNING_MCP_TOOL_IDS[0], { limit: 10 }); assert.equal(result.items[0].planId, 'a1'); assert.equal(state.calls[0].context.operation.permission, 'planning.plans.read'); assert.equal(state.calls[0].context.authorizationDecision.decisionId, 'authz-1'); });
test('isolates two tenants and accepts direct and delegated principals', async () => { const { runtime, state } = fixture(); assert.equal((await call(runtime, PLANNING_MCP_TOOL_IDS[0], {}, 'a')).items[0].planId, 'a1'); assert.equal((await call(runtime, PLANNING_MCP_TOOL_IDS[0], {}, 'b', true)).items[0].planId, 'b1'); assert.equal(state.calls[1].context.delegation.delegatorId, 'human-1'); });
test('does not leak resource existence on authorization or tenant misses', async () => { const denied = fixture({ authorization: { authorize: async () => ({ allowed: false }) } }).runtime; await rejects(call(denied, PLANNING_MCP_TOOL_IDS[1], { planId: 'b1' }), PLANNING_MCP_TOOL_PROBLEMS.NOT_FOUND); const { runtime } = fixture(); await rejects(call(runtime, PLANNING_MCP_TOOL_IDS[1], { planId: 'b1' }), PLANNING_MCP_TOOL_PROBLEMS.NOT_FOUND); });
test('enforces cursor, page, closed input and output limits', async () => { const { runtime } = fixture(); await rejects(call(runtime, PLANNING_MCP_TOOL_IDS[0], { cursor: 'x'.repeat(513) }), PLANNING_MCP_TOOL_PROBLEMS.INVALID); await rejects(call(runtime, PLANNING_MCP_TOOL_IDS[0], { organizationId: 'b' }), PLANNING_MCP_TOOL_PROBLEMS.INVALID); await call(runtime, PLANNING_MCP_TOOL_IDS[0], { limit: 999 }); const oversized = fixture({ applicationServices: { listPlans: async () => ({ value: 'x'.repeat(70_000) }), readPlan: async()=>{}, readRoadmap:async()=>{}, validatePlan:async()=>{} } }).runtime; await rejects(call(oversized, PLANNING_MCP_TOOL_IDS[0], {}), PLANNING_MCP_TOOL_PROBLEMS.OUTPUT); });
test('validate is a dry run and emits no mutation audit, write, or outbox', async () => { const { runtime, state } = fixture(); const result = await call(runtime, PLANNING_MCP_TOOL_IDS[3], { plan: { title: 'Draft' } }, 'a', true); assert.equal(result.valid, true); assert.equal(state.calls.at(-1).query.dryRun, true); assert.equal(state.calls.at(-1).context.readOnly, true); assert.deepEqual([state.writes, state.audits, state.outbox], [[], [], []]); });
test('allows executable degraded reads and rejects unavailable runtime', async () => { const degraded = fixture({ availabilityResolver: { resolve: async () => ({ executable: true, state: 'degraded' }) } }).runtime; assert.equal((await call(degraded, PLANNING_MCP_TOOL_IDS[0], {})).items.length, 1); const unavailable = fixture({ availabilityResolver: { resolve: async () => ({ executable: false, state: 'unavailable' }) } }).runtime; await rejects(call(unavailable, PLANNING_MCP_TOOL_IDS[0], {}), PLANNING_MCP_TOOL_PROBLEMS.UNAVAILABLE); });
test('enforces handler timeout', async () => { const runtime = fixture({ limits: { timeoutMs: 5 }, applicationServices: { listPlans: async () => new Promise(()=>{}), readPlan:async()=>{}, readRoadmap:async()=>{}, validatePlan:async()=>{} } }).runtime; await rejects(call(runtime, PLANNING_MCP_TOOL_IDS[0], {}), PLANNING_MCP_TOOL_PROBLEMS.TIMEOUT); });
