"use strict";

function keyOf(organizationId, roleId, permission) { return `${organizationId}::${roleId}::${permission}`; }
function clone(value) { return value ? JSON.parse(JSON.stringify(value)) : value; }
function createInMemoryEntitlementRepository({ policyVersions = {} } = {}) {
  const limits = new Map();
  const activations = new Map();
  const versions = new Map(Object.entries(policyVersions));
  function getPolicyVersion(organizationId) { return Number(versions.get(organizationId) || 1); }
  function setPolicyVersion(organizationId, version) { versions.set(organizationId, Number(version)); return getPolicyVersion(organizationId); }
  function incrementPolicyVersion(organizationId) { return setPolicyVersion(organizationId, getPolicyVersion(organizationId) + 1); }
  return {
    async getPolicyVersion(organizationId) { return getPolicyVersion(organizationId); },
    async setPolicyVersion(organizationId, version) { return setPolicyVersion(organizationId, version); },
    async incrementPolicyVersion(organizationId) { return incrementPolicyVersion(organizationId); },
    async getLimit({ organizationId, logtoRoleId, permission }) { return clone(limits.get(keyOf(organizationId, logtoRoleId, permission))); },
    async getActivation({ organizationId, logtoRoleId, permission }) { return clone(activations.get(keyOf(organizationId, logtoRoleId, permission))); },
    async listLimits({ organizationId }) { return [...limits.values()].filter((row) => row.logtoOrganizationId === organizationId).map(clone); },
    async listActivations({ organizationId }) { return [...activations.values()].filter((row) => row.logtoOrganizationId === organizationId).map(clone); },
    async upsertLimit(row) { const id = row.id || `limit_${keyOf(row.logtoOrganizationId, row.logtoRoleId, row.permissionKey)}`; const saved = { ...row, id, updatedAt: new Date().toISOString(), createdAt: row.createdAt || new Date().toISOString() }; limits.set(keyOf(row.logtoOrganizationId, row.logtoRoleId, row.permissionKey), saved); return clone(saved); },
    async upsertActivation(row) { const id = row.id || `activation_${keyOf(row.logtoOrganizationId, row.logtoRoleId, row.permissionKey)}`; const saved = { ...row, id, updatedAt: new Date().toISOString(), createdAt: row.createdAt || new Date().toISOString() }; activations.set(keyOf(row.logtoOrganizationId, row.logtoRoleId, row.permissionKey), saved); return clone(saved); },
    async disableActivation({ organizationId, logtoRoleId, permission, policyVersion }) { const k = keyOf(organizationId, logtoRoleId, permission); const current = activations.get(k); if (!current) return null; const saved = { ...current, enabled: false, policyVersion, updatedAt: new Date().toISOString() }; activations.set(k, saved); return clone(saved); },
    async transaction(fn) { return fn(this); },
  };
}
module.exports = { createInMemoryEntitlementRepository, keyOf };
