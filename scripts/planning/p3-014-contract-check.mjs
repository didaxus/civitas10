import fs from 'node:fs';
const fail = (m) => { console.error(m); process.exitCode = 1; };
const api = fs.readFileSync('contracts/openapi/civitas-api.yaml', 'utf8');
const planning = fs.readFileSync('contracts/openapi/modules/planning.yaml', 'utf8');
const runtime = JSON.parse(fs.readFileSync('contracts/federation/planning-runtime/v1/schema.json', 'utf8'));
const parity = JSON.parse(fs.readFileSync('artifacts/federation/p3-014-planning-operation-parity.json', 'utf8'));
for (const path of ['/o/{organizationId}/planning/plans', '/o/{organizationId}/planning/plans/{planId}', '/o/{organizationId}/planning/profile']) {
  if (!api.includes(path)) fail(`missing composed OpenAPI path ${path}`);
}
const requiredMeta = ['x-civitas-module', 'x-civitas-capability', 'x-civitas-route-id', 'x-civitas-action-id', 'x-civitas-status', 'x-civitas-permission', 'x-civitas-policies', 'x-civitas-audit', 'x-civitas-idempotency', 'x-civitas-execution'];
for (const op of parity.operations) {
  if (!planning.includes(`operationId: ${op.operationId}`)) fail(`missing operationId ${op.operationId}`);
  if (!planning.includes(`x-civitas-route-id: ${op.routeId}`)) fail(`missing routeId ${op.routeId}`);
  if (!planning.includes(`x-civitas-action-id: ${op.actionId}`)) fail(`missing actionId ${op.actionId}`);
  if (!runtime.operations[op.runtimeOperation]) fail(`missing runtime operation ${op.runtimeOperation}`);
}
for (const meta of requiredMeta) if ((planning.match(new RegExp(meta, 'g')) || []).length < 6) fail(`metadata not present for six operations: ${meta}`);
if (planning.includes('x-civitas-status: active')) fail('planning contracts must remain planned until P3-019 activation');
if (JSON.stringify(runtime.operations).includes('archive')) fail('archive must not be active runtime operation');
for (const eventFile of ['contracts/events/planning/v1/plan-created.schema.json', 'contracts/events/planning/v1/profile-updated.schema.json']) {
  const eventSchema = JSON.parse(fs.readFileSync(eventFile, 'utf8'));
  for (const key of ['organizationId', 'actor', 'correlationId', 'sensitivity']) if (!JSON.stringify(eventSchema).includes(key)) fail(`${eventFile} missing ${key}`);
}
if (!process.exitCode) console.log('P3-014 planning contract check passed');
