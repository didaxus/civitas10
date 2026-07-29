const test = require('node:test');
const assert = require('node:assert/strict');
const { createTaxonomyValue, publishTaxonomy, createUnit, activateUnit, createDataScope, buildStructureGovernanceSlice } = require('../services/governanceStructureReadModel');

test('taxonomy, units and data scopes render real backend data with stable IDs', async () => {
  const organizationId = 'org-structure-1';
  const actorLogtoUserId = 'admin-1';
  const value = await createTaxonomyValue({ organizationId, actorLogtoUserId, body: { dimensionKey: 'academic.stage', stableKey: 'primary', displayName: 'Primary' } });
  await publishTaxonomy({ organizationId, actorLogtoUserId, body: {} });
  const unit = await createUnit({ organizationId, actorLogtoUserId, body: { hierarchyKey: 'academic_structure', unitType: 'academic_division', stableKey: 'primary-a', displayName: 'Primary A' } });
  await activateUnit({ organizationId, actorLogtoUserId, unitId: unit.id });
  const scope = await createDataScope({ organizationId, actorLogtoUserId, body: { userId: 'user-teacher', logtoRoleId: 'role-teacher', capability: 'lms', scopeKind: 'dimension', dimensionKey: 'academic.stage', dimensionValueId: value.id, reason: 'teacher_primary' } });
  const slice = await buildStructureGovernanceSlice(organizationId);

  assert.equal(slice.taxonomy.items[0].id, value.id);
  assert.equal(slice.taxonomy.items[0].assignable, true);
  assert.equal(slice.units.items[0].id, unit.id);
  assert.equal(slice.dataScopes.items[0].id, scope.assignment.id);
  assert.equal(slice.dataScopes.items[0].effective, true);
  assert.equal(JSON.stringify(slice).includes('Primary'), true);
});

test('data-scope assignments fail closed when no exact target is supplied', async () => {
  await assert.rejects(() => createDataScope({ organizationId: 'org-structure-2', actorLogtoUserId: 'admin-1', body: { userId: 'user-1', logtoRoleId: 'role-1', capability: 'lms', scopeKind: 'dimension', dimensionKey: 'academic.stage' } }), /data_scope_exactly_one_target_required/);
});

test('archived or unpublished taxonomy values cannot receive new assignments', async () => {
  const organizationId = 'org-structure-3';
  const actorLogtoUserId = 'admin-1';
  const value = await createTaxonomyValue({ organizationId, actorLogtoUserId, body: { dimensionKey: 'academic.stage', stableKey: 'draft-only', displayName: 'Draft Only' } });
  await assert.rejects(() => createDataScope({ organizationId, actorLogtoUserId, body: { userId: 'user-1', logtoRoleId: 'role-1', capability: 'lms', scopeKind: 'dimension', dimensionKey: 'academic.stage', dimensionValueId: value.id } }), /data_scope_dimension_value_not_active|taxonomy_value_not_published|value_not_published/i);
});
