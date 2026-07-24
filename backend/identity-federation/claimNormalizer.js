"use strict";

const GROUP_OVERAGE_KEYS = new Set(["groups_overage", "hasgroups", "_claim_names"]);
const REQUIRED_CLAIMS = Object.freeze(["provider", "subject", "tenantId"]);

function hasGroupOverage(profile = {}) {
  if (profile.groupsComplete === false || profile.groups_overage === true || profile.groupOverage === true) return true;
  if (profile.hasgroups === true) return true;
  if (profile._claim_names && (profile._claim_names.groups || profile._claim_names.roles)) return true;
  return false;
}

function redactProfile(profile = {}) {
  const redacted = {};
  for (const [key, value] of Object.entries(profile)) {
    if (["email", "name", "given_name", "family_name", "picture", "phone_number", "address"].includes(key)) redacted[key] = "[redacted]";
    else if (GROUP_OVERAGE_KEYS.has(key)) redacted[key] = "[redacted-overage-marker]";
    else redacted[key] = value;
  }
  return redacted;
}

function normalizeExternalIdentity(input = {}) {
  const profile = input.profile || input.claims || input;
  const provider = input.provider || profile.provider || profile.iss || null;
  const subject = input.subject || profile.sub || profile.id || null;
  const tenantId = input.tenantId || profile.tenant_id || profile.organization_id || profile.organizationId || null;
  const externalGroupIds = Array.from(new Set([...(profile.groups || []), ...(profile.external_groups || [])].map(String).filter(Boolean))).sort();
  const missingClaims = REQUIRED_CLAIMS.filter((claim) => !({ provider, subject, tenantId })[claim]);
  const overage = hasGroupOverage(profile);
  const claimsComplete = missingClaims.length === 0 && !overage && (Array.isArray(profile.groups) || Array.isArray(profile.external_groups));
  const incompletenessReason = overage ? "overage" : missingClaims.length ? "required_claims_missing" : claimsComplete ? null : "groups_missing";
  return Object.freeze({
    schemaVersion: "civitas-normalized-external-identity/v1",
    provider,
    externalSubjectId: subject,
    tenantId,
    externalGroupIds,
    claimsComplete,
    incompletenessReason,
    missingClaims,
    redactedProfile: redactProfile(profile),
  });
}

module.exports = { normalizeExternalIdentity, ClaimNormalizer: { normalizeExternalIdentity } };
