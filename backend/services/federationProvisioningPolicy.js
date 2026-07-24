const FEDERATION_ASSIGNMENT_PROVENANCE = Object.freeze({
  MANUAL: 'manual',
  FEDERATED_JIT: 'federated_jit',
  FEDERATED_LOGIN_RECONCILIATION: 'federated_login_reconciliation',
  DIRECTORY_SYNC_SCIM: 'directory_sync_scim',
  PROVIDER_API_SYNC: 'provider_api_sync',
  LEGACY_SIMPLE_ONBOARDING: 'legacy_simple_onboarding',
});

const FEDERATION_PROVISIONING_POLICY_DEFAULTS = Object.freeze({
  joinMode: 'explicit_mapping',
  fallback: 'pending_mapping',
  roleSync: 'mapped_claims_only',
  scopeSync: 'mapped_groups_only',
  removeAbsentAssignments: false,
  suspendOnDirectoryDisable: false,
  loginTimeReconciliation: 'additive_when_groups_complete',
  scheduledReconciliation: 'authoritative_when_snapshot_complete',
});

const MIXED_CONNECTOR_FALLBACKS = Object.freeze(['', 'organization_member', 'pending_mapping']);
const ASSIGNMENT_PROVENANCE_BY_SOURCE = Object.freeze({
  login: [FEDERATION_ASSIGNMENT_PROVENANCE.FEDERATED_JIT, FEDERATION_ASSIGNMENT_PROVENANCE.FEDERATED_LOGIN_RECONCILIATION],
  scim: [FEDERATION_ASSIGNMENT_PROVENANCE.DIRECTORY_SYNC_SCIM],
  provider_api: [FEDERATION_ASSIGNMENT_PROVENANCE.PROVIDER_API_SYNC],
  manual: [FEDERATION_ASSIGNMENT_PROVENANCE.MANUAL],
});

function normalizeFederationProvisioningPolicy(input = {}) {
  const policy = { ...FEDERATION_PROVISIONING_POLICY_DEFAULTS, ...(input && typeof input === 'object' ? input : {}) };
  return {
    ...policy,
    fallback: policy.fallback === null || policy.fallback === undefined ? '' : String(policy.fallback),
    removeAbsentAssignments: Boolean(policy.removeAbsentAssignments),
    suspendOnDirectoryDisable: Boolean(policy.suspendOnDirectoryDisable),
  };
}

function validateIdentityWizardConnectorPolicy({ connectorMode, fallback } = {}) {
  const normalizedFallback = fallback === null || fallback === undefined ? '' : String(fallback);
  if (connectorMode === 'mixed' && !MIXED_CONNECTOR_FALLBACKS.includes(normalizedFallback)) {
    const error = new Error('Mixed identity connectors may only use empty, organization_member or pending_mapping fallback.');
    error.code = 'mixed_connector_fallback_forbidden';
    error.allowedFallbacks = [...MIXED_CONNECTOR_FALLBACKS];
    throw error;
  }
  return { connectorMode, fallback: normalizedFallback };
}

function normalizeGroupSnapshot(snapshot = {}) {
  const groups = snapshot && typeof snapshot === 'object' ? snapshot.groups : undefined;
  if (!Array.isArray(groups)) return { complete: false, groups: [], reason: 'groups_absent_or_incomplete' };
  if (snapshot.complete === false || snapshot.groupsComplete === false) return { complete: false, groups, reason: 'groups_marked_incomplete' };
  return { complete: true, groups: Array.from(new Set(groups.map(String).filter(Boolean))), reason: null };
}

function planAssignmentReconciliation({ existingAssignments = [], desiredAssignments = [], source, groupSnapshot, policy = {} } = {}) {
  const normalizedPolicy = normalizeFederationProvisioningPolicy(policy);
  const snapshot = normalizeGroupSnapshot(groupSnapshot);
  const managedProvenance = new Set(ASSIGNMENT_PROVENANCE_BY_SOURCE[source] || []);
  const desiredKeys = new Set(desiredAssignments.map((assignment) => assignment.key).filter(Boolean));
  const toCreate = desiredAssignments.map((assignment) => ({ ...assignment, provenance: assignment.provenance || [...managedProvenance][0] || source }));
  const canRemove = normalizedPolicy.removeAbsentAssignments && snapshot.complete;
  const toRemove = canRemove
    ? existingAssignments.filter((assignment) => managedProvenance.has(assignment.provenance) && !desiredKeys.has(assignment.key))
    : [];
  return { snapshot, toCreate, toRemove, blockedMassRevocation: normalizedPolicy.removeAbsentAssignments && !snapshot.complete };
}

module.exports = {
  FEDERATION_ASSIGNMENT_PROVENANCE,
  FEDERATION_PROVISIONING_POLICY_DEFAULTS,
  MIXED_CONNECTOR_FALLBACKS,
  normalizeFederationProvisioningPolicy,
  validateIdentityWizardConnectorPolicy,
  planAssignmentReconciliation,
};
