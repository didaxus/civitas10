'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')
const roleModel = require('../../core/authz/roles/generated/role-model')
const catalog = require('../../core/authz/catalog/generated/permission-catalog')
const { rolePermissionAssignments } = require('../../core/authz')

const authoredRoleModel = require('../../contracts/authorization/civitas-role-bundles.json')
const expectedCounts = Object.freeze(Object.fromEntries(Object.entries(authoredRoleModel.roles).map(([roleKey, role]) => [roleKey, role.expectedPotentialCount])))
const activeOrganizationPermissions = new Set(catalog.activePermissions.filter((permission) => permission.surface === 'organization').map((permission) => permission.name))
const allCatalogPermissions = new Set(catalog.permissions.map((permission) => permission.name))

test('13 canonical organization roles expand from bundles to frozen target counts', () => {
  assert.equal(roleModel.roles.length, 13)
  assert.equal(roleModel.bundles.length, 49)
  for (const role of roleModel.roles) {
    assert.equal(role.surface, 'organization')
    assert.equal(role.potentialPermissionIds.length, expectedCounts[role.roleKey], role.roleKey)
    assert.equal(new Set(role.potentialPermissionIds).size, role.potentialPermissionIds.length, `${role.roleKey} duplicates`)
    assert.ok(role.bundleKeys.length)
    for (const permission of role.potentialPermissionIds) {
      assert.equal(allCatalogPermissions.has(permission), true, `${role.roleKey}:${permission}`)
      assert.equal(permission.startsWith('owner.'), false, `${role.roleKey}:${permission}`)
      assert.equal(permission.startsWith('account.'), false, `${role.roleKey}:${permission}`)
      assert.equal(permission.includes('*'), false)
      assert.equal(permission.includes(':'), false)
    }
  }
})

test('bundles are composition metadata only and never executable scopes', () => {
  for (const bundle of roleModel.bundles) {
    assert.ok(bundle.key)
    assert.ok(bundle.allowedRoleKeys.length)
    assert.ok(['active','planned','deprecated'].includes(bundle.lifecycle))
    assert.ok(bundle.version)
    assert.equal(activeOrganizationPermissions.has(bundle.key), false)
    for (const permission of bundle.permissionIds) assert.equal(allCatalogPermissions.has(permission), true)
  }
  for (const [roleKey, scopes] of Object.entries(rolePermissionAssignments)) {
    if (!roleKey.startsWith('organization_')) continue
    for (const scope of scopes) assert.equal(roleModel.bundles.some((bundle) => bundle.key === scope), false, `${roleKey}:${scope}`)
  }
})

test('executable and identity-provisioned scopes remain distinct', () => {
  for (const role of roleModel.roles) {
    for (const scope of role.activeExecutableScopeIds) {
      assert.equal(activeOrganizationPermissions.has(scope), true, `${role.roleKey}:${scope}`)
      assert.equal(role.potentialPermissionIds.includes(scope), true, `${role.roleKey}:${scope}`)
    }
    assert.deepEqual(rolePermissionAssignments[role.roleKey], role.provisionableScopeIds)
    assert.deepEqual(role.provisionableScopeIds, role.potentialPermissionIds)
    assert.ok(role.activeExecutableScopeIds.every((scope) => role.provisionableScopeIds.includes(scope)))
  }
})

test('planned and verification-required permissions remain target potential only', () => {
  for (const role of roleModel.roles) {
    const inactivePotential = role.potentialPermissionIds.filter((id) => !activeOrganizationPermissions.has(id))
    assert.ok(inactivePotential.length > 0, `${role.roleKey} exposes planning candidates in target view`)
    for (const id of inactivePotential) assert.equal(role.activeExecutableScopeIds.includes(id), false)
  }
})

test('role model artifacts carry generated metadata and matching hashes', () => {
  for (const artifact of ['core/authz/roles/generated/role-model.js','artifacts/authorization/role-potential.json','artifacts/authorization/active-role-scopes.json','artifacts/authorization/provisionable-role-scopes.json']) {
    assert.equal(fs.existsSync(artifact), true)
    const body = fs.readFileSync(artifact, 'utf8')
    assert.match(body, /GENERATED — DO NOT EDIT/)
    assert.match(body, new RegExp(roleModel.roleModelHash))
  }
  const potential = JSON.parse(fs.readFileSync('artifacts/authorization/role-potential.json', 'utf8'))
  const active = JSON.parse(fs.readFileSync('artifacts/authorization/active-role-scopes.json', 'utf8'))
  const provisionable = JSON.parse(fs.readFileSync('artifacts/authorization/provisionable-role-scopes.json', 'utf8'))
  assert.equal(potential.roleModel.roleModelHash, roleModel.roleModelHash)
  assert.equal(active.roleModelHash, roleModel.roleModelHash)
  assert.equal(active.catalogHash, catalog.catalogHash)
  assert.equal(provisionable.roleModelHash, roleModel.roleModelHash)
  assert.equal(provisionable.catalogHash, catalog.catalogHash)
})

test('role model generation is deterministic and check fails closed', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'civitas-role-model-'))
  const env = { ...process.env, CIVITAS_AUTHZ_OUTPUT_ROOT: temp }
  const missing = spawnSync(process.execPath, ['scripts/authorization/generate-role-model.mjs', '--check'], { encoding: 'utf8', env })
  assert.notEqual(missing.status, 0)
  assert.match(missing.stderr, /missing generated artifact/)
  execFileSync(process.execPath, ['scripts/authorization/generate-role-model.mjs'], { env, stdio: 'pipe' })
  const files = ['core/authz/roles/generated/role-model.js','artifacts/authorization/role-potential.json','artifacts/authorization/active-role-scopes.json','artifacts/authorization/provisionable-role-scopes.json']
  const snapshot = new Map(files.map((file) => [file, fs.readFileSync(path.join(temp, file), 'utf8')]))
  execFileSync(process.execPath, ['scripts/authorization/generate-role-model.mjs'], { env, stdio: 'pipe' })
  for (const [file, body] of snapshot) assert.equal(fs.readFileSync(path.join(temp, file), 'utf8'), body)
  fs.appendFileSync(path.join(temp, 'artifacts/authorization/role-potential.json'), ' ')
  const drifted = spawnSync(process.execPath, ['scripts/authorization/generate-role-model.mjs', '--check'], { encoding: 'utf8', env })
  assert.notEqual(drifted.status, 0)
  assert.match(drifted.stderr, /generated artifact differs/)
})
