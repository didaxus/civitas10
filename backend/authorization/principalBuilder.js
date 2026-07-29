"use strict";

const crypto = require("node:crypto");

const PRINCIPAL_SCHEMA_VERSION = "civitas-principal/v2";
const ROLE_PATH_SCHEMA_VERSION = "civitas-role-path/v2";
const AUTHZ_CONTRACT_VERSION = "civitas-authorization-foundation/v2";
const MEMBERSHIP_CLAIM = "https://civitas.didaxus.com/claims/organization_membership_id";
const ROLES_CLAIM = "https://civitas.didaxus.com/claims/organization_role_ids";
const CONTRACT_CLAIM = "https://civitas.didaxus.com/claims/authz_contract_version";

class PrincipalBuildError extends Error {
  constructor(code, message, status = 403) {
    super(message);
    this.name = "PrincipalBuildError";
    this.code = code;
    this.status = status;
  }
}

const reject = (code, message, status) => { throw new PrincipalBuildError(code, message, status); };
const strings = (value) => Array.isArray(value) ? [...new Set(value.filter((item) => typeof item === "string" && item))] : [];
const secondsToIso = (value) => new Date(Number(value) * 1000).toISOString();
const sameSet = (left, right) => left.length === right.length && left.every((value) => right.includes(value));

/**
 * The one authorization-boundary principal builder. `validatedToken` must be the
 * result of signature/issuer/audience validation. `binding` must come from a
 * server-side membership store (it must never be assembled from request input).
 */
