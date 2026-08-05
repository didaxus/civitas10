"use strict";
const { evidenceClassificationRegistry } = require("../../core/organization-mapping/registries.cjs");
const FIELD_CLASSIFICATION = Object.freeze({ displayName:"source_object_display_name", name:"source_object_display_name", email:"sensitive_user_attribute", phone:"sensitive_user_attribute", address:"sensitive_user_attribute", subject:"user_identifier", groups:"restricted_group_name", groupCount:"restricted_group_count", stableSourceObjectId:"stable_external_object_identifier", token:"secret_token_assertion_material", accessToken:"secret_token_assertion_material", idToken:"secret_token_assertion_material", assertion:"secret_token_assertion_material", password:"secret_token_assertion_material", authorization:"secret_token_assertion_material", connectorSecret:"secret_token_assertion_material" });
function filterEvidence(value,{permissions=[]}={}) {
  const scopes=new Set(permissions); if(!value||typeof value!=="object") return Object.freeze({}); const safe=[];
  for(const [key,item] of Object.entries(value)) { const classification=evidenceClassificationRegistry.get(FIELD_CLASSIFICATION[key]||"connector_diagnostics"); if(!classification||classification.redaction==="omit") continue; if(!classification.audiences.some((permission)=>scopes.has(permission))) continue; safe.push([key,classification.redaction==="classify"?"[redacted]":item]); }
  return Object.freeze(Object.fromEntries(safe));
}
function redactEvidence(value,options) { return filterEvidence(value,options); }
module.exports={FIELD_CLASSIFICATION,filterEvidence,redactEvidence};
