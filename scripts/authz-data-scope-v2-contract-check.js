#!/usr/bin/env node
'use strict'
const fs = require('fs')
const path = require('path')
const root = path.resolve(__dirname, '..')
const scope = require('../backend/authorization/data-scope')
const forbidden = ['academic.' + 'section', 'course_' + 'scope']
const excluded = new Set(['docs', 'artifacts', '.git', 'node_modules', 'backend/db/migrations'])
const legacyEvidenceFiles = new Set([
  'backend/taxonomy/taxonomyV2MigrationService.js',
  'backend/test/taxonomy-v2-migration.test.js',
  'scripts/authz-data-scope-v2-contract-check.js',
  'scripts/contracts/referential-integrity-check.mjs',
  'scripts/phase3/validate-phase3-contracts.mjs',
])
function files(directory, relative = '') { const out=[]; for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const rel=path.join(relative,entry.name);if([...excluded].some((item)=>rel===item||rel.startsWith(`${item}${path.sep}`)))continue;const full=path.join(directory,entry.name);if(entry.isDirectory())out.push(...files(full,rel));else if(/\.(js|mjs|cjs|json|ya?ml)$/.test(entry.name))out.push(full)}return out }
const violations=[]
for(const file of files(root)) { const relative=path.relative(root,file);if(legacyEvidenceFiles.has(relative))continue;const text=fs.readFileSync(file,'utf8'); for(const term of forbidden) if(text.includes(term)) violations.push(`${relative}:${term}`) }
scope.assertScopeTemplateContracts()
const assignmentMigration=fs.readFileSync(path.join(root,'backend/db/migrations/0026_data_scope_assignment_governance.sql'),'utf8')
for(const column of ['strategy_id','target','provenance','snapshot_version']) if(!assignmentMigration.includes(column)) violations.push(`assignment migration missing:${column}`)
if(violations.length) throw new Error(`obsolete Data Scope vocabulary:\n${violations.join('\n')}`)
const artifact={schemaVersion:'2026-07-civitas-data-scope-contract-artifact-v2',...scope.SCOPE_REGISTRY_COMPATIBILITY}
const target=path.join(root,'dist/data-scope.contract.json');const serialized=`${JSON.stringify(artifact,null,2)}\n`
if(process.argv.includes('--check')) { if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==serialized) throw new Error('data-scope contract artifact drift'); console.log('Data Scope v2 contract checked.') }
else { fs.writeFileSync(target,serialized); console.log(`generated ${path.relative(root,target)}`) }
