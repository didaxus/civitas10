'use strict';

const { createPostgresPlanningPersistence } = require('../infrastructure/postgresPersistenceAdapter');
const { createPlanningApplicationServices, commands, queries } = require('../application/services');
const { createPlanningRemoteApplicationPort } = require('../application/remotePort');
const { createDefaultPolicyRegistry } = require('../../authorization/policies');
const { createPlanningRouter } = require('../presentation/routes');

const REQUIRED = Object.freeze([
  'pool', 'authorizationContextPort', 'availabilityResolver', 'authorizationProviders',
  'authorizationResourceResolver', 'authenticationAudienceMiddleware',
  'organizationContextMiddleware', 'canonicalPrincipalMiddleware',
]);

function requireDependencies(deps) {
  for (const name of REQUIRED) if (deps[name] == null) throw new TypeError(`Planning composition requires ${name}`);
  if (typeof deps.pool.connect !== 'function') throw new TypeError('Planning composition requires pool.connect');
  if (typeof deps.authorizationContextPort.validateDataScope !== 'function') throw new TypeError('Planning composition requires authorizationContextPort.validateDataScope');
  if (typeof deps.availabilityResolver.resolve !== 'function') throw new TypeError('Planning composition requires availabilityResolver.resolve');
  if (typeof deps.authorizationResourceResolver !== 'function') throw new TypeError('Planning composition requires authorizationResourceResolver');
  for (const name of ['authenticationAudienceMiddleware', 'organizationContextMiddleware', 'canonicalPrincipalMiddleware']) if (typeof deps[name] !== 'function') throw new TypeError(`Planning composition requires ${name}`);
}

function createPlanningRuntime(deps = {}) {
  requireDependencies(deps);
  const postgres = createPostgresPlanningPersistence({ pool: deps.pool });
  const services = createPlanningApplicationServices({
    authorizationContextPort: deps.authorizationContextPort,
    persistencePort: postgres.persistencePort,
    unitOfWorkPort: { transaction: postgres.transaction },
    auditPort: postgres.auditPort,
    outboxPort: postgres.outboxPort,
    idempotencyLedgerPort: postgres.idempotencyLedgerPort,
    concurrencyPort: postgres.concurrencyPort,
  });
  const planningRemoteApplicationPort = createPlanningRemoteApplicationPort({
    createPlan: (input, context) => services.createPlan(commands.createPlan(input), context),
    listPlans: (input, context) => services.listPlans(queries.listPlans(input), context),
    readPlan: (input, context) => services.readPlan(queries.readPlan(input), context),
    updatePlan: (input, context) => services.updatePlan(commands.updatePlan(input), context),
    readProfile: (input, context) => services.readProfile(queries.readProfile(input), context),
    replaceProfile: (input, context) => services.replaceProfile(commands.replaceProfile(input), context),
  });
  const authorizationRegistry = deps.authorizationRegistry || createDefaultPolicyRegistry();
  const router = createPlanningRouter({
    planningRemoteApplicationPort,
    availabilityResolver: deps.availabilityResolver,
    authorizationProviders: deps.authorizationProviders,
    authorizationResourceResolver: deps.authorizationResourceResolver,
    authorizationRegistry,
    preAuthorizationMiddleware: [deps.authenticationAudienceMiddleware, deps.organizationContextMiddleware, deps.canonicalPrincipalMiddleware],
  });
  return Object.freeze({ router, postgres, services, planningRemoteApplicationPort, availabilityResolver: deps.availabilityResolver, authorizationProviders: deps.authorizationProviders, authorizationRegistry, authorizationResourceResolver: deps.authorizationResourceResolver });
}

module.exports = { REQUIRED_PLANNING_COMPOSITION_DEPENDENCIES: REQUIRED, createPlanningRuntime };
