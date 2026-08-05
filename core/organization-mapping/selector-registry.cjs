"use strict";
const crypto = require("node:crypto");
const SELECTOR_REGISTRY_VERSION = "2026-08-civitas-organization-mapping-selectors-v1";
const externalFactSelectors = Object.freeze([
  Object.freeze({ selectorId: "external.tenant", factPath: "tenantId", authority: "directory", specificity: 100, pii: false }),
  Object.freeze({ selectorId: "external.provider", factPath: "provider", authority: "identity-provider", specificity: 30, pii: false }),
  Object.freeze({ selectorId: "external.subject", factPath: "externalSubjectId", authority: "identity-provider", specificity: 80, pii: true }),
  Object.freeze({ selectorId: "external.group", factPath: "externalGroupIds", authority: "directory", specificity: 70, pii: false, multiValue: true }),
  Object.freeze({ selectorId: "external.claim", factPath: "claims", authority: "identity-provider", specificity: 40, pii: true, parameterized: true }),
]);
const selectorRegistryHash = crypto.createHash("sha256").update(JSON.stringify({ SELECTOR_REGISTRY_VERSION, externalFactSelectors })).digest("hex");
function getSelector(selectorId) { return externalFactSelectors.find((selector) => selector.selectorId === selectorId) || null; }
module.exports = { SELECTOR_REGISTRY_VERSION, externalFactSelectors, selectorRegistryHash, getSelector };
