"use strict";

const FORBIDDEN_DIRECT_ROLE_KEYS = new Set(["organization_admin", "owner_global"]);

function mappingError(code, details = {}) { return Object.assign(new Error(code), { code, details }); }

function createGroupRoleMappingService({ mappings = [], activeVersion } = {}) {
  const byTenantGroup = new Map();
  for (const mapping of mappings) byTenantGroup.set(`${mapping.tenantId}:${mapping.external_group_id}`, mapping);
  return Object.freeze({
    resolveCandidates({ tenantId, externalGroupIds = [], expectedVersion = activeVersion } = {}) {
      const candidates = [];
      const rejected = [];
      for (const external_group_id of externalGroupIds) {
        const mapping = byTenantGroup.get(`${tenantId}:${external_group_id}`);
        if (!mapping) continue;
        if (expectedVersion && mapping.version !== expectedVersion) { rejected.push({ external_group_id, reasonCode: "identity_mapping_version_stale", mappingVersion: mapping.version, expectedVersion }); continue; }
        if (mapping.status && mapping.status !== "active") continue;
        if (FORBIDDEN_DIRECT_ROLE_KEYS.has(mapping.canonical_role_key) || mapping.governanceApproved !== true) { rejected.push({ external_group_id, reasonCode: "external_role_requires_governance", canonical_role_key: mapping.canonical_role_key }); continue; }
        candidates.push({ external_group_id, canonical_role_key: mapping.canonical_role_key, mappingVersion: mapping.version });
      }
      return { candidates, rejected };
    },
    rejectDirectClaimToRole(claim) {
      throw mappingError("external_claim_to_role_conversion_forbidden", { claim: String(claim || "[unknown]") });
    },
  });
}

module.exports = { createGroupRoleMappingService, mappingError };
