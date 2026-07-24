const test = require('node:test');
const assert = require('node:assert/strict');
const {
  FEDERATION_PROVISIONING_POLICY_DEFAULTS,
  validateIdentityWizardConnectorPolicy,
  planAssignmentReconciliation,
} = require('../services/federationProvisioningPolicy');

test('federation provisioning policy is explicit and separate from legacy organization onboarding', () => {
  assert.deepEqual(Object.keys(FEDERATION_PROVISIONING_POLICY_DEFAULTS).sort(), [
    'fallback',
    'joinMode',
    'loginTimeReconciliation',
    'removeAbsentAssignments',
    'roleSync',
    'scheduledReconciliation',
    'scopeSync',
    'suspendOnDirectoryDisable',
  ].sort());
  const legacy = require('../services/organizationProvisioningCore');
  assert.equal(Object.prototype.hasOwnProperty.call(legacy, 'runFederationProvisioning'), false);
});

test('mixed identity connectors forbid organization_student fallback', () => {
  assert.throws(() => validateIdentityWizardConnectorPolicy({ connectorMode: 'mixed', fallback: 'organization_student' }), /Mixed identity connectors/);
  assert.equal(validateIdentityWizardConnectorPolicy({ connectorMode: 'mixed', fallback: '' }).fallback, '');
  assert.equal(validateIdentityWizardConnectorPolicy({ connectorMode: 'mixed', fallback: 'organization_member' }).fallback, 'organization_member');
  assert.equal(validateIdentityWizardConnectorPolicy({ connectorMode: 'mixed', fallback: 'pending_mapping' }).fallback, 'pending_mapping');
});

test('absent or incomplete groups are not interpreted as zero groups and do not revoke assignments', () => {
  const existingAssignments = [
    { key: 'role:teacher', provenance: 'federated_login_reconciliation' },
    { key: 'role:admin', provenance: 'manual' },
  ];
  for (const groupSnapshot of [{}, { groups: ['teachers'], complete: false }]) {
    const plan = planAssignmentReconciliation({
      source: 'login',
      groupSnapshot,
      existingAssignments,
      desiredAssignments: [],
      policy: { removeAbsentAssignments: true },
    });
    assert.equal(plan.snapshot.complete, false);
    assert.equal(plan.blockedMassRevocation, true);
    assert.deepEqual(plan.toRemove, []);
  }
});

test('a federation source only removes assignments with provenance it manages', () => {
  const plan = planAssignmentReconciliation({
    source: 'scim',
    groupSnapshot: { groups: [], complete: true },
    existingAssignments: [
      { key: 'role:teacher', provenance: 'directory_sync_scim' },
      { key: 'role:member', provenance: 'federated_jit' },
      { key: 'role:admin', provenance: 'manual' },
    ],
    desiredAssignments: [],
    policy: { removeAbsentAssignments: true },
  });
  assert.deepEqual(plan.toRemove.map((assignment) => assignment.key), ['role:teacher']);
});
