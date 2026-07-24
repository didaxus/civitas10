import fs from 'node:fs';
import path from 'node:path';

const root = 'contracts/openapi';
const api = fs.readFileSync(path.join(root, 'civitas-api.yaml'), 'utf8');
const failures = [];
const requiredModules = [
  'lms', 'crm', 'marketing', 'community', 'payments',
  'hr', 'scheduling', 'support', 'analytics', 'reports', 'planning',
];

if (!/^openapi: 3\.1\.0$/m.test(api)) failures.push('civitas-api.yaml must freeze OpenAPI 3.1.0');
for (const moduleId of requiredModules) {
  const file = path.join(root, 'modules', `${moduleId}.yaml`);
  if (!fs.existsSync(file)) failures.push(`missing module fragment: ${file}`);
  if (!api.includes(`./modules/${moduleId}.yaml`)) failures.push(`root OpenAPI does not reference ${moduleId}`);
}

for (const file of requiredModules.map((id) => path.join(root, 'modules', `${id}.yaml`)).filter(fs.existsSync)) {
  const content = fs.readFileSync(file, 'utf8');
  for (const key of [
    'operationId:', 'x-civitas-module:', 'x-civitas-capability:',
    'x-civitas-route-id:', 'x-civitas-action-id:', 'x-civitas-surface:',
    'x-civitas-status:', 'x-civitas-permission:', 'x-civitas-policies:',
    'x-civitas-audit:', 'x-civitas-idempotency:', 'x-civitas-execution:',
  ]) {
    if (!content.includes(key)) failures.push(`${file}: missing ${key}`);
  }
  if (!content.includes('/o/{organizationId}/')) failures.push(`${file}: organization path must be explicit`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('OpenAPI contract validation passed.');
