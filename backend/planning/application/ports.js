function assertPort(name, port, methods) {
  if (!port || typeof port !== 'object') throw new Error(`${name} is required`);
  for (const method of methods) if (typeof port[method] !== 'function') throw new Error(`${name}.${method} is required`);
  return Object.freeze(port);
}
function createPlanningPersistencePort(port) { return assertPort('PlanningPersistencePort', port, ['createPlan', 'listPlans', 'readPlan', 'updatePlan', 'readProfile', 'replaceProfile']); }
function createAuthorizationContextPort(port) { return assertPort('PlanningAuthorizationContextPort', port, ['validateDataScope']); }
function createIdempotencyLedgerPort(port) { return assertPort('PlanningIdempotencyLedgerPort', port, ['lookup', 'recordSuccess']); }
function createConcurrencyPort(port) { return assertPort('PlanningConcurrencyPort', port, ['assertIfMatch']); }
function createAuditPort(port) { return assertPort('PlanningAuditPort', port, ['record']); }
function createOutboxPort(port) { return assertPort('PlanningOutboxPort', port, ['enqueue']); }
function createUnitOfWorkPort(port) { return assertPort('PlanningUnitOfWorkPort', port, ['transaction']); }
module.exports = { createPlanningPersistencePort, createAuthorizationContextPort, createIdempotencyLedgerPort, createConcurrencyPort, createAuditPort, createOutboxPort, createUnitOfWorkPort };
