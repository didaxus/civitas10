"use strict";
const ENTITLEMENT_REASON_CODES = Object.freeze({
  ENTITLEMENT_ALLOWED: "entitlement_allowed",
  TOKEN_SCOPE_MISSING: "token_scope_missing",
  ORGANIZATION_ROLE_UNKNOWN: "organization_role_unknown",
  ROLE_PERMISSION_MISSING: "role_permission_missing",
  OWNER_CEILING_MISSING: "owner_ceiling_missing",
  OWNER_CEILING_DENIED: "owner_ceiling_denied",
  TENANT_ACTIVATION_MISSING: "tenant_activation_missing",
  TENANT_ACTIVATION_DENIED: "tenant_activation_denied",
  TENANT_ACTIVATION_EXCEEDS_OWNER_CEILING: "tenant_activation_exceeds_owner_ceiling",
  TENANT_ACTIVATION_LOCKED: "tenant_activation_locked",
  AUTHORIZATION_SNAPSHOT_STALE: "authorization_snapshot_stale",
  AUTHORIZATION_POLICY_UNAVAILABLE: "authorization_policy_unavailable",
  AUTHORIZATION_POLICY_VERSION_CONFLICT: "authorization_policy_version_conflict",
  RUNTIME_OPERATION_UNAVAILABLE: "runtime_operation_unavailable",
});
module.exports = { ENTITLEMENT_REASON_CODES };
