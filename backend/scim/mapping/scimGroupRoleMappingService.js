"use strict";

const { rolePermissionAssignments } = require("../../../core/authz");

const SOURCE_KIND = "directory_sync_scim";
const OWNER_GLOBAL = "owner_global";
const DEFAULT_PRIVILEGED_ROLE_KEYS = new Set(["organization_admin"]);

function mappingError(code, details = {}) {
  return Object.assign(new Error(code), { code, details });
}

function normalizeMapping(input = {}) {
  return {
    id: input.id || input.mapping_id || null,
    connection_id: input.connection_id || input.connectionId,
    external_group_id: input.external_group_id || input.externalGroupId,
    mapping_version: input.mapping_version || input.mappingVersion || input.version,
    canonical_role_key: input.canonical_role_key || input.canonicalRoleKey,
    status: input.status || "draft",
    approval_status: input.approval_status || input.approvalStatus,
    approval_id: input.approval_id || input.approvalId || null,
    approved_by: input.approved_by || input.approvedBy || null,
    approved_at: input.approved_at || input.approvedAt || null,
    governanceApproved: input.governanceApproved,
    derived_from_display_name: input.derived_from_display_name || input.derivedFromDisplayName || false,
    source_kind: input.source_kind || input.sourceKind || SOURCE_KIND,
    source_attribute: input.source_attribute || input.sourceAttribute || "external_group_id",
    display_name: input.display_name || input.displayName || input.external_group_display_name || input.externalGroupDisplayName || null,
  };
}

function isApproved(mapping) {
  return mapping.approval_status === "approved" || mapping.governanceApproved === true || Boolean(mapping.approval_id || mapping.approved_by);
}

function activeRoleSet(activeRoles) {
  return new Set(activeRoles || Object.keys(rolePermissionAssignments));
}

function rejectReasonForMapping(mapping, options = {}) {
  if (mapping.source_kind !== SOURCE_KIND) return "scim_mapping_source_kind_invalid";
  if (!mapping.connection_id) return "scim_mapping_connection_missing";
  if (!mapping.external_group_id) return "scim_mapping_external_group_id_missing";
  if (!mapping.mapping_version) return "scim_mapping_version_missing";
  if (!mapping.canonical_role_key) return "scim_mapping_canonical_role_missing";
  if (mapping.canonical_role_key === OWNER_GLOBAL) return "scim_owner_global_forbidden";
  if (mapping.source_attribute === "displayName" || mapping.source_attribute === "display_name" || mapping.derived_from_display_name === true) return "scim_display_name_mapping_forbidden";
  if (mapping.status !== "active") return "scim_mapping_inactive";
  if (!activeRoleSet(options.activeRoleKeys).has(mapping.canonical_role_key)) return "scim_mapping_role_inactive";
  if (options.ownerCeilings && options.ownerCeilings[mapping.canonical_role_key] !== true) return "scim_mapping_above_owner_ceiling";
  if (options.tenantActivations && options.tenantActivations[mapping.canonical_role_key] !== true) return "scim_mapping_tenant_activation_missing";
  const privileged = options.privilegedRoleKeys || DEFAULT_PRIVILEGED_ROLE_KEYS;
  if (privileged.has(mapping.canonical_role_key) && !isApproved(mapping)) return "scim_privileged_mapping_approval_missing";
  if (!isApproved(mapping)) return "scim_mapping_approval_missing";
  return null;
}

function createScimGroupRoleMappingService({ mappings = [], activeRoleKeys, ownerCeilings = {}, tenantActivations = {}, privilegedRoleKeys = DEFAULT_PRIVILEGED_ROLE_KEYS } = {}) {
  const byKey = new Map();
  for (const raw of mappings) {
    const mapping = normalizeMapping(raw);
    byKey.set(`${mapping.connection_id}:${mapping.external_group_id}:${mapping.mapping_version}`, mapping);
  }
  const options = { activeRoleKeys, ownerCeilings, tenantActivations, privilegedRoleKeys };
  return Object.freeze({
    resolveAssignments({ connection_id, connectionId, external_group_ids, externalGroupIds, mapping_version, mappingVersion, user_id, userId, tenant_id, tenantId } = {}) {
      const connection = connection_id || connectionId;
      const version = mapping_version || mappingVersion;
      const groups = external_group_ids || externalGroupIds || [];
      const assignments = [];
      const rejected = [];
      for (const external_group_id of groups) {
        const mapping = byKey.get(`${connection}:${external_group_id}:${version}`);
        if (!mapping) continue;
        const reasonCode = rejectReasonForMapping(mapping, options);
        if (reasonCode) { rejected.push({ reasonCode, connection_id: connection, external_group_id, mapping_version: version, canonical_role_key: mapping.canonical_role_key }); continue; }
        assignments.push({
          user_id: user_id || userId,
          canonical_role_key: mapping.canonical_role_key,
          provenance: {
            source_kind: SOURCE_KIND,
            connection_id: connection,
            external_group_id,
            mapping_id: mapping.id,
            mapping_version: mapping.mapping_version,
            canonical_role_key: mapping.canonical_role_key,
            tenant_id: tenant_id || tenantId || null,
            approval_id: mapping.approval_id,
            approved_by: mapping.approved_by,
            approved_at: mapping.approved_at,
          },
        });
      }
      return { assignments, rejected };
    },
    validateMapping(input) {
      const mapping = normalizeMapping(input);
      const reasonCode = rejectReasonForMapping(mapping, options);
      if (reasonCode) throw mappingError(reasonCode, { connection_id: mapping.connection_id, external_group_id: mapping.external_group_id, mapping_version: mapping.mapping_version, canonical_role_key: mapping.canonical_role_key });
      return mapping;
    },
  });
}

function assertExternalGroupIdImmutable(previous, next) {
  const before = normalizeMapping(previous);
  const after = normalizeMapping(next);
  if (before.external_group_id && after.external_group_id && before.external_group_id !== after.external_group_id) {
    throw mappingError("scim_external_group_id_immutable", { previous: before.external_group_id, next: after.external_group_id });
  }
}

module.exports = { SOURCE_KIND, createScimGroupRoleMappingService, assertExternalGroupIdImmutable, mappingError };
