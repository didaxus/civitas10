#!/usr/bin/env node

import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, relative, dirname, sep } from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const root = resolve(option('--root') ?? process.cwd());
const expectedSha = option('--sha') ?? process.env.GITHUB_SHA;
const errors = [];
const checked = { json: 0, yaml: 0, references: 0 };
const fail = (file, message) => errors.push(`${relative(root, file) || '.'}: ${message}`);

async function filesBelow(directory) {
  const result = [];
  async function visit(current) {
    let entries;
    try { entries = await readdir(current, { withFileTypes: true }); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const path = resolve(current, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) result.push(path);
    }
  }
  await visit(resolve(root, directory));
  return result;
}

function inspectSchema(node, file, pointer = '#') {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'object' && Array.isArray(node.required)) {
    for (const key of node.required) {
      if (!Object.hasOwn(node.properties ?? {}, key)) fail(file, `${pointer} requires undefined property ${key}`);
    }
  }
  for (const [key, value] of Object.entries(node)) inspectSchema(value, file, `${pointer}/${key}`);
}

function inspectEmptyIds(node, file, pointer = '#') {
  if (!node || typeof node !== 'object') return;
  for (const [key, value] of Object.entries(node.properties ?? {})) {
    if (/(?:^|_)(?:id|ids)$/i.test(key) || /Id(?:s)?$/.test(key)) {
      if (value.type === 'string' && !(Number.isInteger(value.minLength) && value.minLength >= 1)) {
        fail(file, `${pointer}/properties/${key} permits an empty ID`);
      }
      if (value.type === 'array' && value.items?.type === 'string' &&
          !(Number.isInteger(value.items.minLength) && value.items.minLength >= 1)) {
        fail(file, `${pointer}/properties/${key}/items permits an empty ID`);
      }
    }
  }
  for (const [key, value] of Object.entries(node)) inspectEmptyIds(value, file, `${pointer}/${key}`);
}

