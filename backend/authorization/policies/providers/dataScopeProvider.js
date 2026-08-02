"use strict";
function createUnavailableDataScopeProvider() { return { async evaluate() { return { status: "unavailable" }; } }; }
function createDataScopePolicyProvider({ evaluator } = {}) {
  if (!evaluator || typeof evaluator.evaluate !== "function") throw new TypeError("Data scope evaluator is required");
  return { async evaluate(input) { const result = await evaluator.evaluate({ organizationId:input.organizationId, principal:{ ...input.principal, rolePaths:input.rolePaths || input.principal?.rolePaths || [] }, permission:input.permission, capability:input.capability }); return { ...result, status:result.allowed ? "valid" : "denied", strategy:result.constraint?.kind }; } };
}
module.exports = { createUnavailableDataScopeProvider, createDataScopePolicyProvider };
