"use strict";
const { allow, deny } = require("../../policyResult");
const { POLICY_REASON_CODES } = require("../../reasonCodes");
const POLICY_ID = "authorization-data-scope-valid";
module.exports = Object.freeze({ id: POLICY_ID, version: "2026-07-v1", requiredFacts: ["dataScopeProvider"], supportedSurfaces: ["organization"], async evaluate(context) {
  const provider = context.providers?.dataScopeProvider;
  if (!provider?.evaluate) return deny(POLICY_ID, POLICY_REASON_CODES.POLICY_PROVIDER_MISSING);
  const result = await provider.evaluate({ organizationId: context.principal.organizationId, subject: context.principal.subject, principal:context.principal, rolePaths:context.rolePaths, permission: context.authorization.permission, capability:context.target?.capability, operation: context.request.operation, resource: context.resource });
  if (result.allowed === true || result.status === "valid") return allow(POLICY_ID, POLICY_REASON_CODES.AUTHORIZATION_ALLOWED, { strategy: result.strategy });
  if (result.status === "stale") return deny(POLICY_ID, POLICY_REASON_CODES.AUTHORIZATION_SNAPSHOT_STALE);
  return deny(POLICY_ID, POLICY_REASON_CODES.RESOURCE_NOT_FOUND_OR_NOT_ACCESSIBLE);
}});
