const { planDto, pageDto, profileDto } = require('./dtos');
const { NAMED_USE_CASES, REMOTE_PROBLEM_CODES, assertPlanningRemoteCallContext, problem, failed, ok } = require('./remotePort');
const { createPlanningApplicationPorts } = require('./ports');

const PLAN_STATUSES = Object.freeze({ DRAFT: 'draft', APPROVED: 'approved', ARCHIVED: 'archived' });
const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 100;

const PROBLEM_CATEGORIES = Object.freeze({ VALIDATION: 'validation', AUTHORIZATION: 'authorization', NOT_FOUND: 'not_found', CONFLICT: 'conflict', PRECONDITION: 'precondition_failed' });
const PLANNING_APPLICATION_PROBLEMS = freeze({
  validation: REMOTE_PROBLEM_CODES.VALIDATION,
  notFound: REMOTE_PROBLEM_CODES.NOT_FOUND,
  conflict: REMOTE_PROBLEM_CODES.CONFLICT,
  preconditionFailed: REMOTE_PROBLEM_CODES.PRECONDITION,
  authorizationContextRejected: REMOTE_PROBLEM_CODES.AUTH_CONTEXT,
  tenantMismatch: REMOTE_PROBLEM_CODES.TENANT_MISMATCH,
  idempotencyConflict: REMOTE_PROBLEM_CODES.IDEMPOTENCY_CONFLICT,
});
const resultTypes = freeze({
  createPlan: 'planning.create_plan.result.v1',
  listPlans: 'planning.list_plans.result.v1',
  readPlan: 'planning.read_plan.result.v1',
  updatePlan: 'planning.update_plan.result.v1',
  readProfile: 'planning.read_profile.result.v1',
  replaceProfile: 'planning.replace_profile.result.v1',
});

function freeze(value) { return Object.freeze(value); }
function nonEmpty(value) { return typeof value === 'string' && value.trim().length > 0; }
function nowIso(clock) { return (clock?.() || new Date()).toISOString(); }
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function fingerprint(input) { return stableJson(input); }
function metaFromContext(context) { return { runtimeContractVersion: context.contractVersion || 'planning-application-service/v1', runtimeBindingVersion: context.availabilityDecision?.runtimeBindingVersion || context.availabilityDecision?.version || 'local', correlationId: context.correlationId, remoteRequestId: context.remoteRequestId || context.correlationId }; }
function toFailed(code, category, options = {}) { return failed(problem(code, category, options), options.correlationId); }
function contextProblem(error, context) { return toFailed(REMOTE_PROBLEM_CODES.AUTH_CONTEXT, PROBLEM_CATEGORIES.AUTHORIZATION, { correlationId: context?.correlationId, detailKey: error.message }); }

function createCommand(type, input) { return freeze({ type, ...input }); }
const commands = freeze({
  createPlan: (input) => createCommand('planning.create_plan.command.v1', input),
  updatePlan: (input) => createCommand('planning.update_plan.command.v1', input),
  replaceProfile: (input) => createCommand('planning.replace_profile.command.v1', input),
});
const queries = freeze({
  listPlans: (input) => freeze({ type: 'planning.list_plans.query.v1', ...input }),
  readPlan: (input) => freeze({ type: 'planning.read_plan.query.v1', ...input }),
  readProfile: (input) => freeze({ type: 'planning.read_profile.query.v1', ...input }),
});

