'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { getAuthorizationManifest } = require('..')
const { validateAuthorizationContract } = require('../validation/validate-authz-contract')
const { API_RESOURCE, GLOBAL_ROLES, ORGANIZATION_ROLES } = require('../constants')

const clone = (v) => JSON.parse(JSON.stringify(v))
const validate = (m) => validateAuthorizationContract(m).errors.join('\n')

test('canonical authz manifest is valid and deterministic for #87', () => {
  const first = getAuthorizationManifest()
  const second = getAuthorizationManifest()
  assert.deepEqual(first, second)
  assert.equal(first.contractVersion, '2026-07-civitas-authz-contract-v1')
  assert.equal(first.resource, API_RESOURCE)
  assert.ok(first.permissions.length > 0)
  assert.deepEqual(first.globalRoles, GLOBAL_ROLES)
  assert.deepEqual(first.organizationRoles, ORGANIZATION_ROLES)
  assert.equal(validateAuthorizationContract(first).valid, true, validate(getAuthorizationManifest()))
})

test('catalog statuses, resource, modular domains, and naming are enforceable', () => {
  const manifest = getAuthorizationManifest()
  assert.ok(manifest.permissions.every((p) => p.resource === API_RESOURCE))
  assert.ok(manifest.permissions.some((p) => p.status === 'planned'))
  assert.ok(manifest.permissions.every((p) => !p.name.includes('*')))
  assert.ok(manifest.permissions.every((p) => !p.name.startsWith('organization.')))
  const domains = new Set(manifest.permissions.map((p) => p.domain))
  for (const domain of ['owner','org','lms','planning','crm','marketing','community','payments','hr','scheduling','support','analytics','reports','platform']) assert.ok(domains.has(domain), domain)
})

test('role matrix separates global and organization roles and only assigns executable or provisionable permissions', () => {
  const manifest = getAuthorizationManifest()
  const byName = new Map(manifest.permissions.map((p) => [p.name, p]))
  for (const [role, permissions] of Object.entries(manifest.rolePermissionAssignments)) {
    for (const permission of permissions) {
      const definition = byName.get(permission)
      assert.equal(Boolean(definition && (definition.status === 'active' || definition.identityProvisioning === 'provisionable')), true, `role ${role} references a non-provisionable or missing permission ${permission}`)
      if (role === 'owner_global') assert.match(permission, /^owner\./)
      if (role.startsWith('organization_')) assert.ok(!permission.startsWith('owner.'))
    }
  }
})

test('deprecated permissions require replacement in validator fixtures', () => {
  const m = clone(getAuthorizationManifest())
  m.permissions.push({ name: 'org.old_permission.read', description: 'old', domain: 'org', surface: 'organization', status: 'deprecated', resource: API_RESOURCE, consumers: [], policyRequirements: [], overlayMode: 'restrictable' })
  assert.match(validate(m), /deprecated permission missing replacement/)
  m.permissions[m.permissions.length - 1].replacement = 'org.documents.read'
  assert.doesNotMatch(validate(m), /deprecated permission missing replacement/)
})

test('negative fixtures required by #74 are rejected', () => {
  const cases = [
    ['owner_global with org.audit.logs.read', (m) => { m.permissions.push(active('org.audit.logs.read','org')); m.rolePermissionAssignments.owner_global.push('org.audit.logs.read') }, /owner_global cannot receive non-owner permission/],
    ['owner_global with analytics.reports.read', (m) => { m.permissions.push(active('analytics.reports.read','analytics')); m.rolePermissionAssignments.owner_global.push('analytics.reports.read') }, /owner_global cannot receive non-owner permission/],
    ['organization_admin with owner.platform.settings.write', (m) => { m.permissions.push(active('owner.platform.settings.write','owner','global')); m.rolePermissionAssignments.organization_admin.push('owner.platform.settings.write') }, /organization role cannot receive owner permission/],
    ['organization_admin with org.impersonate', (m) => { m.permissions.push(active('org.impersonate','org')); m.rolePermissionAssignments.organization_admin.push('org.impersonate') }, /forbidden permission/],
    ['organization_accountant with billing.seats.request_modify', (m) => { m.permissions.push(active('billing.seats.request_modify','billing')); m.rolePermissionAssignments.organization_accountant.push('billing.seats.request_modify') }, /forbidden permission/],
    ['any role with lms.*', (m) => { m.rolePermissionAssignments.organization_admin.push('lms.*') }, /wildcard/],
    ['non-provisionable planned permission assigned', (m) => { m.permissions.push({ name: 'org.future.read', description: 'future', domain: 'org', surface: 'organization', status: 'planned', resource: API_RESOURCE, consumers: [], policyRequirements: [], overlayMode: 'restrictable' }); m.rolePermissionAssignments.organization_admin.push('org.future.read') }, /non-provisionable planned permission/],
    ['active without consumer', (m) => { m.permissions.push({ ...active('org.orphan.execute','org'), consumers: [] }) }, /active permission without consumer/],
    ['organization.members.write as new permission', (m) => { m.permissions.push(active('organization.members.write','org')) }, /deprecated organization prefix/],
    ['legacy owner:write outside transition allowlist', (m) => { m.permissions.push(active('owner:write','owner','global')); }, /invalid permission name|legacy scope outside allowlist/],
  ]
  for (const [name, mutate, pattern] of cases) {
    const m = clone(getAuthorizationManifest())
    mutate(m)
    assert.match(validate(m), pattern, name)
  }
})

function active(name, domain, surface = 'organization') { return { name, description: name, domain, surface, status: 'active', resource: API_RESOURCE, consumers: ['fixture'], policyRequirements: [], overlayMode: surface === 'organization' ? 'restrictable' : 'not-applicable' } }

test('organization_groupleader is canonical read-only and cannot receive owner or unknown permissions', () => {
  const manifest = getAuthorizationManifest();
  assert.ok(manifest.organizationRoles.includes('organization_groupleader'));
  assert.ok(manifest.rolePermissionAssignments.organization_groupleader.includes('lms.groups.read'));
  assert.ok(manifest.rolePermissionAssignments.organization_groupleader.includes('org.documents.read'));
  const ownerMutation = clone(manifest);
  ownerMutation.rolePermissionAssignments.organization_groupleader.push('owner.profile.read');
  assert.match(validate(ownerMutation), /organization role cannot receive owner permission/);
  const unknownMutation = clone(manifest);
  unknownMutation.rolePermissionAssignments.organization_groupleader.push('lms.grades.update');
  assert.match(validate(unknownMutation), /missing permission|non-active or missing permission|invalid role permission reference|unknown permission/);
});
