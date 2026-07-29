"use strict";

const { authorize } = require("../authorize");
const { createTokenMembershipProvider, createStaticResourceOwnershipProvider, createAuditReadinessProvider } = require("../providers");
const { buildPrincipalForRest } = require("../../principalBuilder");

function defaultProviders(overrides = {}) {
  return {
    membershipProvider: overrides.membershipProvider || createTokenMembershipProvider(),
    resourceOwnershipProvider: overrides.resourceOwnershipProvider || createStaticResourceOwnershipProvider(),
    auditReadinessProvider: overrides.auditReadinessProvider || createAuditReadinessProvider(),
    ...overrides,
  };
}

function defaultDenialResponder(res, { status, error, code, decisionId }) {
  return res.status(status).json({ error, code, ...(decisionId ? { decisionId } : {}) });
}

function requireAuthorization({ permission, actionId, surface, operation, policies = [], providers, targetResolver, resourceResolver, auditIntentResolver, registry, denialResponder = defaultDenialResponder, onDecision } = {}) {
  if (!permission || !surface || !operation) throw new Error("requireAuthorization requires permission, surface and operation");
  if (!Array.isArray(policies)) throw new Error("requireAuthorization policies must be declared server-side as an array");
  return async (req, res, next) => {
    if (!req.auth && !req.user) return denialResponder(res, { status: 401, error: "Unauthorized", code: "authentication_required" });
    try {
      const target = targetResolver ? await targetResolver(req) : undefined;
      const resource = resourceResolver ? await resourceResolver(req) : undefined;
      const facts = {};
      if (auditIntentResolver) facts.auditIntent = await auditIntentResolver(req);
      const organizationId = req.params?.organizationId || req.user?.organizationId || req.auth?.organizationId;
      const principal = await buildPrincipalForRest(req, { permissionId: permission, surface: "rest", organizationId });
      const decision = await authorize({ principal, permission, actionId, surface, operation, organizationId, routeId: req.routeId || actionId || permission, target, resource, policies, providers: defaultProviders(providers), registry, facts });
      req.authorizationDecision = decision;
      if (onDecision) await onDecision(req, decision);
      if (decision.allowed) return next();
      return denialResponder(res, { status: 403, error: "Forbidden", code: decision.reasonCode, decisionId: decision.decisionId });
    } catch (error) {
      if (error?.name === "PrincipalBuildError") return denialResponder(res, { status: error.status, error: error.status === 401 ? "Unauthorized" : "Forbidden", code: error.code });
      return res.status(500).json({ error: "AuthorizationPolicyError", code: "policy_evaluation_failed" });
    }
  };
}

module.exports = { requireAuthorization, defaultProviders, defaultDenialResponder };
