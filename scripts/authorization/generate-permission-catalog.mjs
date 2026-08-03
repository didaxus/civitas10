#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { loadCatalog, validateCatalog, catalogHash, CATALOG_PATH, SCHEMA_PATH } from './permission-catalog-utils.mjs'

const COMMAND = 'npm run authz:permission-catalog:generate'
const check = process.argv.includes('--check')
const outputRoot = process.env.CIVITAS_AUTHZ_OUTPUT_ROOT || '.'
const out = (file) => path.join(outputRoot, file)
function generatedMetadata(hash) { return Object.freeze({ notice: 'GENERATED — DO NOT EDIT', source: CATALOG_PATH, command: COMMAND, catalogHash: hash }) }
function assertInput(file) { if (!fs.existsSync(file)) throw new Error(`${file} is missing`) }

try { assertInput(CATALOG_PATH); assertInput(SCHEMA_PATH) } catch (error) { console.error(error.message); process.exit(1) }
const catalog = loadCatalog()
const result = validateCatalog(catalog)
if (!result.valid) { console.error(result.errors.join('\n')); process.exit(1) }
const hash = catalogHash(catalog)
const normalized = { ...catalog, catalogHash: hash, reconciliation: { ...catalog.reconciliation, catalogHash: hash }, permissions: [...catalog.permissions].sort((a,b)=>a.name.localeCompare(b.name)) }
const activePermissions = normalized.permissions.filter((p)=>p.targetStatus === 'active' && p.observedImplementation === 'active' && p.consumers?.length && p.policyRequirements?.length && p.runtimePath && p.testEvidence?.length)
const metadata = generatedMetadata(hash)
const jsHeader = `// GENERATED — DO NOT EDIT.\n// Source: ${CATALOG_PATH}\n// Regenerate: ${COMMAND}\n\n`
const runtime = `${jsHeader}'use strict'\n\nconst generated = Object.freeze(${JSON.stringify({ _generated: metadata, catalog: normalized, activePermissions },null,2)})\nconst catalog = Object.freeze(generated.catalog)\nconst permissions = Object.freeze(catalog.permissions.map(Object.freeze))\nconst activePermissions = Object.freeze(generated.activePermissions.map(Object.freeze))\nconst permissionsByName = Object.freeze(Object.fromEntries(permissions.map((permission) => [permission.name, permission])))\nmodule.exports = { generated, catalog, catalogHash: '${hash}', permissions, activePermissions, permissionsByName }\n`
const json = (body) => JSON.stringify({ _generated: metadata, ...body }, null, 2) + '\n'
const outputs = {
  'core/authz/catalog/generated/permission-catalog.js': runtime,
  'artifacts/authorization/active-permissions.json': json({ catalogHash: hash, activePermissions }),
  'artifacts/authorization/ci-inventory.json': json({ catalogHash: hash, contractVersion: normalized.contractVersion, roleModelVersion: normalized.reconciliation.roleModelVersion, contractVersionRecorded: normalized.reconciliation.contractVersion, counts: { permissions: normalized.permissions.length, namespaces: normalized.phase3Namespaces.length, organizationRoles: normalized.organizationRoles.length, legacyDecisions: normalized.legacyDecisions.length, legacyBaselineObserved: normalized.legacyBaselineObserved.length, activePermissions: activePermissions.length }, baseRef: normalized.reconciliation.baseRef, baseSha: normalized.reconciliation.baseSha, catalogSourceSha: normalized.reconciliation.catalogSourceSha, mergeBase: normalized.reconciliation.mergeBase })
}
const failures = []
for (const [file, body] of Object.entries(outputs)) {
  const target = out(file)
  if (!fs.existsSync(target)) failures.push(`${file}: missing generated artifact`)
  else {
    const actual = fs.readFileSync(target,'utf8')
    if (actual !== body) failures.push(`${file}: generated artifact differs`)
    if (!actual.includes('GENERATED — DO NOT EDIT') || !actual.includes(hash)) failures.push(`${file}: missing GENERATED metadata or catalogHash`)
  }
  if (!check) { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, body) }
}
if (check && failures.length) { console.error(failures.join('\n')); process.exit(1) }
console.log(`${check ? 'checked' : 'generated'} permission catalog ${hash}`)
