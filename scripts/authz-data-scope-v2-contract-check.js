#!/usr/bin/env node
'use strict'
const fs = require('fs')
const path = require('path')
const root = path.resolve(__dirname, '..')
const scope = require('../backend/authorization/data-scope')
const forbidden = ['academic.' + 'grade_level', 'academic.' + 'section', 'course_' + 'scope']
const excluded = new Set(['docs', 'artifacts', '.git', 'node_modules', 'backend/db/migrations'])
function files(directory, relative = '') { const out=[]; for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const rel=path.join(relative,entry.name);if([...excluded].some((item)=>rel===item||rel.startsWith(`${item}${path.sep}`)))continue;const full=path.join(directory,entry.name);if(entry.isDirectory())out.push(...files(full,rel));else if(/\.(js|mjs|cjs|json|ya?ml)$/.test(entry.name))out.push(full)}return out }
const violations=[]
for(const file of files(root)) { const text=fs.readFileSync(file,'utf8'); for(const term of forbidden) if(text.includes(term)) violations.push(`${path.relative(root,file)}:${term}`) }
scope.assertScopeTemplateContracts()
if(violations.length) throw new Error(`obsolete Data Scope vocabulary:\n${violations.join('\n')}`)
const artifact={schemaVersion:'2026-07-civitas-data-scope-contract-artifact-v2',...scope.SCOPE_REGISTRY_COMPATIBILITY}
const target=path.join(root,'dist/data-scope.contract.json');const serialized=`${JSON.stringify(artifact,null,2)}\n`
if(process.argv.includes('--check')) { if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==serialized) throw new Error('data-scope contract artifact drift'); console.log('Data Scope v2 contract checked.') }
else { fs.writeFileSync(target,serialized); console.log(`generated ${path.relative(root,target)}`) }