// This deliberately small parser validates the YAML surface used by the contracts without
// loading code, resolving tags, accessing the network, or adding an npm dependency.
function parseYamlDocument(text, file) {
  if (/^\s*[{[]/.test(text)) {
    try { return JSON.parse(text); } catch (error) { fail(file, `invalid JSON-compatible YAML: ${error.message}`); return null; }
  }
  const indents = [0];
  let blockScalarIndent = null;
  for (const [index, raw] of text.replaceAll('\r\n', '\n').split('\n').entries()) {
    if (/\t/.test(raw.slice(0, raw.search(/\S|$/)))) fail(file, `line ${index + 1} uses a tab for indentation`);
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const indent = raw.length - raw.trimStart().length;
    if (blockScalarIndent !== null && indent > blockScalarIndent) continue;
    blockScalarIndent = null;
    while (indent < indents.at(-1)) indents.pop();
    if (indent > indents.at(-1)) indents.push(indent);
    const content = raw.trimStart();
    if (!/^(?:-\s+)?(?:[^:#{}[\],][^:]*|['"][^'"]+['"]):(?:\s|$)/.test(content) && !content.startsWith('- ')) {
      fail(file, `line ${index + 1} is not a YAML mapping or sequence entry`);
    }
    if (/:[ \t]*[>|][-+]?\s*(?:#.*)?$/.test(content)) blockScalarIndent = indent;
    let square = 0; let curly = 0; let quote = null;
    for (let i = 0; i < content.length; i += 1) {
      const char = content[i];
      if (quote) { if (char === quote && content[i - 1] !== '\\') quote = null; continue; }
      if (char === '"' || char === "'") quote = char;
      else if (char === '[') square += 1; else if (char === ']') square -= 1;
      else if (char === '{') curly += 1; else if (char === '}') curly -= 1;
    }
    if (quote || square !== 0 || curly !== 0) fail(file, `line ${index + 1} has an unterminated flow value`);
  }
  return { yaml: true };
}

async function exists(path) { try { return (await stat(path)).isFile(); } catch { return false; } }

function collectEvidenceShas(value, found = []) {
  if (!value || typeof value !== 'object') return found;
  for (const [key, child] of Object.entries(value)) {
    if (/^(?:sha|commitSha|sourceSha|testedSha|gitSha)$/i.test(key) && typeof child === 'string') found.push(child);
    else collectEvidenceShas(child, found);
  }
  return found;
}

const contractFiles = await filesBelow('contracts');
const phase3AuditFiles = await filesBelow('docs/audits/phase-3');
const parsedJson = new Map();
for (const file of [...contractFiles, ...phase3AuditFiles]) {
  const text = await readFile(file, 'utf8');
  if (file.endsWith('.json')) {
    checked.json += 1;
    try {
      const value = JSON.parse(text);
      parsedJson.set(file, value);
      if (/schema\.json$/.test(file)) inspectSchema(value, file);
      if (expectedSha && /(?:evidence|manifest)/i.test(file)) {
        for (const sha of collectEvidenceShas(value)) {
          if (sha !== expectedSha) fail(file, `evidence SHA ${sha} does not match ${expectedSha}`);
        }
      }
    } catch (error) { fail(file, `invalid JSON: ${error.message}`); }
  } else if (/\.ya?ml$/.test(file)) {
    checked.yaml += 1;
    parseYamlDocument(text, file);
  }
}

for (const name of ['principal.schema.json', 'role-path.schema.json', 'token-claims.schema.json']) {
  const file = resolve(root, 'contracts/authorization', name);
  const schema = parsedJson.get(file);
  if (schema) inspectEmptyIds(schema, file);
}

const claimsFile = resolve(root, 'contracts/authorization/token-claims.schema.json');
const claims = parsedJson.get(claimsFile);
if (claims) {
  const prefix = 'https://civitas.didaxus.com/claims/';
  const allowed = new Set(['organization_membership_id', 'organization_role_ids', 'authz_contract_version'].map((x) => prefix + x));
  const declared = Object.keys(claims.properties ?? {}).filter((key) => key.startsWith(prefix));
  for (const claim of declared) if (!allowed.has(claim)) fail(claimsFile, `unknown custom claim ${claim}`);
  for (const claim of allowed) if (!declared.includes(claim) || !(claims.required ?? []).includes(claim)) fail(claimsFile, `required custom claim missing: ${claim}`);
}

const rolePathFile = resolve(root, 'contracts/authorization/role-path.schema.json');
const rolePath = parsedJson.get(rolePathFile);
if (rolePath) {
  const complete = ['rolePathId', 'organizationId', 'membershipBindingId', 'membershipState', 'logtoRoleId',
    'canonicalRoleId', 'roleAssignmentState', 'permissionId', 'rolePotentialVersion', 'snapshotVersion'];
  for (const field of complete) if (!(rolePath.required ?? []).includes(field)) fail(rolePathFile, `incomplete role path: ${field} is not required`);
}

for (const [file, value] of parsedJson) {
  const visit = (node, pointer = '#') => {
    if (!node || typeof node !== 'object') return;
    const dimension = node.dimensionId ?? node.dimension ?? node.id;
    const active = node.status === 'active' || node.lifecycle === 'active' || node.active === true;
    if (active && ['academic.grade_level', 'academic.section'].includes(dimension)) fail(file, `${pointer} activates legacy dimension ${dimension}`);
    for (const [key, child] of Object.entries(node)) visit(child, `${pointer}/${key}`);
  };
  visit(value);
}

for (const file of contractFiles) {
  if (!/\.(?:json|ya?ml)$/.test(file)) continue;
  const text = await readFile(file, 'utf8');
  for (const match of text.matchAll(/\$ref\s*["']?\s*:\s*["']?([^\s"'}\],]+)/g)) {
    const reference = match[1];
    if (/^[a-z][a-z+.-]*:\/\//i.test(reference) || reference.startsWith('#')) continue;
    const target = resolve(dirname(file), reference.split('#')[0]);
    checked.references += 1;
    if (!target.startsWith(root + sep) || !(await exists(target))) fail(file, `unresolved reference ${reference}`);
  }
}

if (errors.length) {
  console.error(`Phase 3 contract validation failed (${errors.length} error(s)):`);
  for (const error of errors.sort()) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Phase 3 contracts valid: ${checked.json} JSON, ${checked.yaml} YAML, ${checked.references} local references.`);
}
