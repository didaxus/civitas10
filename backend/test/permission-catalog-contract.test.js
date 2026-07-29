'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')
const generated = require('../../core/authz/catalog/generated/permission-catalog')
const { rolePermissionAssignments } = require('../../core/authz')

const namespaces = ['owner','org','lms','planning','crm','marketing','community','payments','hr','scheduling','support','analytics','reports','platform']
const roles = ['organization_admin','organization_director','organization_headdirector','organization_headteacher','organization_groupleader','organization_teacher','organization_student','organization_parent','organization_secretary','organization_accountant','organization_billing','organization_payroll','organization_member']
const providerPattern = /(?:moodle|matomo|mautic)/i

test('canonical permission catalog freezes Phase 3 cardinality and active-only selector', () => {
  assert.equal(generated.permissions.length, 167)
  assert.equal(generated.catalog.legacyDecisions.length, 10)
  assert.deepEqual(generated.catalog.phase3Namespaces, namespaces)
  assert.deepEqual(generated.catalog.organizationRoles, roles)
  assert.deepEqual(generated.activePermissions.map((permission) => permission.name).sort(), ['lms.course_offerings.read','lms.group_members.read','lms.groups.read','org.documents.create','org.documents.read'])
  assert.equal(generated.activePermissions.some((permission) => permission.namespace === 'planning'), false)
})

test('catalog IDs, lifecycle and activation evidence are enforced in generated metadata', () => {
  const seen = new Set()
  for (const permission of generated.permissions) {
    assert.match(permission.name, /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)?$/)
    assert.equal(permission.name.includes('*'), false)
    assert.equal(permission.name.includes(':'), false)
    assert.equal(providerPattern.test(permission.name), false)
    assert.equal(seen.has(permission.name), false, permission.name)
    seen.add(permission.name)
    assert.equal(permission.name.startsWith(`${permission.namespace}.`), true)
    assert.ok(['planned','active','deprecated'].includes(permission.targetStatus), permission.name)
    if (permission.namespace === 'planning') assert.equal(permission.targetStatus, 'planned')
    if (permission.surface === 'owner') assert.equal(permission.namespace, 'owner')
    if (permission.namespace === 'owner') assert.equal(permission.surface, 'owner')
    if (permission.targetStatus === 'deprecated') {
      assert.ok(permission.replacement)
      assert.notEqual(permission.compatibility, 'none')
      assert.ok(permission.migrationWindow)
      assert.ok(permission.rollbackId)
    }
    if (permission.targetStatus === 'active') {
      assert.equal(permission.observedImplementation, 'active')
      assert.ok(permission.consumers.length)
      assert.ok(permission.policyRequirements.length)
      assert.ok(permission.runtimePath)
      assert.ok(permission.testEvidence.length)
    }
  }
  for (const permission of generated.activePermissions) assert.equal(permission.targetStatus, 'active')
})

test('legacy decisions are explicit and ambiguous observed IDs remain blocked or not incorporated', () => {
  for (const decision of generated.catalog.legacyDecisions) {
    for (const key of ['legacyId','decision','owner','surface','targetStatus','compatibilityWindow','rollbackId','consumerEvidence','reason']) assert.ok(key in decision, `${decision.legacyId}:${key}`)
    assert.ok(decision.consumerEvidence.length)
    if (decision.decision === 'blocked') assert.ok(decision.blocker)
  }
  const observed = new Map(generated.catalog.legacyBaselineObserved.map((decision) => [decision.legacyId, decision]))
  assert.equal(observed.size, 13)
  assert.equal(observed.get('owner.read').canonicalName, 'owner.profile.read')
  assert.equal(observed.get('owner.write').canonicalName, 'owner.runtime.operations.execute')
  assert.equal(observed.get('owner.system.read').canonicalName, 'owner.runtime.read')
  assert.equal(observed.get('account.profile.read').classification, 'not-incorporated')
  assert.equal(observed.get('governance.owner.read').classification, 'blocked')
  assert.equal(observed.get('governance.tenant.read').classification, 'blocked')
  assert.equal(observed.get('governance.preview.read').classification, 'blocked')
})

test('generated artifacts are versioned with generated metadata and matching hashes', () => {
  const artifactPaths = ['artifacts/authorization/permission-catalog.json','artifacts/authorization/active-permissions.json','artifacts/authorization/ci-inventory.json','core/authz/catalog/generated/permission-catalog.js']
  for (const artifactPath of artifactPaths) {
    assert.equal(fs.existsSync(artifactPath), true, `${artifactPath} must be committed and present for --check drift detection`)
    const body = fs.readFileSync(artifactPath, 'utf8')
    assert.match(body, /GENERATED — DO NOT EDIT/)
    assert.match(body, new RegExp(generated.catalogHash))
  }
  const authored = JSON.parse(fs.readFileSync('artifacts/authorization/permission-catalog.json', 'utf8'))
  const active = JSON.parse(fs.readFileSync('artifacts/authorization/active-permissions.json', 'utf8'))
  const ci = JSON.parse(fs.readFileSync('artifacts/authorization/ci-inventory.json', 'utf8'))
  assert.equal(authored._generated.catalogHash, generated.catalogHash)
  assert.equal(authored.catalog.catalogHash, generated.catalogHash)
  assert.equal(active.catalogHash, generated.catalogHash)
  assert.equal(ci.catalogHash, generated.catalogHash)
})

test('generation is deterministic and --check fails closed without writing missing or drifted outputs', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'civitas-authz-catalog-'))
  const env = { ...process.env, CIVITAS_AUTHZ_OUTPUT_ROOT: temp }
  const missing = spawnSync(process.execPath, ['scripts/authorization/generate-permission-catalog.mjs', '--check'], { encoding: 'utf8', env })
  assert.notEqual(missing.status, 0)
  assert.match(missing.stderr, /missing generated artifact/)
  assert.equal(fs.existsSync(path.join(temp, 'artifacts/authorization/permission-catalog.json')), false)
  execFileSync(process.execPath, ['scripts/authorization/generate-permission-catalog.mjs'], { env, stdio: 'pipe' })
  const snapshot = new Map(['core/authz/catalog/generated/permission-catalog.js','artifacts/authorization/permission-catalog.json','artifacts/authorization/active-permissions.json','artifacts/authorization/ci-inventory.json'].map((file) => [file, fs.readFileSync(path.join(temp, file), 'utf8')]))
  execFileSync(process.execPath, ['scripts/authorization/generate-permission-catalog.mjs'], { env, stdio: 'pipe' })
  for (const [file, body] of snapshot) assert.equal(fs.readFileSync(path.join(temp, file), 'utf8'), body, `${file} deterministic bytes`)
  fs.appendFileSync(path.join(temp, 'artifacts/authorization/permission-catalog.json'), ' ')
  const drifted = spawnSync(process.execPath, ['scripts/authorization/generate-permission-catalog.mjs', '--check'], { encoding: 'utf8', env })
  assert.notEqual(drifted.status, 0)
  assert.match(drifted.stderr, /generated artifact differs/)
})

test('organization role assignments never contain owner permissions', () => {
  for (const [role, permissions] of Object.entries(rolePermissionAssignments)) {
    if (!role.startsWith('organization_')) continue
    for (const permission of permissions) assert.equal(permission.startsWith('owner.'), false, `${role}:${permission}`)
  }
})
