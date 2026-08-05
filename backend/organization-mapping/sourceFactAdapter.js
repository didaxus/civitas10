"use strict";
const { normalizeExternalIdentity } = require("../identity-federation/claimNormalizer");
const { redactEvidence } = require("./evidenceRedaction");
function normalizeSourceFacts(input = {}) {
  const normalized = normalizeExternalIdentity(input);
  return Object.freeze({ ...normalized, sourceConnectionId: input.sourceConnectionId || null, capturedAt: input.capturedAt || new Date().toISOString(), evidence: redactEvidence(normalized.redactedProfile) });
}
module.exports = { normalizeSourceFacts };
