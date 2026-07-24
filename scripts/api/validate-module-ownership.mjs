import fs from 'node:fs';
import path from 'node:path';

const directory = 'contracts/openapi/modules';
const modules = new Set([
  'lms', 'crm', 'marketing', 'community', 'payments',
  'hr', 'scheduling', 'support', 'analytics', 'reports', 'planning',
]);
const providers = ['moodle', 'mautic', 'matomo', 'calcom', 'freescout', 'stripe'];
const roles = ['teacher-view', 'student-view', 'parent-view', 'admin-view'];
const failures = [];
const operationIds = new Map();

for (const name of fs.readdirSync(directory).filter((item) => item.endsWith('.yaml'))) {
  const moduleId = path.basename(name, '.yaml');
  const file = path.join(directory, name);
  const content = fs.readFileSync(file, 'utf8');
  if (!modules.has(moduleId)) failures.push(`${file}: unknown module`);
  if (!content.includes(`x-civitas-module: ${moduleId}`)) failures.push(`${file}: ownership metadata mismatch`);
  const pathLines = content.split('\n').filter((line) => /^\s{2}\//.test(line));
  for (const token of [...providers, ...roles]) {
    if (pathLines.some((line) => line.toLowerCase().includes(token))) {
      failures.push(`${file}: forbidden canonical path token ${token}`);
    }
  }
  for (const match of content.matchAll(/operationId:\s*([A-Za-z0-9_]+)/g)) {
    const id = match[1];
    if (operationIds.has(id)) failures.push(`duplicate operationId ${id}: ${operationIds.get(id)} and ${file}`);
    operationIds.set(id, file);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Module ownership validation passed.');
