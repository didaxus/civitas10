"use strict";
const MAPPING_REASON_CODES = Object.freeze({
  MATCHED: "mapping_matched",
  NOT_MATCHED: "mapping_not_matched",
  AMBIGUOUS: "mapping_ambiguous",
  INCOMPLETE_FACTS: "mapping_external_facts_incomplete",
  STALE_FACTS: "mapping_external_facts_stale",
  TENANT_MISMATCH: "mapping_tenant_mismatch",
  SELECTOR_UNKNOWN: "mapping_selector_unknown",
  DIMENSION_UNKNOWN: "mapping_dimension_unknown",
  CONFLICT: "mapping_conflict",
  UNSUPPORTED_OPERATOR: "mapping_operator_unsupported",
  UNSAFE_GRANT_FIELD: "mapping_unsafe_grant_field",
});
module.exports = { MAPPING_REASON_CODES };
