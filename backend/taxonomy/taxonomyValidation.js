"use strict";
const { TAXONOMY_REASON_CODES } = require("./taxonomyReasonCodes");
const { TAXONOMY_DIMENSIONS } = require('../authorization/data-scope/taxonomyDimensionsRegistry');
const KNOWN_DIMENSIONS = Object.freeze(Object.fromEntries(Object.values(TAXONOMY_DIMENSIONS).map((dimension) => [dimension.key, Object.freeze({ ...dimension, hierarchyAllowed: dimension.hierarchyBehavior !== 'none', multiAssignmentAllowed: dimension.allowMultiple, capabilities: dimension.allowedCapabilities })])));
const VALUE_STATUSES = Object.freeze(["draft", "active", "deprecating", "archived"]);
const CHANGE_CLASSES = Object.freeze(["presentation-only", "taxonomy-semantic", "authorization-affecting"]);
function taxonomyError(code, message = code, safeDetails) { return Object.assign(new Error(message), { code, safeDetails }); }
function validateDimensionKey(key) {
  if (!KNOWN_DIMENSIONS[key]) throw taxonomyError(TAXONOMY_REASON_CODES.DIMENSION_UNKNOWN);
  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(key) || /(scope|role|permission|moodle|buddyboss|stripe|logto)/.test(key)) throw taxonomyError(TAXONOMY_REASON_CODES.DIMENSION_UNKNOWN);
  return key;
}
function validateStableKey(key) { if (!/^[a-z0-9][a-z0-9_-]*$/.test(String(key || ""))) throw taxonomyError(TAXONOMY_REASON_CODES.STABLE_KEY_INVALID); return key; }
function validateMetadata(metadata = {}) {
  if (!metadata || Array.isArray(metadata) || typeof metadata !== "object") throw taxonomyError("taxonomy_metadata_invalid");
  const blob = JSON.stringify(metadata).toLowerCase();
  if (/(access[_-]?token|refresh[_-]?token|password|secret|jwt|permission|scope)/.test(blob)) throw taxonomyError("taxonomy_metadata_secret_or_permission");
  return metadata;
}
function validateExternalRef(ref) { if (ref && /(token|secret|password|jwt|refresh)/i.test(ref)) throw taxonomyError(TAXONOMY_REASON_CODES.EXTERNAL_REF_INVALID); return ref || null; }
function validateStatus(status) { if (!VALUE_STATUSES.includes(status)) throw taxonomyError(TAXONOMY_REASON_CODES.PUBLISH_VALIDATION_FAILED); return status; }
module.exports = { KNOWN_DIMENSIONS, VALUE_STATUSES, CHANGE_CLASSES, taxonomyError, validateDimensionKey, validateStableKey, validateMetadata, validateExternalRef, validateStatus };
