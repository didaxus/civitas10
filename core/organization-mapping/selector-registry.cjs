"use strict";
const { defineRegistry } = require("./registry-utils.cjs");
const SELECTOR_REGISTRY_VERSION = "2026-08-civitas-organization-mapping-selectors-v2";
const mk=(key,valueType,cardinality,allowedOperators,evidenceClassification,resolverKind)=>({key,selectorId:key,status:"active",valueType,cardinality,allowedOperators,normalization:"typed_provider_normalization",caseSensitive:false,missingSemantics:"UNRESOLVED",nullSemantics:"UNRESOLVED",emptySemantics:"NO_MATCH",evidenceClassification,freshnessRequirement:"snapshot_current_or_unresolved",resolverKind,rawValueVisibility:"classification_controlled",retentionBehavior:"bounded_snapshot"});
const externalFactSelectors = Object.freeze([
  mk("oidc.claim","string","single_or_multi",["equals","not_equals","in","not_in","contains","exists","not_exists"],"sensitive_user_attribute","oidc_claim"),
  mk("saml.attribute","string","single_or_multi",["equals","not_equals","in","not_in","contains","exists","not_exists"],"sensitive_user_attribute","saml_attribute"),
  mk("scim.user_attribute","string","single",["equals","not_equals","in","not_in","exists","not_exists"],"sensitive_user_attribute","scim_user"),
  mk("scim.group","string","multi",["equals","in","contains","contains_any","contains_all","exists","not_exists"],"restricted_group_name","scim_group"),
  mk("scim.group_membership","string","multi",["equals","in","contains","contains_any","contains_all","exists","not_exists"],"restricted_group_name","scim_group_membership"),
  mk("ldap.attribute","string","single_or_multi",["equals","not_equals","starts_with","ends_with","exists","not_exists"],"sensitive_user_attribute","ldap_attribute"),
  mk("ldap.distinguished_name","string","single",["equals","starts_with","ends_with","exists","not_exists"],"stable_external_object_identifier","ldap_dn"),
  mk("ldap.organizational_unit","string","multi",["contains","contains_any","contains_all","is_descendant_of"],"source_object_display_name","ldap_ou"),
  mk("canonical.dimension_value","string","single",["equals","in","exists","not_exists"],"internal_canonical_identifier","canonical_dimension"),
  mk("canonical.structure_node","string","single",["equals","in","is_descendant_of","exists","not_exists"],"internal_canonical_identifier","canonical_structure"),
  mk("canonical.mapping_state","string","single",["equals","in"],"internal_canonical_identifier","mapping_state"),
  mk("source.connection","string","single",["equals","in","exists"],"stable_external_object_identifier","source_connection"),
]);
const selectorRegistry=defineRegistry({version:SELECTOR_REGISTRY_VERSION,entries:externalFactSelectors,key:"key"});
function getSelector(selectorId) { return selectorRegistry.get(selectorId); }
module.exports = { SELECTOR_REGISTRY_VERSION, externalFactSelectors, selectorRegistryHash:selectorRegistry.hash, selectorRegistry, getSelector };
