import fs from 'node:fs';

const mode = process.argv[2] || 'contract';
const inventory = JSON.parse(fs.readFileSync('artifacts/planning/p3-016-implementation-inventory.json', 'utf8'));
const services = fs.readFileSync('backend/planning/application/services.js', 'utf8');
const ports = fs.readFileSync('backend/planning/application/ports.js', 'utf8');
const runtime = JSON.parse(fs.readFileSync('contracts/federation/planning-runtime/v1/schema.json', 'utf8'));

if (mode === 'postgres') {
  console.error('NOT_AVAILABLE: P3-015 tenant-bound PostgreSQL persistence is not implemented');
  process.exit(2);
}

const failures = [];
for (const service of inventory.servicesPresent) {
  if (!new RegExp(`async function ${service}\\(`).test(services)) failures.push(`missing application service ${service}`);
}
const portFactories = {
  PlanningPersistencePort: 'createPlanningPersistencePort',
  PlanningAuthorizationContextPort: 'createAuthorizationContextPort',
  PlanningIdempotencyLedgerPort: 'createIdempotencyLedgerPort',
  PlanningConcurrencyPort: 'createConcurrencyPort',
  PlanningAuditPort: 'createAuditPort',
  PlanningOutboxPort: 'createOutboxPort',
  PlanningUnitOfWorkPort: 'createUnitOfWorkPort',
};
for (const port of inventory.stablePortsAlreadyPresent) {
  if (!ports.includes(portFactories[port])) failures.push(`missing stable port ${port}`);
}
if (Object.keys(runtime.operations).length !== 6) failures.push('private runtime must expose exactly six operations');
if (runtime.status !== 'planned') failures.push('Planning runtime must remain planned');
if (inventory.completionClaim !== false || inventory.status !== 'blocked') failures.push('P3-016 must not claim completion without P3-015');
if (!inventory.conflicting.some((item) => item.includes('planning.plan.updated.v1'))) failures.push('missing update-event contract gap');

if (mode === 'security') {
  for (const token of ['Moodle', 'OpenAI', 'archivePlan', 'upsertProfile']) {
    if (services.includes(token)) failures.push(`out-of-scope service leakage: ${token}`);
  }
  if (!services.includes('validateContext(context')) failures.push('context must be validated before service lookups');
  if (!services.includes('validateTenantScope')) failures.push('tenant/data-scope port must precede persistence');
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`P3-016 ${mode} boundary check passed; implementation remains blocked by P3-015`);
