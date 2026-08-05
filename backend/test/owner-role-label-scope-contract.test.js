const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { CivitasSharedContract } = require('../../core/shared/civitas-shared.contract.cjs');
const { OWNER_PERMISSIONS } = require('../../core/authz/runtime/active-permissions');
const globalRolePermissions = require('../../core/authz/roles/global-role-permissions');
const roleModel = require('../../core/authz/roles/generated/role-model');
const { permissionsByName } = require('../../core/authz');

const root = join(__dirname, '../..');
const backendSource = readFileSync(join(root, 'backend/index.js'), 'utf8');
const ownerScopesSource = readFileSync(join(root, 'frontend/src/authz/ownerScopes.ts'), 'utf8');
const logtoConfigSource = readFileSync(join(root, 'frontend/src/auth/logtoConfig.ts'), 'utf8');

test('owner.role_labels.manage is active, global, and exposed through runtime and shared contracts', () => {
  assert.equal(permissionsByName['owner.role_labels.manage'].status, 'active');
  assert.equal(permissionsByName['owner.role_labels.manage'].surface, 'global');
  assert.equal(OWNER_PERMISSIONS.roleLabelsManage, 'owner.role_labels.manage');
  assert.equal(CivitasSharedContract.auth.global.permissions.ownerRoleLabelsManage, OWNER_PERMISSIONS.roleLabelsManage);
});

test('owner shell scopes request owner.role_labels.manage through the shared contract', () => {
  assert.match(ownerScopesSource, /roleLabelsManage: civitasConfig\.auth\.global\.permissions\.ownerRoleLabelsManage/);
  assert.match(ownerScopesSource, /OWNER_SCOPES\.roleLabelsManage/);
  assert.match(logtoConfigSource, /scopes: \[\.\.\.LOGTO_OWNER_SHELL_SCOPES\]/);
  assert.match(logtoConfigSource, /resources: \[APP_ENV\.api\.resource\]/);
});

test('owner role-label endpoint uses canonical owner permission constant and preserves owner_global guard', () => {
  assert.match(backendSource, /secureRoute\.put\("\/owner\/governance\/role-labels\/:canonicalRoleKey", "ownerSensitiveWrite", requireGlobalAccess\(\{ resource: API_RESOURCE, requiredScopes: \[OWNER_AUTHZ\.ownerRoleLabelsManage\] \}\), requireGlobalOwner/);
  const endpoint = backendSource.slice(backendSource.indexOf('/owner/governance/role-labels/:canonicalRoleKey'), backendSource.indexOf('/owner/organizations/:organizationId/governance/entitlement-ceilings'));
  assert.doesNotMatch(endpoint, /"owner\.role_labels\.manage"/);
});

test('canonical role assignments keep owner and organization role-label permissions separate', () => {
  assert.ok(globalRolePermissions.owner_global.includes('owner.role_labels.manage'));
  assert.equal(globalRolePermissions.owner_global.includes('org.role_aliases.manage'), false);
  for (const role of roleModel.roles.filter((entry) => entry.roleKey.startsWith('organization_'))) {
    assert.equal((role.potentialPermissionIds || []).includes('owner.role_labels.manage'), false, `${role.roleKey} must not receive owner.role_labels.manage`);
  }
  const organizationAdmin = roleModel.roles.find((role) => role.roleKey === 'organization_admin');
  assert.ok((organizationAdmin.activeExecutableScopeIds || []).includes('org.role_aliases.manage'));
});
