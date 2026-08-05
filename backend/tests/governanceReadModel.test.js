const test = require('node:test');
const assert = require('node:assert/strict');
const { buildGovernanceReadModel, assertTenantRouteMatchesContext, GOVERNANCE_READ_MODEL_CONTRACT_VERSION } = require('../services/governanceReadModel');

test('governance read model exposes versioned aggregate without PII graphs', async () => {
  const roles = [{ id: 'role-admin', name: 'organization_admin' }];
  const members = [{ id: 'user-1', primaryEmail: 'secret@example.test', name: 'Secret Person' }];
  const memberRolesByUserId = new Map([['user-1', roles]]);
  const response = await buildGovernanceReadModel({ organizationId: 'org-1', organization: { id: 'org-1', name: 'Colegio Uno' }, surface: 'owner', roles, members, memberRolesByUserId });

  assert.equal(response.contractVersion, GOVERNANCE_READ_MODEL_CONTRACT_VERSION);
  assert.equal(response.surface, 'owner');
  assert.equal(response.runtimeStatus, 'current');
  assert.equal(response.modules.permissions.status, 'active');
  assert.equal(response.modules.taxonomy.status, 'active');
  assert.equal(response.modules['access-preview'].status, 'active');
  assert.equal(response.roles[0].canonicalKey, 'organization_admin');
  assert.equal(response.roles[0].assignedMemberCount, 1);
  assert.equal(response.members[0].display.startsWith('sub_'), true);
  assert.equal(JSON.stringify(response).includes('secret@example.test'), false);
  assert.ok(response.operationRegistry.operations.filter((entry) => entry.status === 'active').length >= 13);
  assert.ok(response.moduleInventory.some((entry) => entry.module === 'taxonomy' && entry.status === 'active'));
  assert.equal(Array.isArray(response.permissionMatrix), true);
  assert.equal(Object.hasOwn(response, 'assignmentGraph'), false);
  assert.equal(Object.hasOwn(response, 'rawToken'), false);
});


test('owner governance matrix exposes canonical target role potential separately from executable scopes', async () => {
  const roles = [
    { id: 'role-teacher-id', name: 'organization_teacher' },
    { id: 'role-accountant-id', name: 'organization_accountant' },
  ];
  const response = await buildGovernanceReadModel({ organizationId: 'org-role-potential', organization: { id: 'org-role-potential', name: 'Colegio Potential' }, surface: 'owner', roles, members: [], memberRolesByUserId: new Map() });
  const teacherRows = response.permissionMatrix.filter((row) => row.roleId === 'role-teacher-id');
  const accountantRows = response.permissionMatrix.filter((row) => row.roleId === 'role-accountant-id');

  assert.equal(teacherRows.length, 45);
  assert.equal(accountantRows.length, 17);
  assert.ok(teacherRows.some((row) => row.permissionId.startsWith('lms.')));
  assert.ok(teacherRows.some((row) => row.permissionId.startsWith('planning.')));
  assert.ok(accountantRows.some((row) => row.permissionId.startsWith('reports.')));
  assert.equal(teacherRows.some((row) => row.permissionId.startsWith('owner.')), false);
  assert.equal(teacherRows.every((row) => row.rolePotential === true), true);
  assert.ok(teacherRows.some((row) => row.catalogLifecycle === 'planned' && row.executable === false && row.controlState === 'not_executable'));
  assert.ok(teacherRows.some((row) => row.catalogLifecycle === 'active' && row.executable === true && row.controlState === 'editable'));
});

test('tenant governance route must match verified organization context', () => {
  assert.doesNotThrow(() => assertTenantRouteMatchesContext({ params: { ['organization' + 'Id']: 'org-1' }, user: { organization_id: 'org-1' } }));
  assert.throws(() => assertTenantRouteMatchesContext({ params: { ['organization' + 'Id']: 'org-1' }, user: { organization_id: 'org-2' } }), /Tenant governance route organization/);
});


test('governance role names use the complete organization role catalog and alias left join diagnostics', async () => {
  const roles = [
    { id: 'role-admin-id', name: 'organization_admin' },
    { id: 'role-teacher-id', name: 'organization_teacher' },
    { id: 'role-empty-id', name: 'organization_empty' },
    { id: 'owner-global-id', name: 'owner_global' },
  ];
  const response = await buildGovernanceReadModel({ organizationId: 'org-roles-all', organization: { id: 'org-roles-all', name: 'Colegio Roles' }, surface: 'owner', roles, members: [], memberRolesByUserId: new Map() });

  assert.deepEqual(response.roles.map((role) => role.id), ['role-admin-id', 'role-teacher-id', 'role-empty-id']);
  assert.equal(response.roles.find((role) => role.id === 'role-empty-id').assignedMemberCount, 0);
  assert.equal(response.roles.find((role) => role.id === 'role-teacher-id').displayName, 'Organization Teacher');
  assert.equal(response.roles.some((role) => role.canonicalKey === 'owner_global'), false);
  assert.ok(response.diagnostics.some((item) => item.code === 'role_alias_orphaned'));
});

test('stale governance runtime is distinct from unavailable modules', async () => {
  const response = await buildGovernanceReadModel({ organizationId: 'org-1', surface: 'tenant', stale: true });

  assert.equal(response.runtimeStatus, 'stale');
  assert.equal(response.modules.permissions.status, 'stale');
  assert.equal(response.modules['access-preview'].status, 'stale');
  assert.ok(response.diagnostics.some((item) => item.code === 'authorization_snapshot_stale'));
});


test('malformed governance surface fails closed before building a response', async () => {
  await assert.rejects(() => buildGovernanceReadModel({ organizationId: 'org-1', surface: 'unknown' }), /Invalid governance surface/);
});


test('owner ceiling and tenant activation mutations enforce exact permissions and ceiling order', async () => {
  const { updateOwnerCeilings, updateTenantActivations, roleMapFromRoles } = require('../services/governanceRolesReadModel');
  const roles = [{ id: 'role-admin', name: 'organization_admin' }];
  const roleIdToName = roleMapFromRoles(roles);
  await assert.rejects(() => updateOwnerCeilings({ organizationId: 'org-1', actorLogtoUserId: 'owner-1', roleIdToName, changes: [{ logtoRoleId: 'role-admin', permission: 'domain.*', allowed: true }] }), /permission_inactive|permission_not_allowed/);
  await assert.rejects(() => updateTenantActivations({ organizationId: 'org-1', actorLogtoUserId: 'admin-1', roleIdToName, changes: [{ logtoRoleId: 'role-admin', permission: 'org.documents.read', enabled: true }] }), /tenant_activation_exceeds_owner_ceiling/);
  const ceiling = await updateOwnerCeilings({ organizationId: 'org-1', actorLogtoUserId: 'owner-1', roleIdToName, changes: [{ logtoRoleId: 'role-admin', permission: 'org.documents.read', allowed: true }] });
  const activation = await updateTenantActivations({ organizationId: 'org-1', actorLogtoUserId: 'admin-1', roleIdToName, expectedPolicyVersion: ceiling.policyVersion, changes: [{ logtoRoleId: 'role-admin', permission: 'org.documents.read', enabled: true }] });
  assert.equal(activation.activations[0].enabled, true);
  assert.ok(activation.policyVersion > ceiling.policyVersion);
});