function validateContext(context, useCase) {
  try { assertPlanningRemoteCallContext(context, useCase); } catch (error) { return contextProblem(error, context); }
  return null;
}
async function validateTenantScope({ ports, context, resource, operation }) {
  if (!nonEmpty(context.organizationId)) return toFailed(REMOTE_PROBLEM_CODES.AUTH_CONTEXT, PROBLEM_CATEGORIES.AUTHORIZATION, { correlationId: context.correlationId, detailKey: 'organizationId required' });
  if (resource?.organizationId && resource.organizationId !== context.organizationId) return toFailed(REMOTE_PROBLEM_CODES.TENANT_MISMATCH, PROBLEM_CATEGORIES.NOT_FOUND, { correlationId: context.correlationId });
  let decision;
  try {
    decision = await ports.authorizationContextPort.validateDataScope({ context, organizationId: context.organizationId, resource, operation });
  } catch (_error) {
    return toFailed(REMOTE_PROBLEM_CODES.AUTH_CONTEXT, PROBLEM_CATEGORIES.AUTHORIZATION, { correlationId: context.correlationId, detailKey: 'data_scope_indeterminate' });
  }
  if (decision?.allowed !== true) return toFailed(REMOTE_PROBLEM_CODES.AUTH_CONTEXT, PROBLEM_CATEGORIES.AUTHORIZATION, { correlationId: context.correlationId, decisionId: decision?.decisionId, detailKey: decision?.reason || 'data_scope_indeterminate' });
  return null;
}
function normalizeList(input = {}) {
  const limit = Math.min(Math.max(Number(input.limit || DEFAULT_PAGE_LIMIT), 1), MAX_PAGE_LIMIT);
  const includeArchived = input.includeArchived === true;
  return freeze({ cursor: input.cursor || null, limit, includeArchived, filters: freeze({ ...(input.filters || {}), includeArchived }) });
}
async function enforceIdempotency({ ports, context, request, responseFactory }) {
  const key = context.idempotency?.key;
  const requestFingerprint = context.idempotency?.requestFingerprint || fingerprint(request);
  const scope = { organizationId: context.organizationId, principalId: context.subjectId || null,
    clientId: context.subjectId ? null : context.clientId, operationId: context.operation.operationId, key };
  const existing = await ports.idempotencyLedgerPort.lookup(scope);
  if (!existing) return { ...scope, requestFingerprint };
  if (existing.fingerprint !== requestFingerprint) return { replay: toFailed(REMOTE_PROBLEM_CODES.IDEMPOTENCY_CONFLICT, PROBLEM_CATEGORIES.CONFLICT, { correlationId: context.correlationId }) };
  if (existing.result) return { replay: responseFactory(existing.result) };
  return { ...scope, requestFingerprint };
}
async function commitAtomically(ports, work) {
  return ports.unitOfWorkPort.transaction(work);
}
async function recordSideEffects({ tx, ports, context, event, audit, outbox, idem }) {
  const target = tx || ports;
  await (target.auditPort || ports.auditPort).record(audit);
  await (target.outboxPort || ports.outboxPort).enqueue(outbox);
  if (idem?.key) await (target.idempotencyLedgerPort || ports.idempotencyLedgerPort).recordSuccess({ ...idem, fingerprint: idem.requestFingerprint, result: event.result, correlationId: context.correlationId });
}
function createPlanningApplicationServices(ports, options = {}) {
  ports = createPlanningApplicationPorts(ports);
  const clock = options.clock || (() => new Date());

  async function createPlan(command, context) {
    const ctx = validateContext(context, 'createPlan'); if (ctx) return ctx;
    const scoped = await validateTenantScope({ ports, context, operation: NAMED_USE_CASES.createPlan.operationId }); if (scoped) return scoped;
    const result = await commitAtomically(ports, async (tx) => {
      const idem = await enforceIdempotency({ ports: tx, context, request: command, responseFactory: (r) => ok(planDto(r), metaFromContext(context)) }); if (idem.replay) return idem.replay;
      const saved = await (tx.persistencePort || ports.persistencePort).createPlan({ ...command, organizationId: context.organizationId, status: command.status || PLAN_STATUSES.DRAFT, updatedAt: nowIso(clock) });
      const dto = planDto(saved);
      await recordSideEffects({ tx, ports, context, event: { result: dto }, audit: { action: 'planning.plan.created.v1', organizationId: context.organizationId, actorId: context.subjectId, targetId: dto.planId, correlationId: context.correlationId }, outbox: { type: 'planning.plan.created.v1', organizationId: context.organizationId, aggregateId: dto.planId, payload: dto, correlationId: context.correlationId }, idem });
      return dto;
    });
    return result?.ok !== undefined ? result : ok(result, metaFromContext(context));
  }
  async function listPlans(query, context) {
    const ctx = validateContext(context, 'listPlans'); if (ctx) return ctx;
    const scoped = await validateTenantScope({ ports, context, operation: NAMED_USE_CASES.listPlans.operationId }); if (scoped) return scoped;
    return commitAtomically(ports, async (tx) => ok(pageDto(await tx.persistencePort.listPlans({ organizationId: context.organizationId, constraints: normalizeList(query) })), metaFromContext(context)));
  }
  async function readPlan(query, context) {
    const ctx = validateContext(context, 'getPlan'); if (ctx) return ctx;
    const scoped = await validateTenantScope({ ports, context, resource: { organizationId: context.organizationId, planId: query.planId }, operation: NAMED_USE_CASES.getPlan.operationId }); if (scoped) return scoped;
    return commitAtomically(ports, async (tx) => { const found = await tx.persistencePort.readPlan({ organizationId: context.organizationId, planId: query.planId });
      if (!found) return toFailed(REMOTE_PROBLEM_CODES.NOT_FOUND, PROBLEM_CATEGORIES.NOT_FOUND, { correlationId: context.correlationId });
      const tenant = await validateTenantScope({ ports, context, resource: found, operation: NAMED_USE_CASES.getPlan.operationId }); if (tenant) return tenant;
      return ok(planDto(found), metaFromContext(context)); });
  }
  async function updatePlan(command, context) {
    const ctx = validateContext(context, 'updatePlan'); if (ctx) return ctx;
    const expected = context.concurrency?.etag || context.concurrency?.expectedVersion || command.ifMatch;
    if (!expected) return toFailed(REMOTE_PROBLEM_CODES.PRECONDITION_REQUIRED, PROBLEM_CATEGORIES.PRECONDITION, { correlationId: context.correlationId, detailKey: 'if_match_required' });
    const scoped = await validateTenantScope({ ports, context, resource: { organizationId: context.organizationId, planId: command.planId }, operation: NAMED_USE_CASES.updatePlan.operationId }); if (scoped) return scoped;
    return commitAtomically(ports, async (tx) => {
      const idem = await enforceIdempotency({ ports: tx, context, request: command, responseFactory: (r) => ok(planDto(r), metaFromContext(context)) }); if (idem.replay) return idem.replay;
      const current = await tx.persistencePort.readPlan({ organizationId: context.organizationId, planId: command.planId });
      if (!current) return toFailed(REMOTE_PROBLEM_CODES.NOT_FOUND, PROBLEM_CATEGORIES.NOT_FOUND, { correlationId: context.correlationId });
      const tenant = await validateTenantScope({ ports, context, resource: current, operation: NAMED_USE_CASES.updatePlan.operationId }); if (tenant) return tenant;
      if (current.status === PLAN_STATUSES.APPROVED) return toFailed(REMOTE_PROBLEM_CODES.CONFLICT, PROBLEM_CATEGORIES.CONFLICT, { correlationId: context.correlationId, detailKey: 'approved_plan_mutation_denied' });
      if (String(current.version || current.etag) !== String(expected)) return toFailed(REMOTE_PROBLEM_CODES.PRECONDITION, PROBLEM_CATEGORIES.PRECONDITION, { correlationId: context.correlationId, expectedVersion: expected, currentVersion: current.version || current.etag });
      await (tx.concurrencyPort || ports.concurrencyPort).assertIfMatch({ organizationId: context.organizationId, aggregateType: 'planning.plan', aggregateId: command.planId, ifMatch: expected, currentVersion: current.version || current.etag });
      const saved = await (tx.persistencePort || ports.persistencePort).updatePlan({ ...command, organizationId: context.organizationId, ifMatch: expected, updatedAt: nowIso(clock) });
      const dto = planDto(saved);
      await recordSideEffects({ tx, ports, context, event: { result: dto }, audit: { action: 'planning.plan.updated.v1', organizationId: context.organizationId, actorId: context.subjectId, targetId: dto.planId, correlationId: context.correlationId }, outbox: { type: 'planning.plan.updated.v1', organizationId: context.organizationId, aggregateId: dto.planId, payload: dto, correlationId: context.correlationId }, idem });
      return ok(dto, metaFromContext(context));
    });
  }
  async function readProfile(query, context) { const ctx = validateContext(context, 'getProfile'); if (ctx) return ctx; const scoped = await validateTenantScope({ ports, context, operation: NAMED_USE_CASES.getProfile.operationId }); if (scoped) return scoped; return commitAtomically(ports, async (tx) => { const found = await tx.persistencePort.readProfile({ organizationId: context.organizationId }); if (!found) return toFailed(REMOTE_PROBLEM_CODES.NOT_FOUND, PROBLEM_CATEGORIES.NOT_FOUND, { correlationId: context.correlationId }); return ok(profileDto(found), metaFromContext(context)); }); }
  async function replaceProfile(command, context) {
    const ctx = validateContext(context, 'replaceProfile'); if (ctx) return ctx;
    const expected = context.concurrency?.etag || context.concurrency?.expectedVersion || command.ifMatch;
    if (!expected) return toFailed(REMOTE_PROBLEM_CODES.PRECONDITION_REQUIRED, PROBLEM_CATEGORIES.PRECONDITION, { correlationId: context.correlationId, detailKey: 'if_match_required' });
    const scoped = await validateTenantScope({ ports, context, operation: NAMED_USE_CASES.replaceProfile.operationId }); if (scoped) return scoped;
    return commitAtomically(ports, async (tx) => { const idem = await enforceIdempotency({ ports: tx, context, request: command, responseFactory: (r) => ok(profileDto(r), metaFromContext(context)) }); if (idem.replay) return idem.replay; const current = await tx.persistencePort.readProfile({ organizationId: context.organizationId });
      if (!current) return toFailed(REMOTE_PROBLEM_CODES.NOT_FOUND, PROBLEM_CATEGORIES.NOT_FOUND, { correlationId: context.correlationId });
      if (String(current.version || current.etag) !== String(expected)) return toFailed(REMOTE_PROBLEM_CODES.PRECONDITION, PROBLEM_CATEGORIES.PRECONDITION, { correlationId: context.correlationId, expectedVersion: expected, currentVersion: current.version || current.etag });
      await tx.concurrencyPort.assertIfMatch({ organizationId: context.organizationId, aggregateType: 'planning.profile', aggregateId: context.organizationId, ifMatch: expected, currentVersion: current.version || current.etag }); const saved = await tx.persistencePort.replaceProfile({ ...command, organizationId: context.organizationId, ifMatch: expected, updatedAt: nowIso(clock) }); const dto = profileDto(saved); await recordSideEffects({ tx, ports, context, event: { result: dto }, audit: { action: 'planning.profile.updated.v1', organizationId: context.organizationId, actorId: context.subjectId, correlationId: context.correlationId }, outbox: { type: 'planning.profile.updated.v1', organizationId: context.organizationId, aggregateId: context.organizationId, payload: dto, correlationId: context.correlationId }, idem }); return ok(dto, metaFromContext(context)); });
  }
  return freeze({ createPlan, listPlans, readPlan, updatePlan, readProfile, replaceProfile });
}
module.exports = { createPlanningApplicationServices, commands, queries, resultTypes, PLANNING_APPLICATION_PROBLEMS, PLAN_STATUSES, PROBLEM_CATEGORIES };