async function buildAuthorizationPrincipal({ validatedToken, binding, resolveBinding, organizationId, permissionId, surface, now = new Date(), maxBindingAgeMs = 60_000 } = {}) {
  if (!validatedToken?.validated) reject("token_not_validated", "A cryptographically validated token is required", 401);
  const claims = validatedToken.claims || {};
  const subject = claims.sub;
  const tokenOrganizationId = claims.organization_id;
  const membershipBindingId = claims[MEMBERSHIP_CLAIM];
  const tokenRoles = strings(claims[ROLES_CLAIM]);
  if (!subject) reject("subject_required", "Token subject is required", 401);
  if (!tokenOrganizationId) reject("organization_required", "Organization claim is required");
  if (!membershipBindingId) reject("membership_required", "Membership claim is required");
  if (claims[CONTRACT_CLAIM] !== AUTHZ_CONTRACT_VERSION) reject("contract_version_mismatch", "Authorization contract version is missing or unsupported");
  if (organizationId && organizationId !== tokenOrganizationId) reject("organization_mismatch", "Token organization does not match the requested organization");

  const trusted = binding || await resolveBinding?.({ subject, organizationId: tokenOrganizationId, membershipBindingId });
  if (!trusted?.serverTrusted) reject("membership_unavailable", "A trusted server-side membership binding is required");
  if (trusted.membershipBindingId !== membershipBindingId) reject("membership_mismatch", "Token and binding membership do not match");
  if (trusted.subject !== subject) reject("membership_subject_mismatch", "Membership does not belong to the token subject");
  if (trusted.organizationId !== tokenOrganizationId) reject("membership_organization_mismatch", "Membership does not belong to the token organization");
  if (trusted.membershipState !== "active") reject(trusted.membershipState === "revoked" ? "membership_revoked" : "membership_stale", "Membership is not active");
  if (!Number.isInteger(trusted.snapshotVersion) || trusted.snapshotVersion < 1 || claims.authz_snapshot_version !== trusted.snapshotVersion) reject("snapshot_version_mismatch", "Authorization snapshot is missing or stale");
  if (!trusted.bindingRecordVersion || !trusted.rolePotentialVersion) reject("contract_version_missing", "Required membership contract versions are missing");
  const checkedAt = Date.parse(trusted.checkedAt || "");
  if (!Number.isFinite(checkedAt) || now.getTime() - checkedAt > maxBindingAgeMs || checkedAt > now.getTime()) reject("membership_stale", "Membership freshness check is stale");
  if (trusted.revokedAt && Date.parse(trusted.revokedAt) <= now.getTime()) reject("membership_revoked", "Membership has been revoked");

  const assignments = Array.isArray(trusted.roleAssignments) ? trusted.roleAssignments : [];
  const activeRoles = strings(assignments.filter((item) => item?.state === "active").map((item) => item.logtoRoleId));
  if (!tokenRoles.length || !sameSet(tokenRoles, activeRoles)) reject("role_assignment_mismatch", "Token roles do not match active server-side assignments");
  const scopes = new Set(typeof claims.scope === "string" ? claims.scope.split(/\s+/).filter(Boolean) : []);
  const rolePaths = assignments.map((assignment) => {
    const fragments = Array.isArray(assignment.fragments) ? assignment.fragments : [];
    const matchingFragments = fragments.filter((fragment) => fragment.surface === surface && fragment.permissions?.includes(permissionId));
    return {
      schemaVersion: ROLE_PATH_SCHEMA_VERSION,
      rolePathId: assignment.rolePathId,
      organizationId: trusted.organizationId,
      membershipBindingId: trusted.membershipBindingId,
      membershipState: trusted.membershipState,
      logtoRoleId: assignment.logtoRoleId,
      canonicalRoleId: assignment.canonicalRoleId,
      roleAssignmentState: assignment.state,
      permissionId,
      surface,
      fragments: matchingFragments.map(({ fragmentId, version }) => ({ fragmentId, version })),
      tokenScopePresent: scopes.has(permissionId),
      rolePotentialVersion: trusted.rolePotentialVersion,
      snapshotVersion: trusted.snapshotVersion,
    };
  });
  if (!rolePaths.some((path) => path.roleAssignmentState === "active" && path.fragments.length)) reject("role_surface_mismatch", "No complete role path grants the permission on this surface");

  return Object.freeze({
    schemaVersion: PRINCIPAL_SCHEMA_VERSION,
    principalId: `principal_${crypto.createHash("sha256").update(`${claims.iss}:${subject}:${membershipBindingId}:${trusted.snapshotVersion}`).digest("hex").slice(0, 24)}`,
    principalType: trusted.principalType || "user",
    subject,
    issuer: claims.iss,
    audiences: Array.isArray(claims.aud) ? claims.aud : [claims.aud].filter(Boolean),
    organizationId: trusted.organizationId,
    membershipBindingId: trusted.membershipBindingId,
    membershipBindingSource: trusted.source || "civitas_server_binding",
    organizationRoleIds: activeRoles,
    scopes: Object.freeze([...scopes]),
    rolePaths: Object.freeze(rolePaths.map(Object.freeze)),
    authzContractVersion: AUTHZ_CONTRACT_VERSION,
    issuedAt: secondsToIso(claims.iat),
    expiresAt: secondsToIso(claims.exp),
    snapshotVersion: trusted.snapshotVersion,
    provenance: Object.freeze({ bindingRecordVersion: trusted.bindingRecordVersion, resolvedAt: now.toISOString() }),
  });
}

function validatedTokenFromAuth(auth = {}) {
  return { validated: auth.tokenValidated === true, claims: auth.claims };
}

async function buildPrincipalForRest(req, requirements = {}) {
  return buildAuthorizationPrincipal({ validatedToken: validatedTokenFromAuth(req.auth), binding: req.auth?.trustedMembershipBinding, organizationId: req.params?.organizationId, ...requirements });
}

async function buildPrincipalForWorker(context, requirements = {}) {
  return buildAuthorizationPrincipal({ validatedToken: context.validatedToken, binding: context.trustedMembershipBinding, resolveBinding: context.resolveMembershipBinding, ...requirements });
}

const buildPrincipalForMcp = buildPrincipalForWorker;

module.exports = { AUTHZ_CONTRACT_VERSION, MEMBERSHIP_CLAIM, ROLES_CLAIM, CONTRACT_CLAIM, PrincipalBuildError, buildAuthorizationPrincipal, buildPrincipalForRest, buildPrincipalForWorker, buildPrincipalForMcp };
