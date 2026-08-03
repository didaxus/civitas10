import fs from 'node:fs';
import path from 'node:path';
import * as acorn from 'acorn';

const roots = ['backend/mcp', 'backend/tools'];
const handlerFiles = roots.flatMap((root) => fs.existsSync(root) ? fs.readdirSync(root).filter((name) => /(?:Adapter|Handler|Gateway)\.js$/i.test(name)).map((name) => path.join(root, name)) : []);
const forbiddenImports = new Set(['pg', 'postgres', 'mysql', 'mysql2', 'sqlite3', 'better-sqlite3', 'axios', 'node-fetch', 'undici']);
const failures = [];

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'start' || key === 'end') continue;
    if (Array.isArray(value)) value.forEach((item) => walk(item, visit)); else if (value?.type) walk(value, visit);
  }
}
for (const file of handlerFiles) {
  const source = fs.readFileSync(file, 'utf8');
  const ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'script', locations: true });
  walk(ast, (node) => {
    const fail = (rule) => failures.push(`${file}:${node.loc.start.line} ${rule}`);
    if (node.type === 'CallExpression' && node.callee.name === 'require' && node.arguments[0]?.type === 'Literal' && forbiddenImports.has(node.arguments[0].value)) fail('direct database/provider/network import');
    if (node.type === 'ImportDeclaration' && forbiddenImports.has(node.source.value)) fail('direct database/provider/network import');
    if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' && ['query', 'connect'].includes(node.callee.property?.name)) fail('direct database call');
    if (node.type === 'CallExpression' && ['fetch'].includes(node.callee.name)) fail('direct network call');
    if (node.type === 'Literal' && typeof node.value === 'string') {
      if (/\b(select|insert|update|delete|create|alter|drop)\s+(?:into\s+|from\s+|table\s+)?[a-z_]/i.test(node.value)) fail('embedded SQL');
      if (/https?:\/\//i.test(node.value) || /localhost|127\.0\.0\.1/.test(node.value)) fail('arbitrary URL or REST loopback');
      if (/access[_-]?token|provider[_-]?token|api[_-]?key|bearer\s/i.test(node.value)) fail('provider credential');
      if (node.value === '*' || /\.\*$/.test(node.value)) fail('wildcard tool');
    }
  });
}
if (failures.length) { console.error(`MCP structural gate failed:\n- ${failures.join('\n- ')}`); process.exit(1); }
console.log(`MCP structural gate passed (${handlerFiles.length} handlers; AST rules enforced).`);
