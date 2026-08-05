"use strict";

const { OWNER_PERMISSIONS, ORGANIZATION_PERMISSIONS } = require("../authz/runtime/active-permissions");

const CivitasSharedContract = Object.freeze({
  version: "2026-07-civitas-shared-contract-v1",
  logto: Object.freeze({
    issuer: "https://auth.didaxus.com",
    apiResource: "https://civitas.didaxus.com/api",
    managementApi: "https://auth.didaxus.com",
    organizationAudiencePrefix: "urn:logto:organization:",
  }),
  api: Object.freeze({
    publicUrl: "https://civitas.didaxus.com/api",
  }),
  auth: Object.freeze({
    global: Object.freeze({
      ownerRole: "owner_global",
      globalRoles: Object.freeze(["owner_global"]),
      permissions: Object.freeze({
        ownerProfileRead: OWNER_PERMISSIONS.profileRead,
        ownerOrganizationsRead: OWNER_PERMISSIONS.organizationsRead,
        ownerOrganizationsCreate: OWNER_PERMISSIONS.organizationsCreate,
        ownerRuntimeRead: OWNER_PERMISSIONS.runtimeRead,
        ownerRuntimeOperationsExecute: OWNER_PERMISSIONS.runtimeOperationsExecute,
        ownerWorkerQueuesRead: OWNER_PERMISSIONS.workerQueuesRead,
        ownerRoleLabelsManage: OWNER_PERMISSIONS.roleLabelsManage,
      }),
    }),
    organization: Object.freeze({
      reservedResource: "organization",
      documentPermissions: Object.freeze({ documentsRead: ORGANIZATION_PERMISSIONS.documentsRead, documentsCreate: ORGANIZATION_PERMISSIONS.documentsCreate }),
      roles: Object.freeze({ admin: "organization_admin", member: "organization_member" }),
    }),
    invariants: Object.freeze([
      "single_url_resource_indicator",
      "api_resource_matches_public_api_url",
      "global_tokens_must_not_include_organization_context",
      "organization_tokens_must_stay_organization_scoped",
    ]),
  }),
});

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = { CivitasSharedContract, deepClone };
