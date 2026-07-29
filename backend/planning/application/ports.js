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
<<<<<<< ours

const REQUIRED_PLANNING_PORTS = Object.freeze({
  authorizationContextPort: createAuthorizationContextPort,
  persistencePort: createPlanningPersistencePort,
  unitOfWorkPort: createUnitOfWorkPort,
  auditPort: createAuditPort,
  outboxPort: createOutboxPort,
  idempotencyLedgerPort: createIdempotencyLedgerPort,
  concurrencyPort: createConcurrencyPort,
});

function createPlanningApplicationPorts(ports) {
  if (!ports || typeof ports !== 'object') throw new Error('PlanningApplicationPorts is required');
  return Object.freeze(Object.fromEntries(
    Object.entries(REQUIRED_PLANNING_PORTS).map(([name, createPort]) => [name, createPort(ports[name])]),
  ));
}

module.exports = { createPlanningPersistencePort, createAuthorizationContextPort, createIdempotencyLedgerPort, createConcurrencyPort, createAuditPort, createOutboxPort, createUnitOfWorkPort, createPlanningApplicationPorts, REQUIRED_PLANNING_PORTS };
=======
function createReviewRepositoryPort(port) { return assertPort('PlanningReviewRepositoryPort', port, ['loadEvents', 'append']); }
function createReviewAuthorizationPolicyPort(port) { return assertPort('PlanningReviewAuthorizationPolicyPort', port, ['authorize']); }
module.exports = { createPlanningPersistencePort, createAuthorizationContextPort, createIdempotencyLedgerPort, createConcurrencyPort, createAuditPort, createOutboxPort, createUnitOfWorkPort, createReviewRepositoryPort, createReviewAuthorizationPolicyPort };
>>>>>>> theirs
